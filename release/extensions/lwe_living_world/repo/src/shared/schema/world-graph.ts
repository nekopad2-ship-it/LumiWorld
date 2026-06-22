import {
  assertArray,
  assertNumber,
  assertRecord,
  assertString,
} from "../validation/assert.js";
import type { LweSettings, WorldGraph } from "../types/lwe.js";

export const CURRENT_WORLD_GRAPH_SCHEMA_VERSION = 3;

export function createEmptyWorldGraph(input: {
  chatId: string;
  settings: LweSettings;
  now?: string;
}): WorldGraph {
  const now = input.now ?? new Date().toISOString();
  return {
    schemaVersion: CURRENT_WORLD_GRAPH_SCHEMA_VERSION,
    chatId: input.chatId,
    revision: 1,
    createdAt: now,
    updatedAt: now,
    mode: input.settings.operationMode,
    settingsSnapshot: input.settings,
    world: {
      clock: {
        currentTime: null,
        lastAdvanceSource: null,
      },
      locations: {},
      entities: {},
      relationships: {},
      events: [],
      actions: [],
      knowledge: [],
      profiles: {},
      factions: {},
      secrets: [],
      hooks: [],
    },
    sceneImpact: null,
    patchState: {
      appliedPatchIds: [],
      lastPatchId: null,
    },
    audit: {
      lastAcceptedPatchAt: null,
      lastRejectedPatchAt: null,
    },
  };
}

export function parseWorldGraph(value: unknown): WorldGraph {
  assertRecord(value, "World graph");
  assertNumber(value.schemaVersion, "World graph schemaVersion");
  assertString(value.chatId, "World graph chatId");
  assertNumber(value.revision, "World graph revision");
  assertString(value.createdAt, "World graph createdAt");
  assertString(value.updatedAt, "World graph updatedAt");
  assertRecord(value.world, "World graph world");
  assertRecord(value.patchState, "World graph patchState");
  assertArray(
    value.patchState.appliedPatchIds,
    "World graph patchState.appliedPatchIds",
  );
  return value as unknown as WorldGraph;
}
