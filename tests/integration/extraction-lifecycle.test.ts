import { test } from "node:test";
import assert from "node:assert/strict";
import { createPatchService } from "../../src/backend/patches/service.js";
import { createInMemoryStorage } from "../../src/backend/storage/memory-storage.js";
import { createCommitGuard } from "../../src/backend/lifecycle/commit-guard.js";
import { createGenerationCorrelationService } from "../../src/backend/lifecycle/correlation.js";
import { createDefaultSettings } from "../../src/shared/schema/settings.js";
import { createPatchEnvelope } from "../../src/shared/schema/patch.js";

test("full lifecycle: interceptor -> guard allows extraction -> patch applied", async () => {
  const storage = createInMemoryStorage();
  const patchService = createPatchService({ storage });
  const correlation = createGenerationCorrelationService();
  const guard = createCommitGuard({ correlationService: correlation });

  await patchService.applyPatch(
    createPatchEnvelope({
      patchId: "init-life",
      chatId: "chat-life-1",
      baseRevision: 0,
      sourceTask: "test",
      operations: [
        { type: "initialize_graph", settings: createDefaultSettings() },
      ],
      provenance: { source: "test", detail: "init" },
    }),
  );

  // Simulate interceptor capturing pending metadata
  correlation.capturePendingFromInterceptor({
    chatId: "chat-life-1",
    generationType: "normal",
    provisionalRevision: 1,
    timestamp: "2026-06-22T00:00:00.000Z",
  });

  // Simulate generation start
  correlation.onGenerationStarted({
    generationId: "gen-life-1",
    chatId: "chat-life-1",
  });

  // Guard says "in progress"
  const duringGeneration = guard.shouldCommit("gen-life-1");
  assert.equal(duringGeneration.eligible, false);
  assert.equal(duringGeneration.reason, "generation_in_progress");

  // Simulate generation end
  correlation.onGenerationEnded({ generationId: "gen-life-1" });

  // Guard says "eligible"
  const afterGeneration = guard.shouldCommit("gen-life-1");
  assert.equal(afterGeneration.eligible, true);

  // Apply extraction patch (simulating what the extractor would do)
  const extractionPatch = createPatchEnvelope({
    patchId: "extract:chat-life-1:gen-life-1",
    chatId: "chat-life-1",
    baseRevision: 1,
    sourceTask: "state_extractor",
    operations: [
      {
        type: "upsert_entity",
        entity: {
          id: "test_char",
          kind: "npc",
          name: "Test",
          source: "system",
        },
      },
    ],
    provenance: { source: "test", detail: "extraction simulation" },
  });

  const extractResult = await patchService.applyPatch(extractionPatch);
  assert.equal(extractResult.accepted, true);

  // Verify the entity was added
  const graph = await patchService.getGraph("chat-life-1");
  assert.ok(graph?.world.entities["test_char"]);
  assert.equal(graph?.revision, 2);
});

test("full lifecycle: non-eligible generation never triggers extraction", async () => {
  const storage = createInMemoryStorage();
  const patchService = createPatchService({ storage });
  const correlation = createGenerationCorrelationService();
  const guard = createCommitGuard({ correlationService: correlation });

  await patchService.applyPatch(
    createPatchEnvelope({
      patchId: "init-life-swipe",
      chatId: "chat-life-swipe",
      baseRevision: 0,
      sourceTask: "test",
      operations: [
        { type: "initialize_graph", settings: createDefaultSettings() },
      ],
      provenance: { source: "test", detail: "init" },
    }),
  );

  correlation.capturePendingFromInterceptor({
    chatId: "chat-life-swipe",
    generationType: "swipe",
    provisionalRevision: 1,
    timestamp: "2026-06-22T00:00:00.000Z",
  });
  correlation.onGenerationStarted({
    generationId: "gen-swipe",
    chatId: "chat-life-swipe",
  });
  correlation.onGenerationEnded({ generationId: "gen-swipe" });

  const decision = guard.shouldCommit("gen-swipe");
  assert.equal(decision.eligible, false);
  assert.equal(decision.reason, "non_eligible_generation_type");

  // Verify graph is unchanged
  const graph = await patchService.getGraph("chat-life-swipe");
  assert.equal(graph?.revision, 1);
});
