import { test } from "node:test";
import assert from "node:assert/strict";

import { createDefaultSettings } from "../../src/shared/schema/settings.js";
import {
  CURRENT_WORLD_GRAPH_SCHEMA_VERSION,
  createEmptyWorldGraph,
  parseWorldGraph,
} from "../../src/shared/schema/world-graph.js";

test("world graph v3 initializes with revision 1 and empty phase-1 collections", () => {
  const graph = createEmptyWorldGraph({
    chatId: "chat-1",
    settings: createDefaultSettings(),
  });

  assert.equal(graph.schemaVersion, CURRENT_WORLD_GRAPH_SCHEMA_VERSION);
  assert.equal(graph.revision, 1);
  assert.equal(graph.chatId, "chat-1");
  assert.deepEqual(graph.world.entities, {});
  assert.deepEqual(graph.world.relationships, {});
  assert.deepEqual(graph.world.events, []);
  assert.deepEqual(graph.world.actions, []);
  assert.deepEqual(graph.world.knowledge, []);
  assert.deepEqual(graph.world.profiles, {});
  assert.deepEqual(graph.world.factions, {});
  assert.deepEqual(graph.world.secrets, []);
  assert.deepEqual(graph.world.hooks, []);
});

test("world graph parser rejects malformed data", () => {
  assert.throws(
    () =>
      parseWorldGraph({
        schemaVersion: 3,
        revision: "nope",
      }),
    /world graph/i,
  );
});
