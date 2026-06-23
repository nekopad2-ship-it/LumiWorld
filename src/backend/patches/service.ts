import { createDefaultSettings } from "../../shared/schema/settings.js";
import {
  createEmptyWorldGraph,
  parseWorldGraph,
} from "../../shared/schema/world-graph.js";
import type {
  PatchApplyResult,
  PatchEnvelope,
  WorldGraph,
} from "../../shared/types/lwe.js";
import { createAuditLogService } from "../storage/audit-log.js";
import { worldGraphPath } from "../storage/paths.js";
import type { JsonStorage } from "../storage/types.js";

export function createPatchService(input: { storage: JsonStorage }) {
  const auditLog = createAuditLogService({ storage: input.storage });

  async function getGraph(chatId: string): Promise<WorldGraph | null> {
    if (!(await input.storage.exists(worldGraphPath(chatId)))) {
      return null;
    }
    return parseWorldGraph(
      await input.storage.getJson(worldGraphPath(chatId), null),
    );
  }

  async function saveGraph(graph: WorldGraph): Promise<void> {
    await input.storage.setJson(worldGraphPath(graph.chatId), graph);
  }

  async function rejectPatch(
    patch: PatchEnvelope,
    reason: PatchApplyResult["reason"],
    detail: string,
  ): Promise<PatchApplyResult> {
    await auditLog.appendRejectedPatchRecord(patch.chatId, {
      kind: "rejected",
      patchId: patch.patchId,
      reason,
      detail,
    });
    return {
      accepted: false,
      reason,
      nextRevision: null,
    };
  }

  async function applyPatch(patch: PatchEnvelope): Promise<PatchApplyResult> {
    if (!patch.validationResult.valid) {
      return rejectPatch(
        patch,
        "validation_failed",
        patch.validationResult.errors.join("; "),
      );
    }

    let graph = await getGraph(patch.chatId);
    if (graph && graph.patchState.appliedPatchIds.includes(patch.patchId)) {
      return rejectPatch(
        patch,
        "duplicate_patch_id",
        "patch id already applied",
      );
    }

    if (!graph) {
      if (patch.baseRevision !== 0) {
        return rejectPatch(patch, "revision_mismatch", "missing graph");
      }
      const initialize = patch.operations.find(
        (operation) => operation.type === "initialize_graph",
      );
      if (!initialize || initialize.type !== "initialize_graph") {
        return rejectPatch(
          patch,
          "validation_failed",
          "first patch must initialize the graph",
        );
      }
      graph = createEmptyWorldGraph({
        chatId: patch.chatId,
        settings: initialize.settings ?? createDefaultSettings(),
      });
    } else if (graph.revision !== patch.baseRevision) {
      return rejectPatch(
        patch,
        "revision_mismatch",
        `expected ${graph.revision}, got ${patch.baseRevision}`,
      );
    }

    const nextGraph = structuredClone(graph);
    for (const operation of patch.operations) {
      switch (operation.type) {
        case "initialize_graph":
          nextGraph.settingsSnapshot = operation.settings;
          nextGraph.mode = operation.settings.operationMode;
          break;
        case "update_settings_snapshot":
          nextGraph.settingsSnapshot = operation.settings;
          nextGraph.mode = operation.settings.operationMode;
          break;
        case "persist_scene_impact":
          nextGraph.sceneImpact = operation.sceneImpact;
          break;
        case "append_audit_record":
          break;
        case "record_migration_result":
          break;
        case "record_generation_correlation":
          break;
        case "upsert_entity":
          nextGraph.world.entities[operation.entity.id] = {
            id: operation.entity.id,
            kind: operation.entity.kind,
            name: operation.entity.name,
            source: operation.entity.source,
            createdAt: nextGraph.world.entities[operation.entity.id]?.createdAt ?? patch.createdAt,
            updatedAt: patch.createdAt,
          };
          break;
        case "upsert_location":
          nextGraph.world.locations[operation.location.id] = {
            id: operation.location.id,
            label: operation.location.label,
            updatedAt: patch.createdAt,
          };
          break;
        case "append_event":
          nextGraph.world.events = [
            ...nextGraph.world.events,
            {
              id: operation.event.id,
              kind: operation.event.kind,
              summary: operation.event.summary,
              participants: operation.event.participants,
              locationId: operation.event.locationId,
              createdAt: operation.event.createdAt,
            },
          ];
          break;
        case "advance_clock":
          nextGraph.world.clock.currentTime = operation.currentTime;
          nextGraph.world.clock.lastAdvanceSource = operation.source;
          break;
        case "append_committed_fact":
          nextGraph.world.events = [
            ...nextGraph.world.events,
            {
              id: `committed:${nextGraph.world.events.length + 1}`,
              kind: "committed_fact",
              summary: operation.fact,
              participants: [],
              locationId: null,
              createdAt: patch.createdAt,
            },
          ];
          break;
        case "upsert_relationship":
          nextGraph.world.relationships[
            `${operation.relationship.sourceId}->${operation.relationship.targetId}`
          ] = {
            sourceId: operation.relationship.sourceId,
            targetId: operation.relationship.targetId,
            stance: operation.relationship.stance,
            evidence: operation.relationship.evidence,
            updatedAt: operation.relationship.updatedAt,
          };
          break;
        default: {
          const _exhaustive: never = operation;
          break;
        }
      }
    }

    nextGraph.patchState.appliedPatchIds = [
      ...nextGraph.patchState.appliedPatchIds,
      patch.patchId,
    ];
    nextGraph.patchState.lastPatchId = patch.patchId;
    nextGraph.audit.lastAcceptedPatchAt = patch.createdAt;
    nextGraph.updatedAt = patch.createdAt;
    if (
      graph.revision !== 1 ||
      patch.baseRevision !== 0 ||
      patch.operations.some(
        (operation) => operation.type !== "initialize_graph",
      )
    ) {
      nextGraph.revision = graph.revision + 1;
    }

    await saveGraph(nextGraph);
    await auditLog.appendPatchRecord(patch.chatId, {
      kind: "accepted",
      patchId: patch.patchId,
      revision: nextGraph.revision,
      sourceTask: patch.sourceTask,
    });

    return {
      accepted: true,
      reason: "accepted",
      nextRevision: nextGraph.revision,
    };
  }

  return {
    applyPatch,
    getGraph,
  };
}
