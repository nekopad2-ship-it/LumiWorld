export function buildExtractionSystemPrompt(): string {
  return `You are extracting grounded world-state changes from a single turn of a roleplay conversation.

Rules:
- Extract only changes explicitly stated or directly implied in the text.
- Do not invent hidden motives, elapsed time, relationships, or events not grounded in the text.
- Separate attempts from completed outcomes.
- Dialogue claims are NOT objective truth.
- If no time cue is present, return timeCue as null.
- Use stable entity IDs: snake_case derived from the entity name.

Return ONLY a valid JSON object with these fields:
- entities[]: { id: string, kind: "player"|"character_card_principal"|"npc"|"location"|"faction"|"object", name: string, source: "seed"|"user"|"system" }
- locations[]: { id: string, label: string }
- events[]: { id: string, kind: string, summary: string, participants: string[], locationId: string|null }
- timeCue: null | { time: string, source: string }
- committedFacts: string[]
- relationships[]: { sourceId: string, targetId: string, stance: string, evidence: string }`;
}

export function buildExtractionUserPrompt(input: {
  userMessage: string;
  assistantMessage: string;
}): string {
  return `Extract grounded world-state changes from this roleplay turn.

User message:
${input.userMessage}

Assistant response:
${input.assistantMessage}

Return a JSON object with: entities[], locations[], events[], timeCue (null or {time, source}), committedFacts[], relationships[].`;
}
