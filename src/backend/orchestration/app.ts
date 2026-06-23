import { isFrontendToBackendMessage } from "../../shared/contracts/frontend-messages.js";
import { createPatchEnvelope } from "../../shared/schema/patch.js";
import {
  createDefaultFrontendSettings,
  createDefaultSettings,
} from "../../shared/schema/settings.js";
import type {
  GenerationType,
  PendingGenerationMetadata,
} from "../../shared/types/lwe.js";
import { createCommitGuard } from "../lifecycle/commit-guard.js";
import { createGenerationCorrelationService } from "../lifecycle/correlation.js";
import { createStateExtractor } from "../extraction/service.js";
import { createPatchService } from "../patches/service.js";
import {
  buildSceneImpactSystemMessage,
  buildStaticSceneImpact,
} from "../scene-impact/static-impact.js";
import {
  createSpindleStorage,
  createFrontendSettingsRepository,
} from "../storage/spindle-storage.js";
import type { SpindleAPI } from "lumiverse-spindle-types";

export function createBackendApp(spindle: SpindleAPI) {
  const storage = createSpindleStorage(spindle.storage);
  const settingsRepository = createFrontendSettingsRepository(
    spindle.userStorage,
  );
  const patchService = createPatchService({ storage });
  const generationCorrelation = createGenerationCorrelationService();
  const commitGuard = createCommitGuard({
    correlationService: generationCorrelation,
  });

  // Default sidecar caller — returns empty extraction.
  // In Phase 3+, this will use the configured sidecar connection.
  const extractorSidecarCaller = (prompt: string): Promise<string> => {
    void prompt;
    return Promise.resolve(
      JSON.stringify({
        entities: [],
        locations: [],
        events: [],
        timeCue: null,
        committedFacts: [],
        relationships: [],
      }),
    );
  };

  const stateExtractor = createStateExtractor({
    applyPatch: patchService.applyPatch.bind(patchService),
    sidecarCaller: extractorSidecarCaller,
  });

  async function ensureGraph(chatId: string): Promise<void> {
    const existing = await patchService.getGraph(chatId);
    if (existing) {
      return;
    }

    await patchService.applyPatch(
      createPatchEnvelope({
        patchId: `init:${chatId}`,
        chatId,
        baseRevision: 0,
        sourceTask: "phase_1_initialize",
        operations: [
          { type: "initialize_graph", settings: createDefaultSettings() },
        ],
        provenance: { source: "backend-app", detail: "ensure graph exists" },
      }),
    );
  }

  async function sendBootstrap(
    chatId: string | null,
    userId?: string,
  ): Promise<void> {
    const settings =
      (await settingsRepository.load(userId)) ??
      createDefaultFrontendSettings();
    const graph = chatId ? await patchService.getGraph(chatId) : null;
    spindle.sendToFrontend(
      {
        type: "BOOTSTRAP_STATE",
        graph,
        settings,
        debugEnabled: Boolean(graph?.settingsSnapshot?.debug.enabled),
      },
      userId,
    );
  }

  async function validateDryRun(
    chatId: string,
    userId?: string,
  ): Promise<void> {
    if (!spindle.generate?.dryRun) {
      return;
    }
    try {
      await spindle.generate.dryRun({ chatId }, userId);
    } catch (error) {
      spindle.log.warn(
        `LWE Scene Impact dry run validation failed: ${String(error)}`,
      );
    }
  }

  async function handleFrontendMessage(
    payload: unknown,
    userId?: string,
  ): Promise<void> {
    if (!isFrontendToBackendMessage(payload)) {
      return;
    }

    switch (payload.type) {
      case "REQUEST_BOOTSTRAP":
        if (payload.chatId) {
          await ensureGraph(payload.chatId);
          await validateDryRun(payload.chatId, userId);
        }
        await sendBootstrap(payload.chatId, userId);
        return;
      case "OPEN_TRACKER":
        spindle.sendToFrontend({ type: "OPEN_TRACKER" }, userId);
        return;
      case "SAVE_FRONTEND_SETTINGS":
        await settingsRepository.save(payload.settings, userId);
        return;
    }
  }

  spindle.onFrontendMessage((payload, userId) => {
    void handleFrontendMessage(payload, userId);
  });

  function readStringField(
    detail: Record<string, unknown>,
    ...keys: string[]
  ): string {
    for (const key of keys) {
      const value = detail[key];
      if (typeof value === "string" && value.length > 0) {
        return value;
      }
    }
    return "";
  }

  spindle.registerInterceptor(async (messages, context) => {
    const detail = context as {
      chatId?: string;
      generationType?: GenerationType;
    };
    const chatId = detail.chatId;
    const generationType = detail.generationType;
    if (!chatId || !generationType) {
      return { messages, breakdown: [] };
    }

    await ensureGraph(chatId);
    const graph = await patchService.getGraph(chatId);
    if (!graph) {
      return { messages, breakdown: [] };
    }

    const pending: PendingGenerationMetadata = {
      chatId,
      generationType,
      provisionalRevision: graph.revision,
      timestamp: new Date().toISOString(),
    };
    generationCorrelation.capturePendingFromInterceptor(pending);

    const impact = buildStaticSceneImpact(graph);
    const injected = buildSceneImpactSystemMessage(impact);
    await patchService.applyPatch(
      createPatchEnvelope({
        patchId: `impact:${chatId}:${pending.timestamp}`,
        chatId,
        baseRevision: graph.revision,
        sourceTask: "phase_1_static_scene_impact",
        operations: [{ type: "persist_scene_impact", sceneImpact: impact }],
        provenance: {
          source: "interceptor",
          detail: "persist static scene impact",
        },
        createdAt: pending.timestamp,
      }),
    );

    return {
      messages: [injected, ...messages],
      breakdown: [{ messageIndex: 0, name: "LWE Scene Impact" }],
    };
  });

  spindle.on("GENERATION_STARTED", (payload) => {
    const detail = payload as unknown as Record<string, unknown>;
    const generationId = readStringField(
      detail,
      "generationId",
      "generation_id",
    );
    const chatId = readStringField(detail, "chatId", "chat_id");
    if (generationId && chatId) {
      generationCorrelation.onGenerationStarted({ generationId, chatId });
    }
  });

  spindle.on("GENERATION_ENDED", (payload) => {
    const detail = payload as unknown as Record<string, unknown>;
    const generationId = readStringField(
      detail,
      "generationId",
      "generation_id",
    );
    const chatId = readStringField(detail, "chatId", "chat_id");
    if (generationId) {
      generationCorrelation.onGenerationEnded({ generationId });
    }

    // Trigger state extraction for commit-eligible generations
    if (generationId && chatId) {
      const decision = commitGuard.shouldCommit(generationId);
      if (decision.eligible) {
        const userMessage = readStringField(
          detail,
          "userMessage",
          "user_message",
          "userText",
          "user_text",
        );
        const assistantMessage = readStringField(
          detail,
          "assistantMessage",
          "assistant_message",
          "responseText",
          "response_text",
        );

        if (userMessage && assistantMessage) {
          const record = generationCorrelation.getRecord(generationId);
          const revision = record?.provisionalRevision ?? 1;

          // Fire-and-forget: do not block generation completion
          stateExtractor
            .extractAndApply({
              chatId,
              generationId,
              revision,
              userMessage,
              assistantMessage,
            })
            .then((result) => {
              if (!result.applied) {
                spindle.log.warn(
                  `LWE State Extraction failed: ${result.error ?? "unknown error"}`,
                );
              }
            })
            .catch((error: unknown) => {
              spindle.log.warn(`LWE Extraction crashed: ${String(error)}`);
            });
        }
      }
    }
  });

  spindle.on("GENERATION_STOPPED", (payload) => {
    const detail = payload as unknown as Record<string, unknown>;
    const generationId = readStringField(
      detail,
      "generationId",
      "generation_id",
    );
    if (generationId) {
      generationCorrelation.onGenerationStopped({ generationId });
    }
  });

  spindle.log.info("Living World Engine backend loaded");

  return {
    ensureGraph,
    sendBootstrap,
  };
}
