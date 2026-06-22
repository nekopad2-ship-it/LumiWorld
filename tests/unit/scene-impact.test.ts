import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildStaticSceneImpact,
  buildSceneImpactSystemMessage,
} from "../../src/backend/scene-impact/static-impact.js";
import { createDefaultSettings } from "../../src/shared/schema/settings.js";
import { createEmptyWorldGraph } from "../../src/shared/schema/world-graph.js";

test("static scene impact stays preset-neutral and empty in phase 1", () => {
  const graph = createEmptyWorldGraph({
    chatId: "chat-1",
    settings: createDefaultSettings(),
  });

  const impact = buildStaticSceneImpact(graph);
  assert.equal(impact.time, null);
  assert.equal(impact.location, null);
  assert.deepEqual(impact.committedFacts, []);
  assert.deepEqual(impact.actionsInProgress, []);
  assert.deepEqual(impact.activeIntentions, []);
  assert.deepEqual(impact.knowledgeLimits, []);

  const message = buildSceneImpactSystemMessage(impact);
  assert.equal(message.role, "system");
  assert.match(message.content, /LWE_SCENE_IMPACT:/);
});
