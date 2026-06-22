import type {
  GenerationCorrelationRecord,
  GenerationType,
  PendingGenerationMetadata,
} from "../types/lwe.js";

export function isCommitEligibleGenerationType(
  generationType: GenerationType,
): boolean {
  return generationType === "normal";
}

export function buildCorrelationRecord(
  generationId: string,
  metadata: PendingGenerationMetadata,
): GenerationCorrelationRecord {
  return {
    generationId,
    chatId: metadata.chatId,
    generationType: metadata.generationType,
    provisionalRevision: metadata.provisionalRevision,
    timestamp: metadata.timestamp,
    commitEligible: isCommitEligibleGenerationType(metadata.generationType),
    status: "started",
  };
}
