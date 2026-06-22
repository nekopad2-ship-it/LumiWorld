import { test } from "node:test";
import assert from "node:assert/strict";

import { migrateWorldGraphDocument } from "../../src/backend/migrations/migrate.js";
import { CURRENT_WORLD_GRAPH_SCHEMA_VERSION } from "../../src/shared/schema/world-graph.js";

test("migration upgrades a legacy schema version transactionally", () => {
  const result = migrateWorldGraphDocument({
    schemaVersion: 2,
    revision: 1,
    chatId: "chat-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    mode: "observe_only",
    settingsSnapshot: null,
    world: {
      clock: { currentTime: null },
      locations: {},
      entities: {},
      relationships: {},
      events: [],
      actions: [],
      knowledge: [],
      profiles: {},
      factions: {},
      secrets: [],
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
  });

  assert.equal(result.graph.schemaVersion, CURRENT_WORLD_GRAPH_SCHEMA_VERSION);
  assert.equal(result.record.fromVersion, 2);
  assert.equal(result.record.toVersion, CURRENT_WORLD_GRAPH_SCHEMA_VERSION);
  assert.deepEqual(result.graph.world.hooks, []);
});

test("migration rejects unknown future versions", () => {
  assert.throws(
    () =>
      migrateWorldGraphDocument({
        schemaVersion: CURRENT_WORLD_GRAPH_SCHEMA_VERSION + 1,
      }),
    /future schema/i,
  );
});
