import type {
  LedgerData,
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
    detectedPreset: "mlrpe",
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
  const next = structuredClone(graph);
  next.updatedAt = new Date().toISOString();
  next.sceneCast = {
    ...stateUpdate.sceneCast,
  };
  next.worldTime = stateUpdate.timeAdvance;

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
    }

    for (const [domain, state] of Object.entries(edgeDelta.boundaryChanges ?? {})) {
      relationship.boundaryChanges[domain] = state;
    }

    if (edgeDelta.qualifyingEvent) {
      relationship.qualifyingEvents.push(edgeDelta.qualifyingEvent);
    }
  }

  next.secrets = stateUpdate.secretDeltas.map((secret) => ({
    secret: secret.secret,
    lifecycle: secret.lifecycle,
    suspects: secret.suspects ?? [],
    evidence: secret.newEvidence ?? [],
  }));

  next.hooks = stateUpdate.hookDeltas.map((hook) => ({
    arc: hook.arc,
    fact: hook.fact,
    lifecycle: hook.lifecycle,
  }));

  if (stateUpdate.playerDeltas?.attire) {
    next.player.attire = stateUpdate.playerDeltas.attire;
  }
  if (stateUpdate.playerDeltas?.physicalState) {
    next.player.physicalState = stateUpdate.playerDeltas.physicalState;
  }
  if (stateUpdate.playerDeltas?.inventory?.add?.length) {
    for (const item of stateUpdate.playerDeltas.inventory.add) {
      if (!next.player.inventory.includes(item)) {
        next.player.inventory.push(item);
      }
    }
  }
  if (stateUpdate.playerDeltas?.inventory?.remove?.length) {
    next.player.inventory = next.player.inventory.filter(
      (item) => !stateUpdate.playerDeltas?.inventory?.remove?.includes(item),
    );
  }

  for (const activeId of next.sceneCast.active) {
    const npc = next.npcs[activeId];
    if (npc) {
      npc.sceneTurnCount += 1;
      if (npc.tier === "stranger" && npc.sceneTurnCount >= 3) {
        npc.tier = "minor";
      }
    }
  }

  return next;
}

export function buildWorldDigest(graph: WorldGraph): string {
  const lines: string[] = [];

  lines.push(
    `scene: active=${graph.sceneCast.active.join(", ") || "none"}; nearby=${
      graph.sceneCast.nearby.join(", ") || "none"
    }; offscreen=${graph.sceneCast.offscreen.join(", ") || "none"}`,
  );

  if (graph.worldTime?.newDescriptor) {
    lines.push(`time: ${graph.worldTime.newDescriptor} (${graph.worldTime.amount})`);
  }

  for (const id of graph.sceneCast.active) {
    const npc = graph.npcs[id];
    if (!npc) {
      continue;
    }

    lines.push(
      `${id}: loc=${npc.physicalState.location ?? "unknown"}; mood=${
        npc.physicalState.mood ?? npc.emotionalState?.dominant ?? "unknown"
      }; agenda=${npc.agendaNow ?? "none"}`,
    );
  }

  if (graph.secrets.length > 0) {
    lines.push(
      `secrets: ${graph.secrets
        .map((secret) => `${secret.secret}(${secret.lifecycle})`)
        .join(", ")}`,
    );
  }

  if (graph.player.physicalState || graph.player.attire) {
    lines.push(
      `player: attire=${graph.player.attire ?? "unknown"}; state=${
        graph.player.physicalState ?? "unknown"
      }`,
    );
  }

  return truncateWords(lines.join("\n"), 200);
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
    };
  }
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
      tier: "minor",
      aliases: displayName ? [displayName] : [titleCaseFromId(id)],
      physicalState: {
        details: [],
      },
      sceneTurnCount: 0,
      secrets: [],
      hooks: [],
    };
  }

  return graph.npcs[id];
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function titleCaseFromId(value: string): string {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function truncateWords(value: string, maxWords: number): string {
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) {
    return value;
  }

  return `${words.slice(0, maxWords).join(" ")} ...`;
}
