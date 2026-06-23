import type {
  PatchEnvelope,
  PatchOperation,
  PatchProvenance,
} from "../types/lwe.js";

export function createPatchEnvelope(input: {
  patchId: string;
  chatId: string;
  baseRevision: number;
  sourceTask: string;
  operations: PatchOperation[];
  provenance: PatchProvenance;
  createdAt?: string;
}): PatchEnvelope {
  return {
    patchId: input.patchId,
    chatId: input.chatId,
    baseRevision: input.baseRevision,
    sourceTask: input.sourceTask,
    operations: input.operations,
    provenance: input.provenance,
    validationResult: {
      valid: true,
      errors: [],
    },
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}

export function validatePatchOperations(
  operations: PatchOperation[],
): string[] {
  const errors: string[] = [];
  for (const op of operations) {
    if (
      op.type === "upsert_entity" &&
      !["player", "character_card_principal", "npc", "location", "faction", "object"].includes(
        op.entity.kind,
      )
    ) {
      errors.push(`upsert_entity: invalid kind "${op.entity.kind}"`);
    }
    if (
      op.type === "append_event" &&
      (!op.event.id ||
        !op.event.kind ||
        !op.event.summary ||
        !Array.isArray(op.event.participants) ||
        !op.event.createdAt)
    ) {
      errors.push(
        "append_event: missing required fields (id, kind, summary, participants, createdAt)",
      );
    }
    if (
      op.type === "advance_clock" &&
      (!op.currentTime || !op.source)
    ) {
      errors.push("advance_clock: missing required fields (currentTime, source)");
    }
    if (
      op.type === "upsert_location" &&
      (!op.location.id || !op.location.label)
    ) {
      errors.push("upsert_location: missing required fields (location.id, location.label)");
    }
    if (
      op.type === "append_committed_fact" &&
      !op.fact
    ) {
      errors.push("append_committed_fact: missing required field (fact)");
    }
    if (
      op.type === "upsert_relationship" &&
      (!op.relationship.sourceId ||
        !op.relationship.targetId ||
        !op.relationship.stance)
    ) {
      errors.push(
        "upsert_relationship: missing required fields (sourceId, targetId, stance)",
      );
    }
  }
  return errors;
}
