import type { MigrationRecord, WorldGraph } from "../../shared/types/lwe.js";
import {
  CURRENT_WORLD_GRAPH_SCHEMA_VERSION,
  parseWorldGraph,
} from "../../shared/schema/world-graph.js";

export function migrateWorldGraphDocument(value: unknown): {
  graph: WorldGraph;
  record: MigrationRecord;
} {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("World graph migration input must be an object");
  }

  const source = value as Record<string, unknown>;
  const schemaVersion = source.schemaVersion;
  if (typeof schemaVersion !== "number") {
    throw new Error("World graph migration input requires schemaVersion");
  }

  if (schemaVersion > CURRENT_WORLD_GRAPH_SCHEMA_VERSION) {
    throw new Error("Future schema versions cannot be migrated safely");
  }

  if (schemaVersion === CURRENT_WORLD_GRAPH_SCHEMA_VERSION) {
    const graph = parseWorldGraph(source);
    return {
      graph,
      record: {
        migrationId: `world_graph_v${schemaVersion}_noop`,
        fromVersion: schemaVersion,
        toVersion: schemaVersion,
        appliedAt: new Date().toISOString(),
      },
    };
  }

  if (schemaVersion === 2) {
    const upgraded = {
      ...source,
      schemaVersion: CURRENT_WORLD_GRAPH_SCHEMA_VERSION,
      world: {
        ...(source.world as Record<string, unknown>),
        hooks: Array.isArray((source.world as Record<string, unknown>).hooks)
          ? (source.world as Record<string, unknown>).hooks
          : [],
      },
    };
    const graph = parseWorldGraph(upgraded);
    return {
      graph,
      record: {
        migrationId: "world_graph_v2_to_v3",
        fromVersion: 2,
        toVersion: CURRENT_WORLD_GRAPH_SCHEMA_VERSION,
        appliedAt: new Date().toISOString(),
      },
    };
  }

  throw new Error(
    `Unsupported world graph migration path from schema version ${schemaVersion}`,
  );
}
