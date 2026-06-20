import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { applyStateUpdateToWorld, buildWorldDigest, seedWorldGraph } from "../src/shared/world";
import { parseCompactLedger, parseStateUpdateEnvelope } from "../src/shared/parsers";
import type { StateUpdate } from "../src/shared/types";

const validStateUpdate = readFileSync(
  new URL("./fixtures/valid-state-update.txt", import.meta.url),
  "utf8",
);

describe("world graph updates", () => {
  test("seeds a minimal graph from the active character card", () => {
    const graph = seedWorldGraph({
      chatId: "chat-1",
      characterId: "char-1",
      characterName: "Mira",
      characterDescription: "A watchful guild courier.",
      scenario: "Tension in the east market.",
    });

    expect(graph.chatId).toBe("chat-1");
    expect(graph.characterId).toBe("char-1");
    expect(graph.npcs.mira?.tier).toBe("major");
    expect(graph.sceneCast.cardPrincipal).toBe("mira");
    expect(graph.npcs.mira?.profile).toEqual({
      summary: "A watchful guild courier.",
      goals: [],
      fears: [],
      convictions: [],
      selfKnowledge: {
        known: [],
        blindSpots: [],
        denied: [],
      },
    });
    expect(graph.npcs.mira?.display).toEqual({
      arcs: [],
      hooks: [],
    });
  });

  test("applies hidden state, ledger state, and downgrades ungated durable changes", () => {
    const stateUpdate = parseStateUpdateEnvelope(validStateUpdate).parsed;
    const ledger = parseCompactLedger(validStateUpdate);
    const seeded = seedWorldGraph({
      chatId: "chat-1",
      characterId: "char-1",
      characterName: "Mira",
      characterDescription: "A watchful guild courier.",
      scenario: "Tension in the east market.",
    });

    if (!stateUpdate || !ledger) {
      throw new Error("Fixture parsing failed");
    }

    const updated = applyStateUpdateToWorld(seeded, stateUpdate, ledger);

    expect(updated.sceneCast.active).toEqual(["mira", "draven"]);
    expect(updated.npcs.mira?.physicalState.location).toBe("east_market");
    expect(updated.npcs.veth?.physicalState.location).toBe("watchtower");
    expect(updated.npcs.veth?.tier).toBe("stranger");
    expect(updated.npcs.innkeeper_bo?.tier).toBe("stranger");
    expect(updated.relationships["mira->player"]?.durable.trust).toBe(-1);
    expect(updated.relationships["draven->player"]?.durable.trust).toBe(0);
    expect(updated.relationships["draven->player"]?.momentary.trust).toBe(1);
    expect(updated.npcs.hooded_courier?.tier).toBe("stranger");
  });

  test("tracks stranger promotion across consecutive active turns and resets after a gap", () => {
    const seeded = seedWorldGraph({
      chatId: "chat-1",
      characterId: "char-1",
      characterName: "Mira",
    });

    const turnWithShade = (active: string[], nearby: string[] = [], offscreen: string[] = []): StateUpdate => ({
      sceneCast: {
        active,
        nearby,
        offscreen,
        cardPrincipal: "mira",
        beatFocal: "mira",
        beatDriver: active[active.length - 1] ?? "mira",
      },
      timeAdvance: null,
      npcDeltas: active.includes("shade") || nearby.includes("shade") || offscreen.includes("shade")
        ? [{ id: "shade", moodNow: "watchful" }]
        : [],
      edgeDeltas: [],
      secretDeltas: [],
      hookDeltas: [],
      playerDeltas: {},
      newEntities: active.includes("shade")
        ? [{ name: "Shade", location: "lantern_row" }]
        : [],
    });

    const first = applyStateUpdateToWorld(seeded, turnWithShade(["mira", "shade"]), null);
    expect(first.npcs.shade?.tier).toBe("stranger");
    expect(first.npcs.shade?.sceneTurnCount).toBe(1);

    const second = applyStateUpdateToWorld(first, turnWithShade(["mira", "shade"]), null);
    expect(second.npcs.shade?.sceneTurnCount).toBe(2);
    expect(second.npcs.shade?.tier).toBe("stranger");

    const third = applyStateUpdateToWorld(second, turnWithShade(["mira"], [], ["shade"]), null);
    expect(third.npcs.shade?.sceneTurnCount).toBe(0);
    expect(third.npcs.shade?.tier).toBe("stranger");

    const fourth = applyStateUpdateToWorld(third, turnWithShade(["mira", "shade"]), null);
    expect(fourth.npcs.shade?.sceneTurnCount).toBe(1);
    expect(fourth.npcs.shade?.tier).toBe("stranger");

    const fifth = applyStateUpdateToWorld(fourth, turnWithShade(["mira", "shade"]), null);
    const sixth = applyStateUpdateToWorld(fifth, turnWithShade(["mira", "shade"]), null);
    expect(sixth.npcs.shade?.sceneTurnCount).toBe(3);
    expect(sixth.npcs.shade?.tier).toBe("minor");
    expect(sixth.npcs.shade?.profile).toEqual({
      goals: [],
      fears: [],
      convictions: [],
      selfKnowledge: {
        known: [],
        blindSpots: [],
        denied: [],
      },
    });
    expect(sixth.npcs.shade?.display).toEqual({
      arcs: [],
      hooks: [],
    });
  });

  test("captures richer relationship display state and qualifying-event audit without changing existing edge semantics", () => {
    const seeded = seedWorldGraph({
      chatId: "chat-1",
      characterId: "char-1",
      characterName: "Mira",
    });

    const updated = applyStateUpdateToWorld(
      seeded,
      {
        sceneCast: {
          active: ["mira", "draven"],
          nearby: [],
          offscreen: [],
          cardPrincipal: "mira",
          beatFocal: "mira",
          beatDriver: "draven",
        },
        timeAdvance: null,
        npcDeltas: [{ id: "draven", moodNow: "guarded" }],
        edgeDeltas: [
          {
            from: "Mira",
            to: "Draven",
            durableChanges: { trust: 2, betrayal_scar: 1 },
            publicFaceShift: -1,
            boundaryChanges: { emotional: "guarded", physical: "closed" },
            qualifyingEvent: "Draven covered for Mira at the gate",
          },
        ],
        secretDeltas: [],
        hookDeltas: [],
        playerDeltas: {},
        newEntities: [{ name: "Draven", tier: "major", location: "south_gate" }],
      },
      null,
    );

    expect(updated.relationships["mira->draven"]).toMatchObject({
      durable: {
        trust: 2,
        betrayal_scar: 1,
        public_face: -1,
      },
      momentary: {},
      boundaryChanges: {
        emotional: "guarded",
        physical: "closed",
      },
      qualifyingEvents: ["Draven covered for Mira at the gate"],
      knowledgeBuckets: {
        mutual: [],
        fromKnows: [],
        toKnows: [],
        publicRumors: [],
      },
      publicFace: {
        score: -1,
      },
      betrayalScar: {
        score: 1,
      },
    });
    expect(updated.relationships["mira->draven"]?.boundaryStates).toMatchObject({
      emotional: { state: "guarded" },
      physical: { state: "closed" },
    });
    expect(updated.relationships["mira->draven"]?.qualifyingEventAudit).toEqual([
      {
        event: "Draven covered for Mira at the gate",
        axes: ["betrayal_scar", "trust"],
        publicFaceShift: -1,
        boundaryDomains: ["emotional", "physical"],
      },
    ]);
  });

  test("backfills additive tracker fields for legacy-shaped npc and relationship records", () => {
    const seeded = seedWorldGraph({
      chatId: "chat-1",
      characterId: "char-1",
      characterName: "Mira",
    });

    const legacyGraph = {
      ...seeded,
      npcs: {
        mira: {
          id: "mira",
          name: "Mira",
          tier: "major",
          aliases: ["Mira"],
          physicalState: {
            location: "east_market",
            details: [],
          },
          sceneTurnCount: 2,
          secrets: [],
          hooks: [],
        },
      },
      relationships: {
        "mira->draven": {
          from: "mira",
          to: "draven",
          durable: { betrayal_scar: 2 },
          momentary: { trust: 1 },
          boundaryChanges: { social: "strained" },
          qualifyingEvents: ["Old slight at the docks"],
        },
      },
    } as typeof seeded;

    const updated = applyStateUpdateToWorld(
      legacyGraph,
      {
        sceneCast: {
          active: ["mira", "draven"],
          nearby: [],
          offscreen: [],
          cardPrincipal: "mira",
          beatFocal: "mira",
          beatDriver: "draven",
        },
        timeAdvance: null,
        npcDeltas: [{ id: "mira", agendaNow: "Keep Draven cooperative" }],
        edgeDeltas: [
          {
            from: "Mira",
            to: "Draven",
            durableChanges: { trust: 1 },
            publicFaceShift: 2,
            boundaryChanges: { social: "careful" },
            qualifyingEvent: "Mira vouched for Draven in public",
          },
        ],
        secretDeltas: [],
        hookDeltas: [],
        playerDeltas: {},
        newEntities: [{ name: "Draven", location: "south_gate" }],
      },
      null,
    );

    expect(updated.npcs.mira?.profile).toEqual({
      goals: [],
      fears: [],
      convictions: [],
      selfKnowledge: {
        known: [],
        blindSpots: [],
        denied: [],
      },
    });
    expect(updated.npcs.mira?.display).toEqual({
      arcs: [],
      hooks: [],
    });
    expect(updated.relationships["mira->draven"]).toMatchObject({
      durable: {
        betrayal_scar: 2,
        trust: 1,
        public_face: 2,
      },
      boundaryChanges: {
        social: "careful",
      },
      publicFace: {
        score: 2,
      },
      betrayalScar: {
        score: 2,
      },
      knowledgeBuckets: {
        mutual: [],
        fromKnows: [],
        toKnows: [],
        publicRumors: [],
      },
    });
    expect(updated.relationships["mira->draven"]?.boundaryStates).toMatchObject({
      social: {
        state: "careful",
      },
    });
    expect(updated.relationships["mira->draven"]?.qualifyingEventAudit).toEqual([
      {
        event: "Mira vouched for Draven in public",
        axes: ["trust"],
        publicFaceShift: 2,
        boundaryDomains: ["social"],
      },
    ]);
  });

  test("builds a compact digest that keeps priority state under the token budget", () => {
    const stateUpdate = parseStateUpdateEnvelope(validStateUpdate).parsed;
    const ledger = parseCompactLedger(validStateUpdate);
    const seeded = seedWorldGraph({
      chatId: "chat-1",
      characterId: "char-1",
      characterName: "Mira",
      characterDescription: "A watchful guild courier.",
      scenario: "Tension in the east market.",
    });

    if (!stateUpdate || !ledger) {
      throw new Error("Fixture parsing failed");
    }

    const updated = applyStateUpdateToWorld(seeded, stateUpdate, ledger);
    const digest = buildWorldDigest(updated);
    const approximateTokens = Math.ceil(digest.length / 4);

    expect(digest).toContain("scene:");
    expect(digest).toContain("active:");
    expect(digest).toContain("mira_true_faction");
    expect(digest).toContain("player:");
    expect(approximateTokens).toBeLessThanOrEqual(200);
  });
});
