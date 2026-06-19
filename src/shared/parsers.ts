import type { LedgerData, LedgerEntry, StateUpdate } from "./types";

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
    return {
      found: true,
      rawBlock,
      jsonText,
      parsed: JSON.parse(jsonText) as StateUpdate,
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
