import type { GenerationCorrelationService } from "./correlation.js";

export type CommitDecision = {
  eligible: boolean;
  reason:
    | "commit_eligible"
    | "non_eligible_generation_type"
    | "generation_in_progress"
    | "unknown_generation";
};

const ELIGIBLE_GENERATION_TYPES = new Set(["normal"]);

export function createCommitGuard(input: {
  correlationService: GenerationCorrelationService;
}) {
  function shouldCommit(generationId: string): CommitDecision {
    const record = input.correlationService.getRecord(generationId);

    if (!record) {
      return { eligible: false, reason: "unknown_generation" };
    }

    if (record.status !== "ended") {
      return { eligible: false, reason: "generation_in_progress" };
    }

    if (!ELIGIBLE_GENERATION_TYPES.has(record.generationType)) {
      return { eligible: false, reason: "non_eligible_generation_type" };
    }

    return { eligible: true, reason: "commit_eligible" };
  }

  return { shouldCommit };
}
