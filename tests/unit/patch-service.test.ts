import { test } from "node:test";
import assert from "node:assert/strict";

import { createPatchService } from "../../src/backend/patches/service.js";
import { createInMemoryStorage } from "../../src/backend/storage/memory-storage.js";
import { createDefaultSettings } from "../../src/shared/schema/settings.js";
import { createPatchEnvelope } from "../../src/shared/schema/patch.js";

function initService(chatId = "chat-1") {
  const storage = createInMemoryStorage();
  const service = createPatchService({ storage });
  const settings = createDefaultSettings();

  return { storage, service, settings, chatId };
}

async function initGraph(
  service: ReturnType<typeof createPatchService>,
  chatId: string,
  settings: ReturnType<typeof createDefaultSettings>,
) {
  return service.applyPatch(
    createPatchEnvelope({
      patchId: "init",
      chatId,
      baseRevision: 0,
      sourceTask: "test",
      operations: [{ type: "initialize_graph", settings }],
      provenance: { source: "unit-test", detail: "initialize graph" },
    }),
  );
}

test("patch service initializes a graph and rejects duplicate patch ids", async () => {
  const { service, settings, chatId } = initService();

  const patch = createPatchEnvelope({
    patchId: "patch-1",
    chatId,
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
  const { service, settings, chatId } = initService();

  await service.applyPatch(
    createPatchEnvelope({
      patchId: "patch-1",
      chatId,
      baseRevision: 0,
      sourceTask: "phase_1_initialize",
      operations: [{ type: "initialize_graph", settings }],
      provenance: { source: "unit-test", detail: "initialize graph" },
    }),
  );

  const rejected = await service.applyPatch(
    createPatchEnvelope({
      patchId: "patch-2",
      chatId,
      baseRevision: 99,
      sourceTask: "phase_1_initialize",
      operations: [{ type: "persist_scene_impact", sceneImpact: null }],
      provenance: { source: "unit-test", detail: "bad revision" },
    }),
  );

  assert.equal(rejected.accepted, false);
  assert.equal(rejected.reason, "revision_mismatch");

  const graph = await service.getGraph(chatId);
  assert.ok(graph);
  assert.equal(graph?.revision, 1);
});

test("upsert_entity adds a new entity to world.entities", async () => {
  const { service, settings, chatId } = initService();
  await initGraph(service, chatId, settings);

  const result = await service.applyPatch(
    createPatchEnvelope({
      patchId: "p-entity-1",
      chatId,
      baseRevision: 1,
      sourceTask: "test",
      operations: [
        {
          type: "upsert_entity",
          entity: { id: "dena", kind: "npc", name: "Dena", source: "system" },
        },
      ],
      provenance: { source: "unit-test", detail: "add entity" },
    }),
  );

  assert.equal(result.accepted, true);

  const graph = await service.getGraph(chatId);
  assert.ok(graph?.world.entities["dena"]);
  assert.equal(graph?.world.entities["dena"].name, "Dena");
  assert.equal(graph?.world.entities["dena"].kind, "npc");
});

test("upsert_entity updates an existing entity", async () => {
  const { service, settings, chatId } = initService();
  await initGraph(service, chatId, settings);

  // Add entity first
  await service.applyPatch(
    createPatchEnvelope({
      patchId: "p-entity-add",
      chatId,
      baseRevision: 1,
      sourceTask: "test",
      operations: [
        {
          type: "upsert_entity",
          entity: { id: "dena", kind: "npc", name: "Dena", source: "system" },
        },
      ],
      provenance: { source: "unit-test", detail: "add entity" },
    }),
  );

  // Update it
  const result = await service.applyPatch(
    createPatchEnvelope({
      patchId: "p-entity-upd",
      chatId,
      baseRevision: 2,
      sourceTask: "test",
      operations: [
        {
          type: "upsert_entity",
          entity: {
            id: "dena",
            kind: "npc",
            name: "Dena Updated",
            source: "system",
          },
        },
      ],
      provenance: { source: "unit-test", detail: "update entity" },
    }),
  );

  assert.equal(result.accepted, true);

  const graph = await service.getGraph(chatId);
  assert.equal(graph?.world.entities["dena"]?.name, "Dena Updated");
});

test("upsert_location adds a new location to world.locations", async () => {
  const { service, settings, chatId } = initService();
  await initGraph(service, chatId, settings);

  const result = await service.applyPatch(
    createPatchEnvelope({
      patchId: "p-loc-1",
      chatId,
      baseRevision: 1,
      sourceTask: "test",
      operations: [
        {
          type: "upsert_location",
          location: { id: "market_square", label: "Market Square" },
        },
      ],
      provenance: { source: "unit-test", detail: "add location" },
    }),
  );

  assert.equal(result.accepted, true);

  const graph = await service.getGraph(chatId);
  assert.ok(graph?.world.locations["market_square"]);
  assert.equal(graph?.world.locations["market_square"].label, "Market Square");
});

test("append_event appends an event to world.events", async () => {
  const { service, settings, chatId } = initService();
  await initGraph(service, chatId, settings);

  const result = await service.applyPatch(
    createPatchEnvelope({
      patchId: "p-evt-1",
      chatId,
      baseRevision: 1,
      sourceTask: "test",
      operations: [
        {
          type: "append_event",
          event: {
            id: "evt_001",
            kind: "interaction",
            summary: "Dena greeted Ken",
            participants: ["dena", "ken"],
            locationId: "market_square",
            createdAt: "2026-06-22T00:00:00.000Z",
          },
        },
      ],
      provenance: { source: "unit-test", detail: "add event" },
    }),
  );

  assert.equal(result.accepted, true);

  const graph = await service.getGraph(chatId);
  assert.equal(graph?.world.events.length, 1);
  assert.equal(graph?.world.events[0]?.id, "evt_001");
  assert.equal(graph?.world.events[0]?.summary, "Dena greeted Ken");
  assert.deepEqual(graph?.world.events[0]?.participants, ["dena", "ken"]);
  assert.equal(graph?.world.events[0]?.locationId, "market_square");
});

test("advance_clock updates world.clock", async () => {
  const { service, settings, chatId } = initService();
  await initGraph(service, chatId, settings);

  const result = await service.applyPatch(
    createPatchEnvelope({
      patchId: "p-clock-1",
      chatId,
      baseRevision: 1,
      sourceTask: "test",
      operations: [
        {
          type: "advance_clock",
          currentTime: "2026-06-22T14:30:00.000Z",
          source: "sidecar_extraction",
        },
      ],
      provenance: { source: "unit-test", detail: "advance clock" },
    }),
  );

  assert.equal(result.accepted, true);

  const graph = await service.getGraph(chatId);
  assert.equal(graph?.world.clock.currentTime, "2026-06-22T14:30:00.000Z");
  assert.equal(graph?.world.clock.lastAdvanceSource, "sidecar_extraction");
});

test("append_committed_fact appends a committed fact event", async () => {
  const { service, settings, chatId } = initService();
  await initGraph(service, chatId, settings);

  const result = await service.applyPatch(
    createPatchEnvelope({
      patchId: "p-fact-1",
      chatId,
      baseRevision: 1,
      sourceTask: "test",
      operations: [
        {
          type: "append_committed_fact",
          fact: "Ken owes Dena 50 gold",
        },
      ],
      provenance: { source: "unit-test", detail: "add fact" },
    }),
  );

  assert.equal(result.accepted, true);

  const graph = await service.getGraph(chatId);
  const factEvents = graph!.world.events.filter(
    (e) => e.kind === "committed_fact",
  );
  assert.equal(factEvents.length, 1);
  assert.equal(factEvents[0]!.summary, "Ken owes Dena 50 gold");
  assert.deepEqual(factEvents[0]!.participants, []);
  assert.equal(factEvents[0]!.locationId, null);
});

test("upsert_relationship adds a relationship to world.relationships", async () => {
  const { service, settings, chatId } = initService();
  await initGraph(service, chatId, settings);

  const result = await service.applyPatch(
    createPatchEnvelope({
      patchId: "p-rel-1",
      chatId,
      baseRevision: 1,
      sourceTask: "test",
      operations: [
        {
          type: "upsert_relationship",
          relationship: {
            sourceId: "ken",
            targetId: "arlo",
            stance: "suspicious",
            evidence: "Ken threatened Arlo over unpaid debt",
            updatedAt: "2026-06-22T00:00:00.000Z",
          },
        },
      ],
      provenance: { source: "unit-test", detail: "add relationship" },
    }),
  );

  assert.equal(result.accepted, true);

  const graph = await service.getGraph(chatId);
  const key = "ken->arlo";
  assert.ok(graph?.world.relationships[key]);
  assert.equal(graph?.world.relationships[key].stance, "suspicious");
  assert.equal(graph?.world.relationships[key].sourceId, "ken");
  assert.equal(graph?.world.relationships[key].targetId, "arlo");
});

test("combined operations apply in sequence", async () => {
  const { service, settings, chatId } = initService();
  await initGraph(service, chatId, settings);

  const result = await service.applyPatch(
    createPatchEnvelope({
      patchId: "p-combo-1",
      chatId,
      baseRevision: 1,
      sourceTask: "test",
      operations: [
        {
          type: "upsert_entity",
          entity: { id: "ken", kind: "npc", name: "Ken", source: "system" },
        },
        {
          type: "upsert_location",
          location: { id: "tavern", label: "The Rusty Tavern" },
        },
        {
          type: "append_event",
          event: {
            id: "evt_001",
            kind: "arrival",
            summary: "Ken entered the tavern",
            participants: ["ken"],
            locationId: "tavern",
            createdAt: "2026-06-22T00:00:00.000Z",
          },
        },
        {
          type: "advance_clock",
          currentTime: "2026-06-22T18:00:00.000Z",
          source: "sidecar_extraction",
        },
        {
          type: "upsert_relationship",
          relationship: {
            sourceId: "ken",
            targetId: "bartender",
            stance: "neutral",
            evidence: "Ken ordered a drink",
            updatedAt: "2026-06-22T00:00:00.000Z",
          },
        },
      ],
      provenance: { source: "unit-test", detail: "combined operations" },
    }),
  );

  assert.equal(result.accepted, true);

  const graph = await service.getGraph(chatId);
  assert.ok(graph);
  assert.ok(graph.world.entities["ken"]);
  assert.ok(graph.world.locations["tavern"]);
  assert.equal(graph.world.events.length, 1);
  assert.equal(graph.world.events[0]!.id, "evt_001");
  assert.equal(graph.world.clock.currentTime, "2026-06-22T18:00:00.000Z");
  assert.equal(graph.world.clock.lastAdvanceSource, "sidecar_extraction");
  assert.ok(graph.world.relationships["ken->bartender"]);
});
