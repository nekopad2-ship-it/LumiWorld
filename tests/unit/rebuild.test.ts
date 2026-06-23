import { test } from "node:test";
import assert from "node:assert/strict";
import { createRebuildService } from "../../src/backend/rebuild/service.js";
import { createPatchService } from "../../src/backend/patches/service.js";
import { createInMemoryStorage } from "../../src/backend/storage/memory-storage.js";
import { createDefaultSettings } from "../../src/shared/schema/settings.js";
import { createPatchEnvelope } from "../../src/shared/schema/patch.js";

test("rebuild service extracts entities from history batch", async () => {
  const storage = createInMemoryStorage();
  const patchService = createPatchService({ storage });
  const settings = createDefaultSettings();

  await patchService.applyPatch(
    createPatchEnvelope({
      patchId: "init-rb",
      chatId: "chat-rb-1",
      baseRevision: 0,
      sourceTask: "test",
      operations: [{ type: "initialize_graph", settings }],
      provenance: { source: "test", detail: "init" },
    }),
  );

  let sidecarCalled = false;
  const rebuild = createRebuildService({
    applyPatch: patchService.applyPatch.bind(patchService),
    sidecarCaller: async () => {
      sidecarCalled = true;
      return JSON.stringify({
        entities: [
          { id: "ken", kind: "npc", name: "Ken", source: "system" },
          { id: "arlo", kind: "npc", name: "Arlo", source: "system" },
          { id: "shop", kind: "location", name: "Arlo's Shop", source: "system" },
        ],
        locations: [{ id: "shop", label: "Arlo's Shop" }],
        events: [
          {
            id: "evt_001",
            kind: "arrival",
            summary: "Ken entered Arlo's shop",
            participants: ["ken", "arlo"],
            locationId: "shop",
          },
        ],
        relationships: [
          { sourceId: "ken", targetId: "arlo", stance: "unknown", evidence: "first meeting" },
        ],
        committedFacts: [],
        timeCue: { time: "morning", source: "narrative_cue" },
      });
    },
  });

  const result = await rebuild.rebuildFromHistory({
    chatId: "chat-rb-1",
    revision: 1,
    messages: [
      { role: "user", content: "I walk into the shop." },
      { role: "assistant", content: "Ken enters Arlo's shop. The merchant looks up." },
    ],
  });

  assert.equal(sidecarCalled, true);
  assert.equal(result.applied, true);
  assert.equal(result.entitiesCount, 3);

  const graph = await patchService.getGraph("chat-rb-1");
  assert.ok(graph?.world.entities["ken"]);
  assert.ok(graph?.world.entities["arlo"]);
  assert.ok(graph?.world.locations["shop"]);
});

test("rebuild service handles empty history gracefully", async () => {
  const storage = createInMemoryStorage();
  const patchService = createPatchService({ storage });
  const settings = createDefaultSettings();

  await patchService.applyPatch(
    createPatchEnvelope({
      patchId: "init-rb2",
      chatId: "chat-rb-2",
      baseRevision: 0,
      sourceTask: "test",
      operations: [{ type: "initialize_graph", settings }],
      provenance: { source: "test", detail: "init" },
    }),
  );

  const rebuild = createRebuildService({
    applyPatch: patchService.applyPatch.bind(patchService),
    sidecarCaller: async () => {
      return JSON.stringify({
        entities: [],
        locations: [],
        events: [],
        relationships: [],
        committedFacts: [],
        timeCue: null,
      });
    },
  });

  const result = await rebuild.rebuildFromHistory({
    chatId: "chat-rb-2",
    revision: 1,
    messages: [],
  });

  assert.equal(result.applied, true);
  assert.equal(result.entitiesCount, 0);
});

test("rebuild service handles sidecar failure gracefully", async () => {
  const storage = createInMemoryStorage();
  const patchService = createPatchService({ storage });
  const settings = createDefaultSettings();

  await patchService.applyPatch(
    createPatchEnvelope({
      patchId: "init-rb3",
      chatId: "chat-rb-3",
      baseRevision: 0,
      sourceTask: "test",
      operations: [{ type: "initialize_graph", settings }],
      provenance: { source: "test", detail: "init" },
    }),
  );

  const rebuild = createRebuildService({
    applyPatch: patchService.applyPatch.bind(patchService),
    sidecarCaller: async () => {
      throw new Error("Sidecar unavailable");
    },
  });

  const result = await rebuild.rebuildFromHistory({
    chatId: "chat-rb-3",
    revision: 1,
    messages: [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi" },
    ],
  });

  assert.equal(result.applied, false);
  assert.ok(result.error);
});

test("rebuild service handles malformed JSON from sidecar", async () => {
  const storage = createInMemoryStorage();
  const patchService = createPatchService({ storage });
  const settings = createDefaultSettings();

  await patchService.applyPatch(
    createPatchEnvelope({
      patchId: "init-rb4", chatId: "chat-rb-4",
      baseRevision: 0, sourceTask: "test",
      operations: [{ type: "initialize_graph", settings }],
      provenance: { source: "test", detail: "init" },
    }),
  );

  const rebuild = createRebuildService({
    applyPatch: patchService.applyPatch.bind(patchService),
    sidecarCaller: async () => "not json{{{",
  });

  const result = await rebuild.rebuildFromHistory({
    chatId: "chat-rb-4", revision: 1,
    messages: [{ role: "user", content: "Hi" }],
  });

  assert.equal(result.applied, false);
  assert.ok(result.error);
  assert.match(result.error!, /json/i);
});

test("rebuild service rejects sidecar response with validation errors", async () => {
  const storage = createInMemoryStorage();
  const patchService = createPatchService({ storage });
  const settings = createDefaultSettings();

  await patchService.applyPatch(
    createPatchEnvelope({
      patchId: "init-rb5", chatId: "chat-rb-5",
      baseRevision: 0, sourceTask: "test",
      operations: [{ type: "initialize_graph", settings }],
      provenance: { source: "test", detail: "init" },
    }),
  );

  const rebuild = createRebuildService({
    applyPatch: patchService.applyPatch.bind(patchService),
    sidecarCaller: async () => JSON.stringify({
      entities: [{ id: "bad", kind: "invalid", name: "Bad", source: "system" }],
      locations: [], events: [], timeCue: null, committedFacts: [], relationships: [],
    }),
  });

  const result = await rebuild.rebuildFromHistory({
    chatId: "chat-rb-5", revision: 1,
    messages: [{ role: "user", content: "Hi" }],
  });

  assert.equal(result.applied, false);
  assert.ok(result.error);
});
