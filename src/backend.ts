import { isFrontendToBackendMessage, type BackendToFrontendMessage, type PermissionSnapshot, type UiSettings } from "./shared/messages";
import { parseCompactLedger, parseStateUpdateEnvelope, stripStateUpdateBlock } from "./shared/parsers";
import type { WorldGraph, WorldSummary } from "./shared/types";
import { buildWorldDigest, seedWorldGraph, summarizeWorld, applyStateUpdateToWorld } from "./shared/world";

const GRAPH_PATH = (chatId: string) => `worlds/${chatId}/graph.json`;
const DEBUG_PATH = (chatId: string) => `worlds/${chatId}/debug/last_failed_state_update.txt`;
const UI_SETTINGS_PATH = "settings/ui.json";
const CHAT_VARIABLE_KEY = "lwe_world_state";

type GenerationSession = {
  chatId?: string;
  targetMessageId?: string | null;
  messageId?: string | null;
};

const generationSessions = new Map<string, GenerationSession>();
const frontendChatByUser = new Map<string, string | null>();
const frontendUsersByChat = new Map<string, Set<string>>();
let activeChatId: string | null = null;

setupBackend();

function setupBackend(): void {
  spindle.onFrontendMessage(async (payload, userId) => {
    if (!isFrontendToBackendMessage(payload)) {
      return;
    }

    switch (payload.type) {
      case "GET_WORLD_GRAPH": {
        const chatId = payload.chatId ?? (await resolveActiveChatId()) ?? getTrackedChatId(userId);
        rememberFrontendChat(userId, chatId);
        if (chatId) {
          await ensureWorldGraph(chatId);
          await sendWorldGraphData(chatId, userId);
        } else {
          await sendWorldGraphData(null, userId);
        }
        break;
      }
      case "SAVE_UI_SETTINGS": {
        const current = await loadUiSettings(userId);
        const next: UiSettings = {
          widgetPosition: payload.ui.widgetPosition ?? current.widgetPosition,
          widgetVisible: payload.ui.widgetVisible ?? current.widgetVisible,
        };
        await saveUiSettings(next, userId);
        break;
      }
      case "OPEN_TRACKER": {
        sendFrontendMessage({ type: "OPEN_TRACKER" } satisfies BackendToFrontendMessage, userId);
        break;
      }
    }
  });
  spindle.log.info("LumiWorld backend loaded");

  spindle.on("CHAT_SWITCHED", async (payload) => {
    activeChatId = getPayloadChatId(payload) ?? activeChatId;
    if (!activeChatId) {
      return;
    }

    await ensureWorldGraph(activeChatId);
    await sendWorldGraphDataToTrackedUsers(activeChatId);
  });

  spindle.on("CHARACTER_MESSAGE_RENDERED", async (payload) => {
    const chatId = getPayloadChatId(payload);
    if (!chatId) {
      return;
    }

    activeChatId = chatId;
    await ensureWorldGraph(chatId);
  });

  spindle.on("GENERATION_STARTED", (payload) => {
    generationSessions.set(getGenerationKey(payload), {
      chatId: getPayloadChatId(payload),
      targetMessageId: payload?.targetMessageId ?? payload?.target_message_id ?? null,
      messageId: payload?.messageId ?? payload?.message_id ?? null,
    });
  });

  spindle.on("GENERATION_STOPPED", (payload) => {
    generationSessions.delete(getGenerationKey(payload));
  });

  spindle.on("GENERATION_ENDED", async (payload) => {
    const key = getGenerationKey(payload);
    const session = generationSessions.get(key);
    generationSessions.delete(key);

    if (session?.targetMessageId) {
      return;
    }

    const chatId = getPayloadChatId(payload) ?? session?.chatId;
    const messageId = payload?.messageId ?? payload?.message_id ?? session?.messageId;
    if (!chatId || !messageId) {
      return;
    }

    await processCompletedGeneration(chatId, messageId);
  });
}

async function processCompletedGeneration(chatId: string, messageId: string): Promise<void> {
  const graph = await ensureWorldGraph(chatId);
  if (!graph || !spindle.permissions.has("chat_mutation")) {
    return;
  }

  const messages = await spindle.chat.getMessages(chatId);
  const assistantMessage =
    messages.find((message) => message.id === messageId) ??
    [...messages].reverse().find((message) => message.role === "assistant");

  if (!assistantMessage) {
    return;
  }

  const parsedStateUpdate = parseStateUpdateEnvelope(assistantMessage.content);
  const strippedContent = stripStateUpdateBlock(assistantMessage.content);
  const ledger = parseCompactLedger(strippedContent);

  if (strippedContent !== assistantMessage.content) {
    await spindle.chat.updateMessage(chatId, assistantMessage.id, {
      content: strippedContent,
      skipChunkRebuild: true,
    });
  }

  if (!parsedStateUpdate.found || !parsedStateUpdate.parsed) {
    if (parsedStateUpdate.rawBlock) {
      await spindle.storage.write(DEBUG_PATH(chatId), parsedStateUpdate.rawBlock);
    }
    spindle.toast?.error?.("LumiWorld skipped this turn because the hidden state update was invalid.");
    spindle.log.warn(`LumiWorld: invalid or missing STATE_UPDATE: ${parsedStateUpdate.error ?? "unknown error"}`);
    return;
  }

  const next = applyStateUpdateToWorld(graph, parsedStateUpdate.parsed, ledger);
  await saveWorldGraph(next);
  await writeDigest(chatId, next);
  sendWorldUpdate(chatId, summarizeWorld(next));
}

async function ensureWorldGraph(chatId: string): Promise<WorldGraph | null> {
  const existing = await loadWorldGraph(chatId);
  if (existing) {
    return existing;
  }

  if (!spindle.permissions.has("characters")) {
    spindle.log.warn("LumiWorld: missing characters permission, cannot seed graph");
    return null;
  }

  const seedInput = await resolveSeedInput(chatId);
  if (!seedInput) {
    return null;
  }

  const graph = seedWorldGraph(seedInput);
  await saveWorldGraph(graph);
  await writeDigest(chatId, graph);
  return graph;
}

async function resolveSeedInput(chatId: string) {
  let characterId: string | undefined;
  let scenario: string | undefined;
  let fallbackName = "Unknown Principal";

  if (spindle.permissions.has("chats")) {
    const chat = await spindle.chats.get(chatId);
    characterId = chat?.characterId ?? chat?.character_id ?? undefined;
    scenario = chat?.scenario ?? undefined;
    fallbackName = chat?.name ?? fallbackName;
  }

  if (!characterId) {
    return {
      chatId,
      characterId: undefined,
      characterName: fallbackName,
      characterDescription: undefined,
      scenario,
    };
  }

  const character = await spindle.characters.get(characterId);
  return {
    chatId,
    characterId,
    characterName: character?.name ?? fallbackName,
    characterDescription: character?.description ?? undefined,
    scenario: character?.scenario ?? scenario,
  };
}

async function loadWorldGraph(chatId: string): Promise<WorldGraph | null> {
  const raw = await spindle.storage.read(GRAPH_PATH(chatId)).catch(() => "");
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as WorldGraph;
  } catch (error) {
    spindle.log.error(`LumiWorld: failed to parse graph: ${formatError(error)}`);
    return null;
  }
}

async function saveWorldGraph(graph: WorldGraph): Promise<void> {
  await spindle.storage.write(GRAPH_PATH(graph.chatId), JSON.stringify(graph, null, 2));
}

async function writeDigest(chatId: string, graph: WorldGraph): Promise<void> {
  await spindle.variables.chat.set(chatId, CHAT_VARIABLE_KEY, buildWorldDigest(graph));
}

async function loadUiSettings(userId?: string): Promise<UiSettings> {
  const fallback: UiSettings = {
    widgetPosition: { x: 24, y: 24 },
    widgetVisible: true,
  };
  try {
    return await spindle.userStorage.getJson<UiSettings>(UI_SETTINGS_PATH, withUserScope({ fallback }, userId));
  } catch (error) {
    spindle.log.error(`LumiWorld: failed to parse UI settings: ${formatError(error)}`);
    return fallback;
  }
}

async function saveUiSettings(settings: UiSettings, userId?: string): Promise<void> {
  await spindle.userStorage.setJson(UI_SETTINGS_PATH, settings, withUserScope({ indent: 2 }, userId));
}

async function sendWorldGraphData(chatId: string | null, userId?: string): Promise<void> {
  const graph = chatId ? await loadWorldGraph(chatId) : null;
  const payload: BackendToFrontendMessage = {
    type: "WORLD_GRAPH_DATA",
    chatId,
    graph,
    summary: summarizeWorld(graph),
    permissions: getPermissionSnapshot(),
    ui: await loadUiSettings(userId),
  };
  sendFrontendMessage(payload, userId);
}

function getPermissionSnapshot(): PermissionSnapshot {
  return {
    generation: spindle.permissions.has("generation"),
    characters: spindle.permissions.has("characters"),
    chats: spindle.permissions.has("chats"),
    chatMutation: spindle.permissions.has("chat_mutation"),
    uiPanels: spindle.permissions.has("ui_panels"),
  };
}

function getGenerationKey(payload: any): string {
  return String(payload?.generationId ?? payload?.generation_id ?? payload?.id ?? payload?.chatId ?? "unknown");
}

function sendWorldUpdate(chatId: string, summary: WorldSummary): void {
  const userIds = getTrackedUserIds(chatId);
  if (userIds.length === 0) {
    return;
  }

  const payload = {
    type: "WORLD_UPDATED",
    chatId,
    summary,
  } satisfies BackendToFrontendMessage;

  for (const userId of userIds) {
    sendFrontendMessage(payload, userId);
  }
}

async function sendWorldGraphDataToTrackedUsers(chatId: string): Promise<void> {
  const userIds = getTrackedUserIds(chatId);
  for (const userId of userIds) {
    await sendWorldGraphData(chatId, userId);
  }
}

function sendFrontendMessage(payload: BackendToFrontendMessage, userId?: string): void {
  if (userId) {
    spindle.sendToFrontend(payload, userId);
    return;
  }

  spindle.sendToFrontend(payload);
}

function getPayloadChatId(payload: any): string | null {
  return payload?.chatId ?? payload?.chat_id ?? null;
}

function getTrackedChatId(userId?: string): string | null {
  if (!userId) {
    return null;
  }

  return frontendChatByUser.get(userId) ?? null;
}

function getTrackedUserIds(chatId: string): string[] {
  return [...(frontendUsersByChat.get(chatId) ?? [])];
}

function rememberFrontendChat(userId: string | undefined, chatId: string | null): void {
  if (!userId) {
    return;
  }

  const previousChatId = frontendChatByUser.get(userId) ?? null;
  if (previousChatId === chatId) {
    return;
  }

  if (previousChatId) {
    const previousUsers = frontendUsersByChat.get(previousChatId);
    previousUsers?.delete(userId);
    if (previousUsers && previousUsers.size === 0) {
      frontendUsersByChat.delete(previousChatId);
    }
  }

  if (!chatId) {
    frontendChatByUser.delete(userId);
    return;
  }

  const users = frontendUsersByChat.get(chatId) ?? new Set<string>();
  users.add(userId);
  frontendUsersByChat.set(chatId, users);
  frontendChatByUser.set(userId, chatId);
}

async function resolveActiveChatId(): Promise<string | null> {
  if (activeChatId) {
    return activeChatId;
  }

  if (!spindle.permissions.has("chats")) {
    return null;
  }

  const active = await spindle.chats.getActive();
  activeChatId = active?.id ?? null;
  return activeChatId;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function withUserScope<T extends { userId?: string }>(options: T, userId?: string): T {
  if (!userId) {
    return options;
  }

  return {
    ...options,
    userId,
  };
}
