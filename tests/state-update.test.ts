import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import {
  parseCompactLedger,
  parseLedgerEntry,
  parseStateUpdateEnvelope,
  stripStateUpdateBlock,
} from "../src/shared/parsers";

const validStateUpdate = readFileSync(
  new URL("./fixtures/valid-state-update.txt", import.meta.url),
  "utf8",
);
const invalidStateUpdate = readFileSync(
  new URL("./fixtures/invalid-state-update.txt", import.meta.url),
  "utf8",
);
const compactLedger = readFileSync(
  new URL("./fixtures/compact-ledger.txt", import.meta.url),
  "utf8",
);

describe("STATE_UPDATE parsing", () => {
  test("extracts and parses a valid STATE_UPDATE block embedded in chat content", () => {
    const result = parseStateUpdateEnvelope(validStateUpdate);

    expect(result.found).toBe(true);
    expect(result.error).toBeNull();
    expect(result.parsed?.sceneCast.active).toEqual(["mira", "draven"]);
    expect(result.parsed?.npcDeltas[1]?.locationNow).toBe("watchtower");
    expect(result.parsed?.newEntities[0]?.name).toBe("Hooded Courier");
  });

  test("captures malformed JSON without pretending the state update is valid", () => {
    const result = parseStateUpdateEnvelope(invalidStateUpdate);

    expect(result.found).toBe(true);
    expect(result.parsed).toBeNull();
    expect(result.error).toContain("JSON");
    expect(result.rawBlock).toContain("[STATE_UPDATE]");
  });

  test("rejects contract-invalid JSON that is syntactically valid", () => {
    const invalidBlocks = [
      {
        name: "missing required arrays",
        payload: {
          sceneCast: {
            active: ["mira"],
            nearby: [],
            offscreen: [],
          },
          timeAdvance: null,
          npcDeltas: [],
          edgeDeltas: [],
          secretDeltas: [],
          hookDeltas: [],
          playerDeltas: {},
        },
      },
      {
        name: "wrong sceneCast scalar type",
        payload: {
          sceneCast: {
            active: "mira",
            nearby: [],
            offscreen: [],
          },
          timeAdvance: null,
          npcDeltas: [],
          edgeDeltas: [],
          secretDeltas: [],
          hookDeltas: [],
          playerDeltas: {},
          newEntities: [],
        },
      },
      {
        name: "wrong nested delta type",
        payload: {
          sceneCast: {
            active: ["mira"],
            nearby: [],
            offscreen: [],
          },
          timeAdvance: null,
          npcDeltas: [
            {
              id: "mira",
              emotionalStateNow: {
                dominant: "tense",
                intensity: "high",
              },
            },
          ],
          edgeDeltas: [],
          secretDeltas: [],
          hookDeltas: [],
          playerDeltas: {},
          newEntities: [],
        },
      },
      {
        name: "wrong inventory item type",
        payload: {
          sceneCast: {
            active: ["mira"],
            nearby: [],
            offscreen: [],
          },
          timeAdvance: null,
          npcDeltas: [],
          edgeDeltas: [],
          secretDeltas: [],
          hookDeltas: [],
          playerDeltas: {
            inventory: {
              add: ["sealed letter", 7],
            },
          },
          newEntities: [],
        },
      },
    ];

    for (const invalidBlock of invalidBlocks) {
      const wrapped = `Visible text\n\n[STATE_UPDATE]\n${JSON.stringify(invalidBlock.payload, null, 2)}\n[/STATE_UPDATE]`;
      const result = parseStateUpdateEnvelope(wrapped);

      expect(result.found).toBe(true);
      expect(result.parsed).toBeNull();
      expect(result.error).toContain("STATE_UPDATE contract");
    }
  });

  test("strips only the hidden STATE_UPDATE block and leaves visible ledger content behind", () => {
    const stripped = stripStateUpdateBlock(validStateUpdate);

    expect(stripped).not.toContain("[STATE_UPDATE]");
    expect(stripped).toContain("<details><summary>🗃️ Cast State</summary>");
    expect(stripped).toContain("The market fell quiet");
  });

  test("ignores a STATE_UPDATE that appears only inside a reasoning block", () => {
    const reasoningOnly = [
      "Some prose.",
      "<thinking>",
      "[STATE_UPDATE]",
      JSON.stringify({
        sceneCast: { active: ["mira"], nearby: [], offscreen: [] },
        npcDeltas: [],
        edgeDeltas: [],
        secretDeltas: [],
        hookDeltas: [],
        playerDeltas: {},
        newEntities: [],
      }),
      "[/STATE_UPDATE]",
      "</thinking>",
    ].join("\n");
    const result = parseStateUpdateEnvelope(reasoningOnly);
    expect(result.found).toBe(false);
  });
});

describe("compact ledger parsing", () => {
  test("extracts visible state for focus, cast members, and player logistics", () => {
    const parsed = parseCompactLedger(compactLedger);

    expect(parsed).not.toBeNull();
    expect(parsed?.focus?.name).toBe("Mira");
    expect(parsed?.focus?.location).toBe("east_market");
    expect(parsed?.cast.map((entry) => entry.name)).toEqual(["Draven", "Innkeeper Bo"]);
    expect(parsed?.player?.physicalState).toContain("shallow cut");
    expect(parsed?.knownPressure.join(" ")).toContain("sealed letter");
  });
});

describe("ledger parsing robustness", () => {
  test("parseLedgerEntry tolerates a Cast row with mood but no explicit location", () => {
    const entry = parseLedgerEntry("Mira — guarded");
    expect(entry?.name).toBe("Mira");
    expect(entry?.details).toContain("guarded");
    // Do not assert location==='guarded' — we want no crash + sensible details.
    expect(entry?.location).toBeFalsy();
  });

  test("parseCompactLedger still parses the canonical fixture", () => {
    const data = parseCompactLedger(compactLedger);
    expect(data).not.toBeNull();
    expect(data?.focus?.name).toBeTruthy();
  });

  test("parseCompactLedger tolerates a summary without the word 'Cast State'", () => {
    const alt = `<details><summary>🗃️ Ledger</summary>\n**Focus:** Mira — market; guarded\n</details>`;
    const data = parseCompactLedger(alt);
    // Must not throw; either parses or returns null cleanly.
    expect(data === null || typeof data.focus === "object").toBe(true);
  });
});
