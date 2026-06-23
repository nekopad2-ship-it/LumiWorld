import { buildRebuildUserPrompt } from "./prompt.js";
import { createPatchEnvelope } from "../../shared/schema/patch.js";
import type { PatchOperation, PatchEnvelope, PatchApplyResult } from "../../shared/types/lwe.js";

type PatchApplyFn = (patch: PatchEnvelope) => Promise<PatchApplyResult>;
type SidecarCaller = (prompt: string) => Promise<string>;

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
  applyPatch: PatchApplyFn;
  sidecarCaller: SidecarCaller;
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

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(rawResponse);
      } catch {
        return {
          applied: false,
          entitiesCount: 0,
          error: `Failed to parse sidecar response as JSON: ${rawResponse.slice(0, 200)}`,
        };
      }

      const operations: PatchOperation[] = [];

      // Parse entities
      const entities = parsed.entities;
      if (Array.isArray(entities)) {
        for (const entity of entities) {
          if (entity && typeof entity.id === "string" && typeof entity.kind === "string" && typeof entity.name === "string") {
            operations.push({
              type: "upsert_entity",
              entity: {
                id: entity.id,
                kind: entity.kind as any,
                name: entity.name,
                source: (typeof entity.source === "string" ? entity.source : "system") as any,
              },
            });
          }
        }
      }

      // Parse locations
      const locations = parsed.locations;
      if (Array.isArray(locations)) {
        for (const loc of locations) {
          if (loc && typeof loc.id === "string" && typeof loc.label === "string") {
            operations.push({
              type: "upsert_location",
              location: { id: loc.id, label: loc.label },
            });
          }
        }
      }

      // Parse events
      const events = parsed.events;
      if (Array.isArray(events)) {
        for (const evt of events) {
          if (evt && typeof evt.id === "string" && typeof evt.kind === "string" && typeof evt.summary === "string") {
            operations.push({
              type: "append_event",
              event: {
                id: evt.id,
                kind: evt.kind,
                summary: evt.summary,
                participants: Array.isArray(evt.participants)
                  ? evt.participants.map(String)
                  : [],
                locationId: typeof evt.locationId === "string" ? evt.locationId : null,
                createdAt: new Date().toISOString(),
              },
            });
          }
        }
      }

      // Parse relationships
      const relationships = parsed.relationships;
      if (Array.isArray(relationships)) {
        for (const rel of relationships) {
          if (rel && typeof rel.sourceId === "string" && typeof rel.targetId === "string" && typeof rel.stance === "string") {
            operations.push({
              type: "upsert_relationship",
              relationship: {
                sourceId: rel.sourceId,
                targetId: rel.targetId,
                stance: rel.stance,
                evidence: typeof rel.evidence === "string" ? rel.evidence : "",
                updatedAt: new Date().toISOString(),
              },
            });
          }
        }
      }

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

      // Count entity operations
      const entityCount = operations.filter((op) => op.type === "upsert_entity").length;
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
