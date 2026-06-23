export function buildRebuildSystemPrompt(): string {
  return `You are building the initial world state for a roleplay chat by reading conversation history.

Rules:
- Extract every unique entity, location, event, relationship, and time cue from the messages.
- Process messages in strict chronological order (oldest first).
- Do NOT invent trauma, hidden motives, or backstory not stated.
- Dialogue claims are NOT objective truth.
- Prefer omission over invention when uncertain.

Return ONLY a valid JSON object with fields: entities[], locations[], events[], relationships[], timeCue (null or {time, source}).`;
}

export function buildRebuildUserPrompt(input: {
  messages: Array<{ role: string; content: string }>;
}): string {
  const conversationText = input.messages
    .map((msg) => `[${msg.role}]: ${msg.content}`)
    .join("\n\n");

  return `Extract all world-state information from this conversation history.

${conversationText}

Return JSON with: entities (id, kind, name, source), locations (id, label), events (id, kind, summary, participants, locationId), relationships (sourceId, targetId, stance, evidence), timeCue (null or {time, source}).`;
}
