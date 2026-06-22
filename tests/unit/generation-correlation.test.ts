import { test } from "node:test";
import assert from "node:assert/strict";

import { createGenerationCorrelationService } from "../../src/backend/lifecycle/correlation.js";

test("generation correlation binds interceptor-first ordering", () => {
  const service = createGenerationCorrelationService();

  service.capturePendingFromInterceptor({
    chatId: "chat-1",
    generationType: "normal",
    provisionalRevision: 1,
    timestamp: "2026-06-22T00:00:00.000Z",
  });

  service.onGenerationStarted({
    generationId: "gen-1",
    chatId: "chat-1",
  });

  const record = service.getRecord("gen-1");
  assert.equal(record?.generationId, "gen-1");
  assert.equal(record?.generationType, "normal");
});

test("generation correlation binds start-event-first ordering", () => {
  const service = createGenerationCorrelationService();

  service.onGenerationStarted({
    generationId: "gen-2",
    chatId: "chat-2",
  });

  service.capturePendingFromInterceptor({
    chatId: "chat-2",
    generationType: "swipe",
    provisionalRevision: 2,
    timestamp: "2026-06-22T00:00:00.000Z",
  });

  const record = service.getRecord("gen-2");
  assert.equal(record?.generationId, "gen-2");
  assert.equal(record?.generationType, "swipe");
  assert.equal(record?.commitEligible, false);
});
