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
