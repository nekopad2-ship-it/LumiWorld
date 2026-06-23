import { test } from "node:test";
import assert from "node:assert/strict";

import { createGenerationCorrelationService } from "../../src/backend/lifecycle/correlation.js";
import { createCommitGuard } from "../../src/backend/lifecycle/commit-guard.js";

function makeServiceWithRecord(
  generationType: string,
  status: "started" | "ended" | "stopped" = "ended",
) {
  const correlationService = createGenerationCorrelationService();
  correlationService.capturePendingFromInterceptor({
    chatId: "chat-1",
    generationType: generationType as any,
    provisionalRevision: 1,
    timestamp: "2026-06-22T00:00:00.000Z",
  });
  correlationService.onGenerationStarted({
    generationId: "gen-1",
    chatId: "chat-1",
  });
  if (status === "ended") {
    correlationService.onGenerationEnded({ generationId: "gen-1" });
  } else if (status === "stopped") {
    correlationService.onGenerationStopped({ generationId: "gen-1" });
  }
  return correlationService;
}

test("normal generation type is eligible for commit", () => {
  const correlationService = makeServiceWithRecord("normal", "ended");
  const guard = createCommitGuard({ correlationService });
  const decision = guard.shouldCommit("gen-1");
  assert.equal(decision.eligible, true);
  assert.equal(decision.reason, "commit_eligible");
});

test("continue generation type is not eligible", () => {
  const correlationService = makeServiceWithRecord("continue", "ended");
  const guard = createCommitGuard({ correlationService });
  const decision = guard.shouldCommit("gen-1");
  assert.equal(decision.eligible, false);
  assert.equal(decision.reason, "non_eligible_generation_type");
});

test("regenerate generation type is not eligible", () => {
  const correlationService = makeServiceWithRecord("regenerate", "ended");
  const guard = createCommitGuard({ correlationService });
  const decision = guard.shouldCommit("gen-1");
  assert.equal(decision.eligible, false);
  assert.equal(decision.reason, "non_eligible_generation_type");
});

test("swipe generation type is not eligible", () => {
  const correlationService = makeServiceWithRecord("swipe", "ended");
  const guard = createCommitGuard({ correlationService });
  const decision = guard.shouldCommit("gen-1");
  assert.equal(decision.eligible, false);
  assert.equal(decision.reason, "non_eligible_generation_type");
});

test("impersonate generation type is not eligible", () => {
  const correlationService = makeServiceWithRecord("impersonate", "ended");
  const guard = createCommitGuard({ correlationService });
  const decision = guard.shouldCommit("gen-1");
  assert.equal(decision.eligible, false);
  assert.equal(decision.reason, "non_eligible_generation_type");
});

test("quiet generation type is not eligible", () => {
  const correlationService = makeServiceWithRecord("quiet", "ended");
  const guard = createCommitGuard({ correlationService });
  const decision = guard.shouldCommit("gen-1");
  assert.equal(decision.eligible, false);
  assert.equal(decision.reason, "non_eligible_generation_type");
});

test("internal generation type is not eligible", () => {
  const correlationService = makeServiceWithRecord("internal", "ended");
  const guard = createCommitGuard({ correlationService });
  const decision = guard.shouldCommit("gen-1");
  assert.equal(decision.eligible, false);
  assert.equal(decision.reason, "non_eligible_generation_type");
});

test("missing generation ID returns unknown_generation", () => {
  const correlationService = createGenerationCorrelationService();
  const guard = createCommitGuard({ correlationService });
  const decision = guard.shouldCommit("non-existent-id");
  assert.equal(decision.eligible, false);
  assert.equal(decision.reason, "unknown_generation");
});

test("generation still in progress (not ended) returns generation_in_progress", () => {
  const correlationService = makeServiceWithRecord("normal", "started");
  const guard = createCommitGuard({ correlationService });
  const decision = guard.shouldCommit("gen-1");
  assert.equal(decision.eligible, false);
  assert.equal(decision.reason, "generation_in_progress");
});
