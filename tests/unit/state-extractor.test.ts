import { test } from "node:test";
import assert from "node:assert/strict";
import { createStateExtractor } from "../../src/backend/extraction/service.js";
import { createPatchService } from "../../src/backend/patches/service.js";
import { createInMemoryStorage } from "../../src/backend/storage/memory-storage.js";
import { createDefaultSettings } from "../../src/shared/schema/settings.js";
import { createPatchEnvelope } from "../../src/shared/schema/patch.js";

test("state extractor no-ops when extraction returns empty result", async () => {
  const storage = createInMemoryStorage();
  const patchService = createPatchService({ storage });
  const settings = createDefaultSettings();

  await patchService.applyPatch(
    createPatchEnvelope({
      patchId: "init-se",
      chatId: "chat-se-1",
      baseRevision: 0,
      sourceTask: "test",
      operations: [{ type: "initialize_graph", settings }],
      provenance: { source: "test", detail: "init" },
    }),
  );

  let sidecarCalled = false;
  const extractor = createStateExtractor({
    applyPatch: patchService.applyPatch.bind(patchService),
    sidecarCaller: async () => {
      sidecarCalled = true;
      return JSON.stringify({
        entities: [],
        locations: [],
        events: [],
        timeCue: null,
        committedFacts: [],
        relationships: [],
      });
    },
  });

  const result = await extractor.extractAndApply({
    chatId: "chat-se-1",
    generationId: "gen-1",
    revision: 1,
    userMessage: "Hello",
    assistantMessage: "Hi there!",
  });

  assert.equal(sidecarCalled, true);
  assert.equal(result.applied, true);
  assert.equal(result.eventsCount, 0);
});

test("state extractor applies entity extraction via sidecar", async () => {
  const storage = createInMemoryStorage();
  const patchService = createPatchService({ storage });
  const settings = createDefaultSettings();

  await patchService.applyPatch(
    createPatchEnvelope({
      patchId: "init-se2",
      chatId: "chat-se-2",
      baseRevision: 0,
      sourceTask: "test",
      operations: [{ type: "initialize_graph", settings }],
      provenance: { source: "test", detail: "init" },
    }),
  );

  const extractor = createStateExtractor({
    applyPatch: patchService.applyPatch.bind(patchService),
    sidecarCaller: async () =>
      JSON.stringify({
        entities: [
          { id: "dena", kind: "npc", name: "Dena", source: "system" },
          {
            id: "market_square",
            kind: "location",
            name: "Market Square",
            source: "system",
          },
        ],
        locations: [{ id: "market_square", label: "Market Square" }],
        events: [
          {
            id: "evt_001",
            kind: "arrival",
            summary: "Dena arrived at the market",
            participants: ["dena"],
            locationId: "market_square",
          },
        ],
        timeCue: null,
        committedFacts: ["Dena is at the market"],
        relationships: [],
      }),
  });

  const result = await extractor.extractAndApply({
    chatId: "chat-se-2",
    generationId: "gen-2",
    revision: 1,
    userMessage: "Where is Dena?",
    assistantMessage: "Dena walked into the bustling market square.",
  });

  assert.equal(result.applied, true);
  assert.equal(result.eventsCount, 5); // 2 entities + 1 location + 1 event + 1 fact = 5 operations

  const graph = await patchService.getGraph("chat-se-2");
  assert.ok(graph?.world.entities["dena"]);
  assert.ok(graph?.world.locations["market_square"]);
  assert.equal(graph?.world.events.length, 2); // 1 from append_event + 1 from append_committed_fact
});

test("state extractor handles sidecar returning malformed JSON", async () => {
  const storage = createInMemoryStorage();
  const patchService = createPatchService({ storage });
  const settings = createDefaultSettings();

  await patchService.applyPatch(
    createPatchEnvelope({
      patchId: "init-se3",
      chatId: "chat-se-3",
      baseRevision: 0,
      sourceTask: "test",
      operations: [{ type: "initialize_graph", settings }],
      provenance: { source: "test", detail: "init" },
    }),
  );

  const extractor = createStateExtractor({
    applyPatch: patchService.applyPatch.bind(patchService),
    sidecarCaller: async () => "not valid json{{{",
  });

  const result = await extractor.extractAndApply({
    chatId: "chat-se-3",
    generationId: "gen-3",
    revision: 1,
    userMessage: "Hello",
    assistantMessage: "Hi",
  });

  assert.equal(result.applied, false);
  assert.ok(result.error);
  assert.match(result.error, /json/i);
});

test("state extractor rejects extraction with validation errors", async () => {
  const storage = createInMemoryStorage();
  const patchService = createPatchService({ storage });
  const settings = createDefaultSettings();

  await patchService.applyPatch(
    createPatchEnvelope({
      patchId: "init-se4",
      chatId: "chat-se-4",
      baseRevision: 0,
      sourceTask: "test",
      operations: [{ type: "initialize_graph", settings }],
      provenance: { source: "test", detail: "init" },
    }),
  );

  const extractor = createStateExtractor({
    applyPatch: patchService.applyPatch.bind(patchService),
    sidecarCaller: async () =>
      JSON.stringify({
        entities: [
          { id: "bad", kind: "invalid_kind", name: "Bad", source: "system" },
        ],
        locations: [],
        events: [],
        timeCue: null,
        committedFacts: [],
        relationships: [],
      }),
  });

  const result = await extractor.extractAndApply({
    chatId: "chat-se-4",
    generationId: "gen-4",
    revision: 1,
    userMessage: "Hello",
    assistantMessage: "Hi",
  });

  assert.equal(result.applied, false);
  assert.ok(result.error);
  assert.match(result.error, /kind/i);
});

test("state extractor handles sidecar throwing an error", async () => {
  const storage = createInMemoryStorage();
  const patchService = createPatchService({ storage });
  const settings = createDefaultSettings();

  await patchService.applyPatch(
    createPatchEnvelope({
      patchId: "init-se5",
      chatId: "chat-se-5",
      baseRevision: 0,
      sourceTask: "test",
      operations: [{ type: "initialize_graph", settings }],
      provenance: { source: "test", detail: "init" },
    }),
  );

  const extractor = createStateExtractor({
    applyPatch: patchService.applyPatch.bind(patchService),
    sidecarCaller: async () => {
      throw new Error("Network failure");
    },
  });

  const result = await extractor.extractAndApply({
    chatId: "chat-se-5",
    generationId: "gen-5",
    revision: 1,
    userMessage: "Hello",
    assistantMessage: "Hi",
  });

  assert.equal(result.applied, false);
  assert.ok(result.error);
  assert.match(result.error, /error/i);
});

test("state extractor uses buildExtractionUserPrompt to build prompt", async () => {
  const storage = createInMemoryStorage();
  const patchService = createPatchService({ storage });
  const settings = createDefaultSettings();

  await patchService.applyPatch(
    createPatchEnvelope({
      patchId: "init-se6",
      chatId: "chat-se-6",
      baseRevision: 0,
      sourceTask: "test",
      operations: [{ type: "initialize_graph", settings }],
      provenance: { source: "test", detail: "init" },
    }),
  );

  let capturedPrompt = "";
  const extractor = createStateExtractor({
    applyPatch: patchService.applyPatch.bind(patchService),
    sidecarCaller: async (prompt: string) => {
      capturedPrompt = prompt;
      return JSON.stringify({
        entities: [],
        locations: [],
        events: [],
        timeCue: null,
        committedFacts: [],
        relationships: [],
      });
    },
  });

  await extractor.extractAndApply({
    chatId: "chat-se-6",
    generationId: "gen-6",
    revision: 1,
    userMessage: "Where am I?",
    assistantMessage: "You are in the tavern.",
  });

  assert.ok(
    capturedPrompt.includes("Where am I?"),
    "prompt should contain user message",
  );
  assert.ok(
    capturedPrompt.includes("You are in the tavern."),
    "prompt should contain assistant message",
  );
});

test("state extractor returns error when patch is rejected due to revision mismatch", async () => {
  const storage = createInMemoryStorage();
  const patchService = createPatchService({ storage });
  const settings = createDefaultSettings();

  await patchService.applyPatch(
    createPatchEnvelope({
      patchId: "init-se7",
      chatId: "chat-se-7",
      baseRevision: 0,
      sourceTask: "test",
      operations: [{ type: "initialize_graph", settings }],
      provenance: { source: "test", detail: "init" },
    }),
  );

  const extractor = createStateExtractor({
    applyPatch: patchService.applyPatch.bind(patchService),
    sidecarCaller: async () =>
      JSON.stringify({
        entities: [{ id: "dena", kind: "npc", name: "Dena", source: "system" }],
        locations: [],
        events: [],
        timeCue: null,
        committedFacts: [],
        relationships: [],
      }),
  });

  // Use wrong revision number to trigger rejection
  const result = await extractor.extractAndApply({
    chatId: "chat-se-7",
    generationId: "gen-7",
    revision: 999,
    userMessage: "Hello",
    assistantMessage: "Hi",
  });

  assert.equal(result.applied, false);
  assert.ok(result.error);
  assert.match(result.error, /patch rejected/i);
});
