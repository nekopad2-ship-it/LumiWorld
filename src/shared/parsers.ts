import type {
  EdgeDelta,
  EmotionalState,
  HookDelta,
  LedgerData,
  LedgerEntry,
  NewEntity,
  NpcTier,
  PlayerDelta,
  SceneCast,
  SecretDelta,
  StateUpdate,
  StateUpdateNpcDelta,
  TimeAdvance,
} from "./types";

export type StateUpdateEnvelope = {
  found: boolean;
  rawBlock: string | null;
  jsonText: string | null;
  parsed: StateUpdate | null;
  error: string | null;
};

export function parseStateUpdateEnvelope(content: string): StateUpdateEnvelope {
  const match = content.match(/^\[STATE_UPDATE\][\t ]*\r?\n([\s\S]*?)^\[\/STATE_UPDATE\][\t ]*$/m);
  if (!match) {
    return {
      found: false,
      rawBlock: null,
      jsonText: null,
      parsed: null,
      error: null,
    };
  }

  const rawBlock = match[0];
  const jsonText = match[1].trim();

  try {
    const parsedJson = JSON.parse(jsonText) as unknown;
    const validated = validateStateUpdateContract(parsedJson);

    if (!validated.valid) {
      return {
        found: true,
        rawBlock,
        jsonText,
        parsed: null,
        error: `Invalid STATE_UPDATE contract: ${validated.error}`,
      };
    }

    return {
      found: true,
      rawBlock,
      jsonText,
      parsed: validated.value,
      error: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown JSON parse failure";
    return {
      found: true,
      rawBlock,
      jsonText,
      parsed: null,
      error: `Invalid STATE_UPDATE JSON: ${message}`,
    };
  }
}

type ValidationResult<T> = { valid: true; value: T } | { valid: false; error: string };

function validateStateUpdateContract(value: unknown): ValidationResult<StateUpdate> {
  if (!isRecord(value)) {
    return invalid("root must be an object");
  }

  const sceneCast = validateSceneCast(value.sceneCast, "sceneCast");
  if (!sceneCast.valid) {
    return sceneCast;
  }

  const timeAdvance = validateTimeAdvance(value.timeAdvance, "timeAdvance");
  if (!timeAdvance.valid) {
    return timeAdvance;
  }

  const npcDeltas = validateArray(value.npcDeltas, "npcDeltas", validateNpcDelta);
  if (!npcDeltas.valid) {
    return npcDeltas;
  }

  const edgeDeltas = validateArray(value.edgeDeltas, "edgeDeltas", validateEdgeDelta);
  if (!edgeDeltas.valid) {
    return edgeDeltas;
  }

  const secretDeltas = validateArray(value.secretDeltas, "secretDeltas", validateSecretDelta);
  if (!secretDeltas.valid) {
    return secretDeltas;
  }

  const hookDeltas = validateArray(value.hookDeltas, "hookDeltas", validateHookDelta);
  if (!hookDeltas.valid) {
    return hookDeltas;
  }

  const playerDeltas = validatePlayerDelta(value.playerDeltas, "playerDeltas");
  if (!playerDeltas.valid) {
    return playerDeltas;
  }

  const newEntities = validateArray(value.newEntities, "newEntities", validateNewEntity);
  if (!newEntities.valid) {
    return newEntities;
  }

  return {
    valid: true,
    value: {
      sceneCast: sceneCast.value,
      timeAdvance: timeAdvance.value,
      npcDeltas: npcDeltas.value,
      edgeDeltas: edgeDeltas.value,
      secretDeltas: secretDeltas.value,
      hookDeltas: hookDeltas.value,
      playerDeltas: playerDeltas.value,
      newEntities: newEntities.value,
    },
  };
}

function validateSceneCast(value: unknown, path: string): ValidationResult<SceneCast> {
  if (!isRecord(value)) {
    return invalid(`${path} must be an object`);
  }

  const active = validateStringArray(value.active, `${path}.active`);
  if (!active.valid) {
    return active;
  }

  const nearby = validateStringArray(value.nearby, `${path}.nearby`);
  if (!nearby.valid) {
    return nearby;
  }

  const offscreen = validateStringArray(value.offscreen, `${path}.offscreen`);
  if (!offscreen.valid) {
    return offscreen;
  }

  const cardPrincipal = validateOptionalString(value.cardPrincipal, `${path}.cardPrincipal`);
  if (!cardPrincipal.valid) {
    return cardPrincipal;
  }

  const beatFocal = validateOptionalString(value.beatFocal, `${path}.beatFocal`);
  if (!beatFocal.valid) {
    return beatFocal;
  }

  const beatDriver = validateOptionalString(value.beatDriver, `${path}.beatDriver`);
  if (!beatDriver.valid) {
    return beatDriver;
  }

  return {
    valid: true,
    value: {
      active: active.value,
      nearby: nearby.value,
      offscreen: offscreen.value,
      cardPrincipal: cardPrincipal.value,
      beatFocal: beatFocal.value,
      beatDriver: beatDriver.value,
    },
  };
}

function validateTimeAdvance(value: unknown, path: string): ValidationResult<TimeAdvance | null> {
  if (typeof value === "undefined" || value === null) {
    return { valid: true, value: null };
  }

  if (!isRecord(value)) {
    return invalid(`${path} must be null or an object`);
  }

  const amount = validateRequiredString(value.amount, `${path}.amount`);
  if (!amount.valid) {
    return amount;
  }

  const newDescriptor = validateRequiredString(value.newDescriptor, `${path}.newDescriptor`);
  if (!newDescriptor.valid) {
    return newDescriptor;
  }

  return {
    valid: true,
    value: {
      amount: amount.value,
      newDescriptor: newDescriptor.value,
    },
  };
}

function validateNpcDelta(value: unknown, path: string): ValidationResult<StateUpdateNpcDelta> {
  if (!isRecord(value)) {
    return invalid(`${path} must be an object`);
  }

  const id = validateRequiredString(value.id, `${path}.id`);
  if (!id.valid) {
    return id;
  }

  const moodNow = validateOptionalString(value.moodNow, `${path}.moodNow`);
  if (!moodNow.valid) {
    return moodNow;
  }

  const locationNow = validateOptionalString(value.locationNow, `${path}.locationNow`);
  if (!locationNow.valid) {
    return locationNow;
  }

  const emotionalStateNow = validateOptionalEmotionalState(
    value.emotionalStateNow,
    `${path}.emotionalStateNow`,
  );
  if (!emotionalStateNow.valid) {
    return emotionalStateNow;
  }

  const agendaNow = validateOptionalString(value.agendaNow, `${path}.agendaNow`);
  if (!agendaNow.valid) {
    return agendaNow;
  }

  return {
    valid: true,
    value: {
      id: id.value,
      moodNow: moodNow.value,
      locationNow: locationNow.value,
      emotionalStateNow: emotionalStateNow.value,
      agendaNow: agendaNow.value,
    },
  };
}

function validateEdgeDelta(value: unknown, path: string): ValidationResult<EdgeDelta> {
  if (!isRecord(value)) {
    return invalid(`${path} must be an object`);
  }

  const from = validateRequiredString(value.from, `${path}.from`);
  if (!from.valid) {
    return from;
  }

  const to = validateRequiredString(value.to, `${path}.to`);
  if (!to.valid) {
    return to;
  }

  const momentary = validateOptionalNumberRecord(value.momentary, `${path}.momentary`);
  if (!momentary.valid) {
    return momentary;
  }

  const durableChanges = validateOptionalNumberRecord(
    value.durableChanges,
    `${path}.durableChanges`,
  );
  if (!durableChanges.valid) {
    return durableChanges;
  }

  const qualifyingEvent = validateOptionalString(value.qualifyingEvent, `${path}.qualifyingEvent`);
  if (!qualifyingEvent.valid) {
    return qualifyingEvent;
  }

  const publicFaceShift = validateOptionalNumber(value.publicFaceShift, `${path}.publicFaceShift`);
  if (!publicFaceShift.valid) {
    return publicFaceShift;
  }

  const boundaryChanges = validateOptionalStringRecord(
    value.boundaryChanges,
    `${path}.boundaryChanges`,
  );
  if (!boundaryChanges.valid) {
    return boundaryChanges;
  }

  return {
    valid: true,
    value: {
      from: from.value,
      to: to.value,
      momentary: momentary.value,
      durableChanges: durableChanges.value,
      qualifyingEvent: qualifyingEvent.value,
      publicFaceShift: publicFaceShift.value,
      boundaryChanges: boundaryChanges.value,
    },
  };
}

function validateSecretDelta(value: unknown, path: string): ValidationResult<SecretDelta> {
  if (!isRecord(value)) {
    return invalid(`${path} must be an object`);
  }

  const secret = validateRequiredString(value.secret, `${path}.secret`);
  if (!secret.valid) {
    return secret;
  }

  const lifecycle = validateRequiredString(value.lifecycle, `${path}.lifecycle`);
  if (!lifecycle.valid) {
    return lifecycle;
  }

  const suspects = validateOptionalStringArray(value.suspects, `${path}.suspects`);
  if (!suspects.valid) {
    return suspects;
  }

  const newEvidence = validateOptionalStringArray(value.newEvidence, `${path}.newEvidence`);
  if (!newEvidence.valid) {
    return newEvidence;
  }

  return {
    valid: true,
    value: {
      secret: secret.value,
      lifecycle: lifecycle.value,
      suspects: suspects.value,
      newEvidence: newEvidence.value,
    },
  };
}

function validateHookDelta(value: unknown, path: string): ValidationResult<HookDelta> {
  if (!isRecord(value)) {
    return invalid(`${path} must be an object`);
  }

  const arc = validateRequiredString(value.arc, `${path}.arc`);
  if (!arc.valid) {
    return arc;
  }

  const fact = validateRequiredString(value.fact, `${path}.fact`);
  if (!fact.valid) {
    return fact;
  }

  const lifecycle = validateRequiredString(value.lifecycle, `${path}.lifecycle`);
  if (!lifecycle.valid) {
    return lifecycle;
  }

  return {
    valid: true,
    value: {
      arc: arc.value,
      fact: fact.value,
      lifecycle: lifecycle.value,
    },
  };
}

function validatePlayerDelta(value: unknown, path: string): ValidationResult<PlayerDelta> {
  if (!isRecord(value)) {
    return invalid(`${path} must be an object`);
  }

  const attire = validateOptionalString(value.attire, `${path}.attire`);
  if (!attire.valid) {
    return attire;
  }

  const physicalState = validateOptionalString(value.physicalState, `${path}.physicalState`);
  if (!physicalState.valid) {
    return physicalState;
  }

  const inventory = validateOptionalInventory(value.inventory, `${path}.inventory`);
  if (!inventory.valid) {
    return inventory;
  }

  return {
    valid: true,
    value: {
      attire: attire.value,
      physicalState: physicalState.value,
      inventory: inventory.value,
    },
  };
}

function validateNewEntity(value: unknown, path: string): ValidationResult<NewEntity> {
  if (!isRecord(value)) {
    return invalid(`${path} must be an object`);
  }

  const name = validateRequiredString(value.name, `${path}.name`);
  if (!name.valid) {
    return name;
  }

  const tier = validateOptionalNpcTier(value.tier, `${path}.tier`);
  if (!tier.valid) {
    return tier;
  }

  const location = validateOptionalString(value.location, `${path}.location`);
  if (!location.valid) {
    return location;
  }

  return {
    valid: true,
    value: {
      name: name.value,
      tier: tier.value,
      location: location.value,
    },
  };
}

function validateOptionalEmotionalState(
  value: unknown,
  path: string,
): ValidationResult<EmotionalState | undefined> {
  if (typeof value === "undefined") {
    return { valid: true, value: undefined };
  }

  if (!isRecord(value)) {
    return invalid(`${path} must be an object`);
  }

  const dominant = validateRequiredString(value.dominant, `${path}.dominant`);
  if (!dominant.valid) {
    return dominant;
  }

  const secondary = validateOptionalString(value.secondary, `${path}.secondary`);
  if (!secondary.valid) {
    return secondary;
  }

  const intensity = validateRequiredNumber(value.intensity, `${path}.intensity`);
  if (!intensity.valid) {
    return intensity;
  }

  return {
    valid: true,
    value: {
      dominant: dominant.value,
      secondary: secondary.value,
      intensity: intensity.value,
    },
  };
}

function validateOptionalInventory(
  value: unknown,
  path: string,
): ValidationResult<PlayerDelta["inventory"] | undefined> {
  if (typeof value === "undefined") {
    return { valid: true, value: undefined };
  }

  if (!isRecord(value)) {
    return invalid(`${path} must be an object`);
  }

  const add = validateOptionalStringArray(value.add, `${path}.add`);
  if (!add.valid) {
    return add;
  }

  const remove = validateOptionalStringArray(value.remove, `${path}.remove`);
  if (!remove.valid) {
    return remove;
  }

  return {
    valid: true,
    value: {
      add: add.value,
      remove: remove.value,
    },
  };
}

function validateArray<T>(
  value: unknown,
  path: string,
  validateItem: (value: unknown, path: string) => ValidationResult<T>,
): ValidationResult<T[]> {
  if (!Array.isArray(value)) {
    return invalid(`${path} must be an array`);
  }

  const result: T[] = [];
  for (const [index, item] of value.entries()) {
    const validated = validateItem(item, `${path}[${index}]`);
    if (!validated.valid) {
      return validated;
    }
    result.push(validated.value);
  }

  return { valid: true, value: result };
}

function validateStringArray(value: unknown, path: string): ValidationResult<string[]> {
  return validateArray(value, path, validateRequiredString);
}

function validateOptionalStringArray(
  value: unknown,
  path: string,
): ValidationResult<string[] | undefined> {
  if (typeof value === "undefined") {
    return { valid: true, value: undefined };
  }

  return validateStringArray(value, path);
}

function validateRequiredString(value: unknown, path: string): ValidationResult<string> {
  if (typeof value !== "string" || value.trim().length === 0) {
    return invalid(`${path} must be a non-empty string`);
  }

  return { valid: true, value };
}

function validateOptionalString(value: unknown, path: string): ValidationResult<string | undefined> {
  if (typeof value === "undefined") {
    return { valid: true, value: undefined };
  }

  return validateRequiredString(value, path);
}

function validateRequiredNumber(value: unknown, path: string): ValidationResult<number> {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return invalid(`${path} must be a finite number`);
  }

  return { valid: true, value };
}

function validateOptionalNumber(value: unknown, path: string): ValidationResult<number | undefined> {
  if (typeof value === "undefined") {
    return { valid: true, value: undefined };
  }

  return validateRequiredNumber(value, path);
}

function validateOptionalNumberRecord(
  value: unknown,
  path: string,
): ValidationResult<Record<string, number> | undefined> {
  if (typeof value === "undefined") {
    return { valid: true, value: undefined };
  }

  if (!isRecord(value)) {
    return invalid(`${path} must be an object`);
  }

  const result: Record<string, number> = {};
  for (const [key, recordValue] of Object.entries(value)) {
    const validated = validateRequiredNumber(recordValue, `${path}.${key}`);
    if (!validated.valid) {
      return validated;
    }
    result[key] = validated.value;
  }

  return { valid: true, value: result };
}

function validateOptionalStringRecord(
  value: unknown,
  path: string,
): ValidationResult<Record<string, string> | undefined> {
  if (typeof value === "undefined") {
    return { valid: true, value: undefined };
  }

  if (!isRecord(value)) {
    return invalid(`${path} must be an object`);
  }

  const result: Record<string, string> = {};
  for (const [key, recordValue] of Object.entries(value)) {
    const validated = validateRequiredString(recordValue, `${path}.${key}`);
    if (!validated.valid) {
      return validated;
    }
    result[key] = validated.value;
  }

  return { valid: true, value: result };
}

function validateOptionalNpcTier(
  value: unknown,
  path: string,
): ValidationResult<NpcTier | undefined> {
  if (typeof value === "undefined") {
    return { valid: true, value: undefined };
  }

  if (value !== "major" && value !== "minor" && value !== "stranger" && value !== "extra") {
    return invalid(`${path} must be one of major, minor, stranger, or extra`);
  }

  return { valid: true, value };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalid<T>(error: string): ValidationResult<T> {
  return { valid: false, error };
}

export function stripStateUpdateBlock(content: string): string {
  return content
    .replace(/^\[STATE_UPDATE\][\t ]*\r?\n[\s\S]*?^\[\/STATE_UPDATE\][\t ]*\r?\n?/m, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function parseCompactLedger(content: string): LedgerData | null {
  const match = content.match(/<details>\s*<summary>[\s\S]*?Cast State[\s\S]*?<\/details>/i);
  if (!match) {
    return null;
  }

  const lines = match[0]
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("<details") && !line.startsWith("<summary") && line !== "</details>");

  const result: LedgerData = {
    focus: null,
    cast: [],
    social: [],
    knownPressure: [],
    player: null,
  };

  for (const line of lines) {
    if (line.startsWith("**Focus:**")) {
      result.focus = parseLedgerEntry(line.replace("**Focus:**", "").trim());
      continue;
    }

    if (line.startsWith("**Cast:**")) {
      const entry = parseLedgerEntry(line.replace("**Cast:**", "").trim());
      if (entry) {
        result.cast.push(entry);
      }
      continue;
    }

    if (line.startsWith("**Bonds/social:**")) {
      result.social.push(line.replace("**Bonds/social:**", "").trim());
      continue;
    }

    if (line.startsWith("**Known pressure:**")) {
      result.knownPressure.push(line.replace("**Known pressure:**", "").trim());
      continue;
    }

    if (line.startsWith("**<user>:**")) {
      const details = line
        .replace("**<user>:**", "")
        .split(";")
        .map((part) => part.trim())
        .filter(Boolean);
      result.player = {
        details,
        physicalState: details.join("; "),
      };
    }
  }

  return result;
}

export function parseLedgerEntry(line: string): LedgerEntry | null {
  const [namePart, detailPart] = line.split(/\s+[—-]\s+/u, 2);
  if (!namePart || !detailPart) {
    return null;
  }

  const details = detailPart
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);

  return {
    name: namePart.trim(),
    location: details[0],
    mood: details[1],
    details,
  };
}
