import { buildRebuildUserPrompt } from "./prompt.js";
import {
  convertExtractionToPatches,
  validateExtractionResult,
} from "../../shared/schema/extraction.js";
import { createPatchEnvelope } from "../../shared/schema/patch.js";
import type { ExtractionResult } from "../../shared/schema/extraction.js";
import type {
  PatchEnvelope,
  PatchApplyResult,
} from "../../shared/types/lwe.js";

export type RebuildInput = {
  chatId: string;
  revision: number;
  messages: Array<{ role: string; content: string }>;
};

export type RebuildOutput = {
  applied: boolean;
  entitiesCount: number;
  error?: string;
};

export function createRebuildService(input: {
  applyPatch: (patch: PatchEnvelope) => Promise<PatchApplyResult>;
  sidecarCaller: (prompt: string) => Promise<string>;
}) {
  async function rebuildFromHistory(
    rebuildInput: RebuildInput,
  ): Promise<RebuildOutput> {
    if (rebuildInput.messages.length === 0) {
      return { applied: true, entitiesCount: 0 };
    }

    try {
      const prompt = buildRebuildUserPrompt({
        messages: rebuildInput.messages,
      });

      const rawResponse = await input.sidecarCaller(prompt);

      let parsed: unknown;
      try {
        parsed = JSON.parse(rawResponse);
      } catch {
        return {
          applied: false,
          entitiesCount: 0,
          error: `Failed to parse sidecar response as JSON: ${rawResponse.slice(0, 200)}`,
        };
      }

      const validationErrors = validateExtractionResult(parsed);
      if (validationErrors.length > 0) {
        return {
          applied: false,
          entitiesCount: 0,
          error: `Rebuild validation failed: ${validationErrors.join("; ")}`,
        };
      }

      const extraction = parsed as ExtractionResult;
      const operations = convertExtractionToPatches(extraction);

      if (operations.length === 0) {
        return { applied: true, entitiesCount: 0 };
      }

      const result = await input.applyPatch(
        createPatchEnvelope({
          patchId: `rebuild:${rebuildInput.chatId}:${Date.now()}`,
          chatId: rebuildInput.chatId,
          baseRevision: rebuildInput.revision,
          sourceTask: "rebuild_from_history",
          operations,
          provenance: {
            source: "rebuild_service",
            detail: "rebuild from conversation history",
          },
        }),
      );

      if (!result.accepted) {
        return {
          applied: false,
          entitiesCount: 0,
          error: `Patch rejected: ${result.reason}`,
        };
      }

      const entityCount = operations.filter(
        (op) => op.type === "upsert_entity",
      ).length;
      return { applied: true, entitiesCount: entityCount };
    } catch (error) {
      return {
        applied: false,
        entitiesCount: 0,
        error: `Rebuild error: ${String(error)}`,
      };
    }
  }

  return { rebuildFromHistory };
}
