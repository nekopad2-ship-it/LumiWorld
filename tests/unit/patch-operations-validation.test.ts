import { test } from "node:test";
import assert from "node:assert/strict";
import { validatePatchOperations } from "../../src/shared/schema/patch.js";
import type { PatchOperation } from "../../src/shared/types/lwe.js";

test("validatePatchOperations passes valid upsert_entity", () => {
  const errors = validatePatchOperations([
    {
      type: "upsert_entity",
      entity: { id: "e1", kind: "npc", name: "Dena", source: "system" },
    },
  ]);
  assert.deepEqual(errors, []);
});

test("validatePatchOperations rejects invalid entity kind", () => {
  const op: Record<string, unknown> = {
    type: "upsert_entity",
    entity: { id: "e1", kind: "spaceship", name: "Nostromo", source: "system" },
  };
  const errors = validatePatchOperations([op as unknown as PatchOperation]);
  assert.ok(errors.some((e) => e.includes("kind")));
});

test("validatePatchOperations passes valid advance_clock", () => {
  const errors = validatePatchOperations([
    {
      type: "advance_clock",
      currentTime: "2026-06-22T14:30:00Z",
      source: "sidecar_inference",
    },
  ]);
  assert.deepEqual(errors, []);
});

test("validatePatchOperations rejects advance_clock without source", () => {
  const op: Record<string, unknown> = {
    type: "advance_clock",
    currentTime: "2026-06-22T14:30:00Z",
  };
  const errors = validatePatchOperations([op as unknown as PatchOperation]);
  assert.ok(errors.some((e) => e.includes("source")));
});

test("validatePatchOperations rejects missing currentTime", () => {
  const op: Record<string, unknown> = {
    type: "advance_clock",
    source: "test",
  };
  const errors = validatePatchOperations([op as unknown as PatchOperation]);
  assert.ok(errors.some((e) => e.includes("currentTime")));
});

test("validatePatchOperations validates append_event required fields", () => {
  const op: Record<string, unknown> = {
    type: "append_event",
    event: { id: "e1", kind: "arrival" },
  };
  const errors = validatePatchOperations([op as unknown as PatchOperation]);
  assert.ok(
    errors.some(
      (e) =>
        e.includes("summary") ||
        e.includes("participants") ||
        e.includes("createdAt"),
    ),
  );
});

test("validatePatchOperations validates upsert_location", () => {
  const op: Record<string, unknown> = {
    type: "upsert_location",
    location: { id: "loc_1" },
  };
  const errors = validatePatchOperations([op as unknown as PatchOperation]);
  assert.ok(errors.some((e) => e.includes("label")));
});

test("validatePatchOperations validates append_committed_fact", () => {
  const op: Record<string, unknown> = {
    type: "append_committed_fact",
    fact: "",
  };
  const errors = validatePatchOperations([op as unknown as PatchOperation]);
  assert.ok(errors.some((e) => e.includes("fact")));
});

test("validatePatchOperations passes valid operations", () => {
  const errors = validatePatchOperations([
    {
      type: "upsert_entity",
      entity: { id: "e1", kind: "npc", name: "Dena", source: "system" },
    },
    { type: "advance_clock", currentTime: "12:00", source: "test" },
  ]);
  assert.deepEqual(errors, []);
});

test("validatePatchOperations returns empty for no operations", () => {
  const errors = validatePatchOperations([]);
  assert.deepEqual(errors, []);
});

test("validatePatchOperations validates upsert_relationship", () => {
  const op: Record<string, unknown> = {
    type: "upsert_relationship",
    relationship: { targetId: "t1", stance: "friendly" },
  };
  const errors = validatePatchOperations([op as unknown as PatchOperation]);
  assert.ok(errors.some((e) => e.includes("sourceId")));
});
