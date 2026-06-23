import type { PatchOperation } from "../types/lwe.js";

export type ExtractionEntity = {
  id: string;
  kind:
    | "player"
    | "character_card_principal"
    | "npc"
    | "location"
    | "faction"
    | "object";
  name: string;
  source: "seed" | "user" | "system";
};

export type ExtractionLocation = {
  id: string;
  label: string;
};

export type ExtractionEvent = {
  id: string;
  kind: string;
  summary: string;
  participants: string[];
  locationId: string | null;
};

export type ExtractionTimeCue = {
  time: string;
  source: string;
} | null;

export type ExtractionRelationship = {
  sourceId: string;
  targetId: string;
  stance: string;
  evidence: string;
};

export type ExtractionResult = {
  entities: ExtractionEntity[];
  locations: ExtractionLocation[];
  events: ExtractionEvent[];
  timeCue: ExtractionTimeCue;
  committedFacts: string[];
  relationships: ExtractionRelationship[];
};

const VALID_ENTITY_KINDS = new Set([
  "player",
  "character_card_principal",
  "npc",
  "location",
  "faction",
  "object",
]);

const VALID_ENTITY_SOURCES = new Set(["seed", "user", "system"]);

export function validateExtractionResult(value: unknown): string[] {
  const errors: string[] = [];

  if (typeof value !== "object" || value === null) {
    return ["Extraction result must be a non-null object"];
  }

  const raw = value as Record<string, unknown>;

  if (!Array.isArray(raw.entities)) {
    errors.push("Extraction result must have an entities array");
  } else {
    for (let i = 0; i < raw.entities.length; i++) {
      const e = raw.entities[i] as Record<string, unknown>;
      if (!e.id || typeof e.id !== "string")
        errors.push(`entities[${i}]: missing or invalid id`);
      if (!VALID_ENTITY_KINDS.has(String(e.kind)))
        errors.push(`entities[${i}]: invalid kind "${String(e.kind)}"`);
      if (!e.name || typeof e.name !== "string")
        errors.push(`entities[${i}]: missing or invalid name`);
      if (!VALID_ENTITY_SOURCES.has(String(e.source)))
        errors.push(`entities[${i}]: invalid source "${String(e.source)}"`);
    }
  }

  if (!Array.isArray(raw.locations)) {
    errors.push("Extraction result must have a locations array");
  } else {
    for (let i = 0; i < raw.locations.length; i++) {
      const loc = raw.locations[i] as Record<string, unknown>;
      if (!loc.id || typeof loc.id !== "string")
        errors.push(`locations[${i}]: missing id`);
      if (!loc.label || typeof loc.label !== "string")
        errors.push(`locations[${i}]: missing label`);
    }
  }

  if (!Array.isArray(raw.events)) {
    errors.push("Extraction result must have an events array");
  } else {
    for (let i = 0; i < raw.events.length; i++) {
      const evt = raw.events[i] as Record<string, unknown>;
      if (!evt.id || typeof evt.id !== "string")
        errors.push(`events[${i}]: missing id`);
      if (!evt.kind || typeof evt.kind !== "string")
        errors.push(`events[${i}]: missing kind`);
      if (!evt.summary || typeof evt.summary !== "string")
        errors.push(`events[${i}]: missing summary`);
      if (!Array.isArray(evt.participants))
        errors.push(`events[${i}]: participants must be an array`);
      if (
        Array.isArray(evt.participants) &&
        !evt.participants.every((p: unknown) => typeof p === "string")
      )
        errors.push(`events[${i}]: participants must be strings`);
    }
  }

  if (!Array.isArray(raw.committedFacts)) {
    errors.push("Extraction result must have a committedFacts array");
  }

  if (!Array.isArray(raw.relationships)) {
    errors.push("Extraction result must have a relationships array");
  } else {
    for (let i = 0; i < raw.relationships.length; i++) {
      const rel = raw.relationships[i] as Record<string, unknown>;
      if (!rel.sourceId || typeof rel.sourceId !== "string")
        errors.push(`relationships[${i}]: missing or invalid sourceId`);
      if (!rel.targetId || typeof rel.targetId !== "string")
        errors.push(`relationships[${i}]: missing or invalid targetId`);
      if (!rel.stance || typeof rel.stance !== "string")
        errors.push(`relationships[${i}]: missing or invalid stance`);
    }
  }

  if (raw.timeCue !== null && typeof raw.timeCue === "object") {
    const tc = raw.timeCue as Record<string, unknown>;
    if (!tc.time || typeof tc.time !== "string")
      errors.push("timeCue: missing or invalid time");
    if (!tc.source || typeof tc.source !== "string")
      errors.push("timeCue: missing or invalid source");
  } else if (raw.timeCue !== null) {
    errors.push("timeCue must be null or an object");
  }

  return errors;
}

export function convertExtractionToPatches(
  extraction: ExtractionResult,
): PatchOperation[] {
  const operations: PatchOperation[] = [];

  for (const entity of extraction.entities) {
    operations.push({
      type: "upsert_entity",
      entity,
    });
  }

  for (const location of extraction.locations) {
    operations.push({
      type: "upsert_location",
      location,
    });
  }

  for (const event of extraction.events) {
    operations.push({
      type: "append_event",
      event: { ...event, createdAt: new Date().toISOString() },
    });
  }

  if (extraction.timeCue) {
    operations.push({
      type: "advance_clock",
      currentTime: extraction.timeCue.time,
      source: extraction.timeCue.source,
    });
  }

  for (const fact of extraction.committedFacts) {
    operations.push({
      type: "append_committed_fact",
      fact,
    });
  }

  for (const rel of extraction.relationships) {
    operations.push({
      type: "upsert_relationship",
      relationship: { ...rel, updatedAt: new Date().toISOString() },
    });
  }

  return operations;
}
