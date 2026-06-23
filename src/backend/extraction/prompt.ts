export function buildExtractionSystemPrompt(): string {
  return `You are extracting grounded world-state changes from a single turn of a roleplay conversation.

Rules:
- Extract only changes explicitly stated or directly implied in the text.
- Do not invent hidden motives, elapsed time, relationships, or events not grounded in the text.
- Separate attempts from completed outcomes.
- Dialogue claims are NOT objective truth.
- If no time cue is present, return timeCue as null.
- Use stable entity IDs: snake_case derived from the entity name.

Return ONLY a valid JSON object matching the required schema.`;
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

Return JSON with: entities[], locations[], events[], timeCue (null or object with time+source), committedFacts[], relationships[].`;
}
