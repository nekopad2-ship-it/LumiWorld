import { test } from "node:test";
import assert from "node:assert/strict";

import { createPatchService } from "../../src/backend/patches/service.js";
import { createInMemoryStorage } from "../../src/backend/storage/memory-storage.js";
import { createDefaultSettings } from "../../src/shared/schema/settings.js";
import { createPatchEnvelope } from "../../src/shared/schema/patch.js";

test("patch service initializes a graph and rejects duplicate patch ids", async () => {
  const storage = createInMemoryStorage();
  const service = createPatchService({ storage });
  const settings = createDefaultSettings();

  const patch = createPatchEnvelope({
    patchId: "patch-1",
    chatId: "chat-1",
    baseRevision: 0,
    sourceTask: "phase_1_initialize",
    operations: [{ type: "initialize_graph", settings }],
    provenance: { source: "unit-test", detail: "initialize graph" },
  });

  const first = await service.applyPatch(patch);
  assert.equal(first.accepted, true);
  assert.equal(first.nextRevision, 1);

  const duplicate = await service.applyPatch(patch);
  assert.equal(duplicate.accepted, false);
  assert.equal(duplicate.reason, "duplicate_patch_id");
});

test("patch service rejects revision mismatches without mutating state", async () => {
  const storage = createInMemoryStorage();
  const service = createPatchService({ storage });
  const settings = createDefaultSettings();

  await service.applyPatch(
    createPatchEnvelope({
      patchId: "patch-1",
      chatId: "chat-1",
      baseRevision: 0,
      sourceTask: "phase_1_initialize",
      operations: [{ type: "initialize_graph", settings }],
      provenance: { source: "unit-test", detail: "initialize graph" },
    }),
  );

  const rejected = await service.applyPatch(
    createPatchEnvelope({
      patchId: "patch-2",
      chatId: "chat-1",
      baseRevision: 99,
      sourceTask: "phase_1_initialize",
      operations: [{ type: "persist_scene_impact", sceneImpact: null }],
      provenance: { source: "unit-test", detail: "bad revision" },
    }),
  );

  assert.equal(rejected.accepted, false);
  assert.equal(rejected.reason, "revision_mismatch");

  const graph = await service.getGraph("chat-1");
  assert.ok(graph);
  assert.equal(graph?.revision, 1);
});
