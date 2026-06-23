import { test } from "node:test";
import assert from "node:assert/strict";
import {
  convertExtractionToPatches,
  validateExtractionResult,
} from "../../src/shared/schema/extraction.js";

test("valid extraction result passes validation", () => {
  const result = {
    entities: [
      { id: "entity_1", kind: "npc", name: "Dena", source: "system" },
    ],
    locations: [{ id: "loc_1", label: "Market Square" }],
    events: [
      {
        id: "evt_1",
        kind: "interaction",
        summary: "Dena observed Ken threatening Arlo",
        participants: ["entity_1", "entity_2"],
        locationId: "loc_1",
      },
    ],
    timeCue: null,
    committedFacts: [],
    relationships: [],
  };
  const errors = validateExtractionResult(result);
  assert.deepEqual(errors, []);
});

test("extraction result rejects missing required fields", () => {
  const result = {
    entities: [{ id: "e1", kind: "npc", name: "", source: "system" }],
    locations: [],
    events: [],
    committedFacts: [],
    relationships: [],
  };
  const errors = validateExtractionResult(result);
  assert.ok(errors.length > 0);
});

test("extraction result rejects invalid entity kind", () => {
  const result = {
    entities: [{ id: "e1", kind: "spaceship", name: "Nostromo", source: "system" }],
    locations: [],
    events: [],
    committedFacts: [],
    relationships: [],
  };
  const errors = validateExtractionResult(result);
  assert.ok(errors.some((e) => e.includes("kind")));
});

test("validateExtractionResult rejects null/undefined", () => {
  const errors1 = validateExtractionResult(null);
  assert.ok(errors1.length > 0);

  const errors2 = validateExtractionResult(undefined);
  assert.ok(errors2.length > 0);
});

test("validateExtractionResult rejects non-object top-level", () => {
  const errors = validateExtractionResult("not an object");
  assert.ok(errors.length > 0);
});

test("extraction result rejects event without participants", () => {
  const result = {
    entities: [],
    locations: [],
    events: [{ id: "e1", kind: "arrival", summary: "test", locationId: null }],
    timeCue: null,
    committedFacts: [],
    relationships: [],
  };
  const errors = validateExtractionResult(result);
  assert.ok(errors.some((e) => e.includes("participants")));
});

test("convertExtractionToPatches produces correct PatchOperations", () => {
  const extraction = {
    entities: [{ id: "e1", kind: "npc" as const, name: "Dena", source: "system" as const }],
    locations: [{ id: "loc_1", label: "Market" }],
    events: [{ id: "evt_1", kind: "arrival", summary: "Dena arrived", participants: ["e1"], locationId: "loc_1" }],
    timeCue: { time: "afternoon", source: "narrative" },
    committedFacts: ["Dena is at the market"],
    relationships: [{ sourceId: "e1", targetId: "e2", stance: "friendly", evidence: "greeted warmly" }],
  };
  const ops = convertExtractionToPatches(extraction);
  assert.equal(ops.length, 6);
  assert.equal(ops[0]!.type, "upsert_entity");
  assert.equal(ops[1]!.type, "upsert_location");
  assert.equal(ops[2]!.type, "append_event");
  assert.equal(ops[3]!.type, "advance_clock");
  assert.equal(ops[4]!.type, "append_committed_fact");
  assert.equal(ops[5]!.type, "upsert_relationship");
});

test("validateExtractionResult rejects invalid entity source", () => {
  const result = {
    entities: [{ id: "e1", kind: "npc", name: "Test", source: "ai_generated" }],
    locations: [], events: [], committedFacts: [], relationships: [],
  };
  const errors = validateExtractionResult(result);
  assert.ok(errors.some(e => e.includes("source")));
});

test("validateExtractionResult rejects relationship missing sourceId", () => {
  const result = {
    entities: [], locations: [], events: [], committedFacts: [], timeCue: null,
    relationships: [{ targetId: "t1", stance: "friendly", evidence: "test" }],
  };
  const errors = validateExtractionResult(result);
  assert.ok(errors.some(e => e.includes("sourceId")));
});

test("validateExtractionResult rejects non-string participants", () => {
  const result = {
    entities: [], locations: [], committedFacts: [],
    relationships: [],
    events: [{
      id: "evt_1", kind: "interaction", summary: "test",
      participants: ["valid", 123],
      locationId: null,
    }],
  };
  const errors = validateExtractionResult(result);
  assert.ok(errors.some(e => e.includes("participants")));
});

test("validateExtractionResult handles empty valid result", () => {
  const result = {
    entities: [],
    locations: [],
    events: [],
    timeCue: null,
    committedFacts: [],
    relationships: [],
  };
  const errors = validateExtractionResult(result);
  assert.deepEqual(errors, []);
});
