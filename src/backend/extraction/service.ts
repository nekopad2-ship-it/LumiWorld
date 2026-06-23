import { buildExtractionUserPrompt } from "./prompt.js";
import {
  convertExtractionToPatches,
  validateExtractionResult,
} from "../../shared/schema/extraction.js";
import { createPatchEnvelope } from "../../shared/schema/patch.js";
import type { ExtractionResult } from "../../shared/schema/extraction.js";
import type { PatchEnvelope, PatchApplyResult } from "../../shared/types/lwe.js";

export type SidecarCaller = (prompt: string) => Promise<string>;

export type ExtractionInput = {
  chatId: string;
  generationId: string;
  revision: number;
  userMessage: string;
  assistantMessage: string;
};

export type ExtractionOutput = {
  applied: boolean;
  eventsCount: number;
  error?: string;
};

export function createStateExtractor(input: {
  applyPatch: (patch: PatchEnvelope) => Promise<PatchApplyResult>;
  sidecarCaller: SidecarCaller;
}) {
  async function extractAndApply(
    extractionInput: ExtractionInput,
  ): Promise<ExtractionOutput> {
    try {
      const prompt = buildExtractionUserPrompt({
        userMessage: extractionInput.userMessage,
        assistantMessage: extractionInput.assistantMessage,
      });

      const rawResponse = await input.sidecarCaller(prompt);

      let parsed: unknown;
      try {
        parsed = JSON.parse(rawResponse);
      } catch {
        return {
          applied: false,
          eventsCount: 0,
          error: `Failed to parse sidecar response as JSON: ${rawResponse.slice(0, 200)}`,
        };
      }

      const validationErrors = validateExtractionResult(parsed);
      if (validationErrors.length > 0) {
        return {
          applied: false,
          eventsCount: 0,
          error: `Extraction validation failed: ${validationErrors.join("; ")}`,
        };
      }

      const extraction = parsed as ExtractionResult;
      const operations = convertExtractionToPatches(extraction);

      if (operations.length === 0) {
        return { applied: true, eventsCount: 0 };
      }

      const result = await input.applyPatch(
        createPatchEnvelope({
          patchId: `extract:${extractionInput.chatId}:${extractionInput.generationId}`,
          chatId: extractionInput.chatId,
          baseRevision: extractionInput.revision,
          sourceTask: "state_extractor",
          operations,
          provenance: {
            source: "state_extractor",
            detail: `extraction from generation ${extractionInput.generationId}`,
          },
        }),
      );

      if (!result.accepted) {
        return {
          applied: false,
          eventsCount: 0,
          error: `Patch rejected: ${result.reason}`,
        };
      }

      return { applied: true, eventsCount: operations.length };
    } catch (error) {
      return {
        applied: false,
        eventsCount: 0,
        error: `Extraction error: ${String(error)}`,
      };
    }
  }

  return { extractAndApply };
}
