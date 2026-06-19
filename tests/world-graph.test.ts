import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { applyStateUpdateToWorld, buildWorldDigest, seedWorldGraph } from "../src/shared/world";
import { parseCompactLedger, parseStateUpdateEnvelope } from "../src/shared/parsers";

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
    expect(updated.relationships["mira->player"]?.durable.trust).toBe(-1);
    expect(updated.relationships["draven->player"]?.durable.trust).toBe(0);
    expect(updated.relationships["draven->player"]?.momentary.trust).toBe(1);
    expect(updated.npcs.hooded_courier?.tier).toBe("stranger");
  });

  test("builds a compact digest that keeps scene state under the token budget", () => {
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

    expect(digest).toContain("scene:");
    expect(digest).toContain("mira");
    expect(digest).toContain("mira_true_faction");
    expect(digest.split(/\s+/).length).toBeLessThanOrEqual(200);
  });
});
