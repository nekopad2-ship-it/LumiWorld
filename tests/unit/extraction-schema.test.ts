import { test } from "node:test";
import assert from "node:assert/strict";
import { validateExtractionResult } from "../../src/shared/schema/extraction.js";

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
