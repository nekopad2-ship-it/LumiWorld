import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import {
  parseCompactLedger,
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

  test("strips only the hidden STATE_UPDATE block and leaves visible ledger content behind", () => {
    const stripped = stripStateUpdateBlock(validStateUpdate);

    expect(stripped).not.toContain("[STATE_UPDATE]");
    expect(stripped).toContain("<details><summary>🗃️ Cast State</summary>");
    expect(stripped).toContain("The market fell quiet");
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
