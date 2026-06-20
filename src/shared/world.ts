import type {
  LedgerData,
  NpcDisplayState,
  NpcProfile,
  RelationshipEdge,
  SeedWorldGraphInput,
  StateUpdate,
  WorldGraph,
  WorldSummary,
} from "./types";

export function seedWorldGraph(input: SeedWorldGraphInput): WorldGraph {
  const now = new Date().toISOString();
  const principalId = slugify(input.characterName);
  return {
    chatId: input.chatId,
    characterId: input.characterId,
    detectedPreset: inferDetectedPreset(input.scenario),
    createdAt: now,
    updatedAt: now,
    scenario: input.scenario,
    worldTime: null,
    sceneCast: {
      active: [],
      nearby: [],
      offscreen: [],
      cardPrincipal: principalId,
      beatFocal: principalId,
      beatDriver: principalId,
    },
    npcs: {
      [principalId]: {
        id: principalId,
        name: input.characterName,
        tier: "major",
        aliases: [input.characterName],
        physicalState: {
          details: [],
        },
        sceneTurnCount: 0,
        secrets: [],
        hooks: [],
        description: input.characterDescription,
        profile: createNpcProfile(input.characterDescription),
        display: createNpcDisplayState(),
      },
    },
    relationships: {},
    secrets: [],
    hooks: [],
    player: {
      inventory: [],
    },
  };
}

export function applyStateUpdateToWorld(
  graph: WorldGraph,
  stateUpdate: StateUpdate,
  ledger: LedgerData | null,
): WorldGraph {
  const previousActiveIds = new Set(graph.sceneCast.active);
  const next = structuredClone(graph);
  normalizeWorldGraph(next);
  next.updatedAt = new Date().toISOString();
  next.sceneCast = {
    ...stateUpdate.sceneCast,
  };
  next.worldTime = stateUpdate.timeAdvance ?? null;

  applyLedger(next, ledger);

  for (const delta of stateUpdate.npcDeltas) {
    const npc = ensureNpc(next, delta.id);
    if (delta.locationNow) {
      npc.physicalState.location = delta.locationNow;
    }
    if (delta.moodNow) {
      npc.physicalState.mood = delta.moodNow;
    }
    if (delta.emotionalStateNow) {
      npc.emotionalState = delta.emotionalStateNow;
    }
    if (delta.agendaNow) {
      npc.agendaNow = delta.agendaNow;
    }
  }

  for (const entity of stateUpdate.newEntities) {
    const id = slugify(entity.name);
    const npc = ensureNpc(next, id, entity.name);
    npc.tier = entity.tier ?? npc.tier;
    if (entity.location) {
      npc.physicalState.location = entity.location;
    }
  }

  for (const edgeDelta of stateUpdate.edgeDeltas) {
    const from = slugify(edgeDelta.from);
    const to = slugify(edgeDelta.to);
    const relationship = ensureRelationship(next, from, to);

    for (const [axis, change] of Object.entries(edgeDelta.momentary ?? {})) {
      relationship.momentary[axis] = (relationship.momentary[axis] ?? 0) + change;
    }

    for (const [axis, change] of Object.entries(edgeDelta.durableChanges ?? {})) {
      if (edgeDelta.qualifyingEvent) {
        relationship.durable[axis] = (relationship.durable[axis] ?? 0) + change;
      } else {
        relationship.durable[axis] = relationship.durable[axis] ?? 0;
        relationship.momentary[axis] = (relationship.momentary[axis] ?? 0) + change;
      }
    }

    if (typeof edgeDelta.publicFaceShift === "number") {
      relationship.durable.public_face =
        (relationship.durable.public_face ?? 0) + edgeDelta.publicFaceShift;
      relationship.publicFace ??= { score: 0 };
      relationship.publicFace.score = relationship.durable.public_face;
    }

    for (const [domain, state] of Object.entries(edgeDelta.boundaryChanges ?? {})) {
      relationship.boundaryChanges[domain] = state;
      relationship.boundaryStates ??= {};
      relationship.boundaryStates[domain] = {
        state,
        qualifyingEvent: edgeDelta.qualifyingEvent,
      };
    }

    relationship.betrayalScar ??= { score: 0 };
    relationship.betrayalScar.score = relationship.durable.betrayal_scar ?? 0;

    if (edgeDelta.qualifyingEvent) {
      relationship.qualifyingEvents.push(edgeDelta.qualifyingEvent);
      relationship.qualifyingEventAudit ??= [];
      relationship.qualifyingEventAudit.push({
        event: edgeDelta.qualifyingEvent,
        axes: Object.keys(edgeDelta.durableChanges ?? {}).sort(),
        publicFaceShift: edgeDelta.publicFaceShift,
        boundaryDomains: Object.keys(edgeDelta.boundaryChanges ?? {}).sort(),
      });
    }
  }

  // Secrets merge by `secret` key: update lifecycle and accumulate suspects/evidence
  // for existing entries, append new ones, and PRESERVE any secret the model omitted
  // this turn. (Design intent: durable accumulation, not per-turn replacement.)
  const secretByKey = new Map(next.secrets.map((s) => [s.secret, s]));
  for (const delta of stateUpdate.secretDeltas) {
    const existing = secretByKey.get(delta.secret);
    if (existing) {
      existing.lifecycle = delta.lifecycle;
      existing.suspects = Array.from(new Set([...existing.suspects, ...(delta.suspects ?? [])]));
      existing.evidence = Array.from(new Set([...existing.evidence, ...(delta.newEvidence ?? [])]));
    } else {
      secretByKey.set(delta.secret, {
        secret: delta.secret,
        lifecycle: delta.lifecycle,
        suspects: delta.suspects ?? [],
        evidence: delta.newEvidence ?? [],
      });
    }
  }
  next.secrets = [...secretByKey.values()];

  // Hooks merge by `arc|fact` composite key: update lifecycle for existing hooks,
  // append new ones, and PRESERVE any hook the model omitted this turn.
  const hookByKey = new Map(next.hooks.map((h) => [`${h.arc}|${h.fact}`, h]));
  for (const delta of stateUpdate.hookDeltas) {
    const key = `${delta.arc}|${delta.fact}`;
    const existing = hookByKey.get(key);
    if (existing) {
      existing.lifecycle = delta.lifecycle;
    } else {
      hookByKey.set(key, { arc: delta.arc, fact: delta.fact, lifecycle: delta.lifecycle });
    }
  }
  next.hooks = [...hookByKey.values()];

  if (stateUpdate.playerDeltas.attire) {
    next.player.attire = stateUpdate.playerDeltas.attire;
  }
  if (stateUpdate.playerDeltas.physicalState) {
    next.player.physicalState = stateUpdate.playerDeltas.physicalState;
  }
  if (stateUpdate.playerDeltas.inventory?.add?.length) {
    for (const item of stateUpdate.playerDeltas.inventory.add) {
      if (!next.player.inventory.includes(item)) {
        next.player.inventory.push(item);
      }
    }
  }
  if (stateUpdate.playerDeltas.inventory?.remove?.length) {
    next.player.inventory = next.player.inventory.filter(
      (item) => !stateUpdate.playerDeltas.inventory?.remove?.includes(item),
    );
  }

  updateSceneTurnProgression(next, previousActiveIds);

  return next;
}

export function buildWorldDigest(graph: WorldGraph): string {
  const maxDigestTokens = 200;
  const lines: string[] = [];

  appendDigestLine(
    lines,
    `scene: active: ${summarizeCastIds(graph.sceneCast.active)} | nearby: ${summarizeCastIds(
      graph.sceneCast.nearby,
    )} | offscreen: ${summarizeCastIds(graph.sceneCast.offscreen)}`,
    maxDigestTokens,
  );

  if (graph.worldTime?.newDescriptor) {
    appendDigestLine(
      lines,
      `time: ${graph.worldTime.newDescriptor} (${graph.worldTime.amount})`,
      maxDigestTokens,
    );
  }

  for (const id of graph.sceneCast.active) {
    const npc = graph.npcs[id];
    if (!npc) {
      continue;
    }

    appendDigestLine(
      lines,
      `active: ${id} @ ${npc.physicalState.location ?? "unknown"} | mood: ${
        npc.physicalState.mood ?? npc.emotionalState?.dominant ?? "unknown"
      } | agenda: ${npc.agendaNow ?? "none"}`,
      maxDigestTokens,
    );
  }

  const pressureSummary = buildPressureSummary(graph);
  if (pressureSummary) {
    appendDigestLine(lines, pressureSummary, maxDigestTokens);
  }

  if (graph.player.physicalState || graph.player.attire) {
    appendDigestLine(
      lines,
      `player: attire: ${graph.player.attire ?? "unknown"} | state: ${
        graph.player.physicalState ?? "unknown"
      }${graph.player.inventory.length > 0 ? ` | inventory: ${graph.player.inventory.join(", ")}` : ""}`,
      maxDigestTokens,
    );
  }

  return lines.join("\n");
}

export function summarizeWorld(graph: WorldGraph | null): WorldSummary {
  if (!graph) {
    return {
      hasWorld: false,
      activeCast: [],
      hotAlerts: [],
      npcCount: 0,
      relationshipCount: 0,
    };
  }

  const hotAlerts: string[] = [];

  for (const secret of graph.secrets) {
    if (
      secret.lifecycle.includes("tested") ||
      secret.lifecycle.includes("partial_exposure") ||
      secret.lifecycle.includes("full_exposure")
    ) {
      hotAlerts.push(`Secret pressure: ${secret.secret}`);
    }
  }

  for (const hook of graph.hooks) {
    if (hook.lifecycle.includes("ripe") || hook.lifecycle.includes("payoff")) {
      hotAlerts.push(`Hook ready: ${hook.fact}`);
    }
  }

  for (const npcId of graph.sceneCast.active) {
    const npc = graph.npcs[npcId];
    if (npc?.agendaNow) {
      hotAlerts.push(`${npc.name}: ${npc.agendaNow}`);
    }
  }

  return {
    hasWorld: true,
    activeCast: graph.sceneCast.active.map((id) => graph.npcs[id]?.name ?? id),
    hotAlerts: hotAlerts.slice(0, 5),
    npcCount: Object.keys(graph.npcs).length,
    relationshipCount: Object.keys(graph.relationships).length,
  };
}

export function getRelationshipKey(from: string, to: string): string {
  return `${from}->${to}`;
}

export function ensureRelationship(
  graph: WorldGraph,
  from: string,
  to: string,
): RelationshipEdge {
  const key = getRelationshipKey(from, to);
  if (!graph.relationships[key]) {
    graph.relationships[key] = {
      from,
      to,
      durable: {},
      momentary: {},
      boundaryChanges: {},
      qualifyingEvents: [],
      knowledgeBuckets: {
        mutual: [],
        fromKnows: [],
        toKnows: [],
        publicRumors: [],
      },
      publicFace: {
        score: 0,
      },
      betrayalScar: {
        score: 0,
      },
      boundaryStates: {},
      qualifyingEventAudit: [],
    };
  }
  backfillRelationship(graph.relationships[key]);
  return graph.relationships[key];
}

function applyLedger(graph: WorldGraph, ledger: LedgerData | null): void {
  if (!ledger) {
    return;
  }

  if (ledger.focus) {
    const npc = ensureNpc(graph, slugify(ledger.focus.name), ledger.focus.name);
    npc.physicalState.location = ledger.focus.location;
    npc.physicalState.mood = ledger.focus.mood;
    npc.physicalState.details = ledger.focus.details;
  }

  for (const castEntry of ledger.cast) {
    const npc = ensureNpc(graph, slugify(castEntry.name), castEntry.name);
    npc.physicalState.location = castEntry.location;
    npc.physicalState.mood = castEntry.mood;
    npc.physicalState.details = castEntry.details;
  }

  if (ledger.player) {
    graph.player.physicalState = ledger.player.physicalState;
  }
}

function ensureNpc(graph: WorldGraph, id: string, displayName?: string) {
  if (!graph.npcs[id]) {
    graph.npcs[id] = {
      id,
      name: displayName ?? titleCaseFromId(id),
      tier: "stranger",
      aliases: displayName ? [displayName] : [titleCaseFromId(id)],
      physicalState: {
        details: [],
      },
      sceneTurnCount: 0,
      secrets: [],
      hooks: [],
      profile: createNpcProfile(),
      display: createNpcDisplayState(),
    };
  }

  backfillNpc(graph.npcs[id], displayName);

  return graph.npcs[id];
}

function normalizeWorldGraph(graph: WorldGraph): void {
  for (const npc of Object.values(graph.npcs)) {
    backfillNpc(npc);
  }

  for (const relationship of Object.values(graph.relationships)) {
    backfillRelationship(relationship);
  }
}

function createNpcProfile(summary?: string): NpcProfile {
  return {
    ...(summary ? { summary } : {}),
    goals: [],
    fears: [],
    convictions: [],
    selfKnowledge: {
      known: [],
      blindSpots: [],
      denied: [],
    },
  };
}

function createNpcDisplayState(): NpcDisplayState {
  return {
    arcs: [],
    hooks: [],
  };
}

function backfillNpc(
  npc: WorldGraph["npcs"][string],
  displayName?: string,
): void {
  npc.aliases ??= [displayName ?? npc.name ?? titleCaseFromId(npc.id)];
  npc.physicalState ??= { details: [] };
  npc.physicalState.details ??= [];
  npc.secrets ??= [];
  npc.hooks ??= [];
  npc.profile ??= createNpcProfile(npc.description);
  npc.display ??= createNpcDisplayState();
}

function backfillRelationship(relationship: RelationshipEdge): void {
  relationship.durable ??= {};
  relationship.momentary ??= {};
  relationship.boundaryChanges ??= {};
  relationship.qualifyingEvents ??= [];
  relationship.knowledgeBuckets ??= {
    mutual: [],
    fromKnows: [],
    toKnows: [],
    publicRumors: [],
  };
  relationship.publicFace ??= {
    score: relationship.durable.public_face ?? 0,
  };
  relationship.betrayalScar ??= {
    score: relationship.durable.betrayal_scar ?? 0,
  };
  relationship.boundaryStates ??= {};
  relationship.qualifyingEventAudit ??= [];
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function inferDetectedPreset(scenario?: string): string {
  // Heuristic only — display label, never gates behavior.
  // TODO(phase-1.5): richer preset detection
  const text = (scenario ?? "").toLowerCase();
  if (text.includes("mlrpe")) return "mlrpe";
  return "unknown";
}

function titleCaseFromId(value: string): string {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function updateSceneTurnProgression(graph: WorldGraph, previousActiveIds: Set<string>): void {
  const activeIds = new Set(graph.sceneCast.active);

  for (const npc of Object.values(graph.npcs)) {
    if (activeIds.has(npc.id)) {
      npc.sceneTurnCount = previousActiveIds.has(npc.id) ? npc.sceneTurnCount + 1 : 1;
      if (npc.tier === "stranger" && npc.sceneTurnCount >= 3) {
        npc.tier = "minor";
      }
      continue;
    }

    npc.sceneTurnCount = 0;
  }
}

function buildPressureSummary(graph: WorldGraph): string | null {
  const pressureItems = [
    ...graph.secrets.map((secret) => `secret:${secret.secret}[${secret.lifecycle}]`),
    ...graph.hooks.map((hook) => `hook:${hook.fact}[${hook.lifecycle}]`),
  ];

  if (pressureItems.length === 0) {
    return null;
  }

  return `pressure: ${pressureItems.join("; ")}`;
}

function summarizeCastIds(ids: string[], limit = 3): string {
  if (ids.length === 0) {
    return "none";
  }

  if (ids.length <= limit) {
    return ids.join(", ");
  }

  return `${ids.slice(0, limit).join(", ")} +${ids.length - limit}`;
}

function appendDigestLine(lines: string[], line: string, maxTokens: number): void {
  const current = lines.join("\n");
  const separatorLength = current.length > 0 ? 1 : 0;
  const remainingChars = maxTokens * 4 - current.length - separatorLength;

  if (remainingChars <= 0) {
    return;
  }

  const nextLine = line.length <= remainingChars ? line : truncateToLength(line, remainingChars);
  const candidate = current.length > 0 ? `${current}\n${nextLine}` : nextLine;

  if (estimateTokens(candidate) <= maxTokens) {
    lines.push(nextLine);
  }
}

function estimateTokens(value: string): number {
  return Math.ceil(value.length / 4);
}

function truncateToLength(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  if (maxLength <= 3) {
    return value.slice(0, maxLength);
  }

  return `${value.slice(0, maxLength - 3).trimEnd()}...`;
}
