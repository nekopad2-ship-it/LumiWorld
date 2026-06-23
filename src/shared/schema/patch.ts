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
      (!op.event.id || !op.event.kind || !op.event.summary)
    ) {
      errors.push("append_event: missing required fields (id, kind, summary)");
    }
    if (op.type === "advance_clock" && !op.currentTime) {
      errors.push("advance_clock: missing currentTime");
    }
  }
  return errors;
}
