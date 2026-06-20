# MLRPE Bridge Blocks for LumiWorld

> These are the two blocks a user pastes into an MLRPE v1.6.9 preset to connect it to LumiWorld.
> Tested against MLRPE block structure (56 blocks, June 2026).

## Block A — Pre-history bridge (advisory state injection)

**Placement:** Add as a new `pre_history` / `role: system` block, near the roles/cast/world section (e.g. after block 6 "Continuity & Hidden State", or after block 2 "Roles / Cast / World"). It runs before chat history is assembled.

**Why no `{{#if}}`:** Lumiverse's templating engine does NOT support Handlebars conditionals. `{{@lwe_world_state}}` resolves to an empty string when the variable is unset, so the block simply emits empty brackets on turn 1 — harmless. The backend seeds the digest before the first generation, so this is a non-issue in practice.

**Block content (copy-paste):**

```txt
🧭 [LWE_STATE]

## Authority
Optional advisory bridge for LumiWorld (Living World Engine) persistent world state. External state may inform continuity, but never overrides latest chat evidence, Operator OOC direction, AgencyMode, diegetic consent, established facts, or character knowledge limits.

## Current World State
{{@lwe_world_state}}

## Use
Treat supplied state as advisory continuity evidence. Reconcile conflicts in this order: latest explicit scene evidence > Operator direction > established chat continuity > LWE world state > older summary. Do not expose private simulation state merely because the bridge supplies it.

[/LWE_STATE]
```

---

## Block B — Post-history hidden update contract (STATE_UPDATE emission)

**Placement:** Add as a new `post_history` / `role: user` block, ordered AFTER the active post-history block (block 55 "CoT Test", the condensed recency anchor / task_rail). It becomes the second enabled post-history user block.

**Why after block 55:** The canonical Recency Anchor (block 54) is disabled. Block 55 ("CoT Test") is the active post-history block — it's a condensed `<recency_anchor>` wrapping Tasks 0-6. Block B extends the same "end-of-turn emission" seam that Task 6 (OUTPUT) governs.

**Block content (copy-paste):**

```txt
⏩ [STATE_UPDATE_CONTRACT]

After completing your post (and the Cast State Ledger if applicable), emit a hidden simulation update for LumiWorld. This is machine-readable state ONLY — it is stripped from the saved message and never shown to the player.

## Emission rules
- Emit at the VERY END of your assistant message, after prose and after any <details> Cast State Ledger.
- Emit in VISIBLE output, NOT inside your thinking/reasoning block.
- Use the exact tags: [STATE_UPDATE] ... [/STATE_UPDATE]
- Inside the tags: valid JSON only, no markdown, no comments.
- All NPC references use snake_case IDs (e.g. "mira", "innkeeper_bo"), never display names.
- If nothing changed this turn, still emit the block with empty arrays and null timeAdvance.
- Omit optional fields you don't need; never emit null values for required fields.

## Schema

[STATE_UPDATE]
{
  "sceneCast": {
    "active": ["npc_id", ...],
    "nearby": ["npc_id", ...],
    "offscreen": ["npc_id", ...],
    "cardPrincipal": "npc_id or null",
    "beatFocal": "npc_id or null",
    "beatDriver": "npc_id or null"
  },
  "timeAdvance": { "amount": "2 hours", "newDescriptor": "dusk, day 3" } | null,
  "npcDeltas": [
    {
      "id": "npc_id",
      "moodNow": "guarded",
      "locationNow": "location_id",
      "emotionalStateNow": { "dominant": "dread", "intensity": 6 },
      "agendaNow": "current intent in one phrase"
    }
  ],
  "edgeDeltas": [
    {
      "from": "npc_id",
      "to": "npc_id_or_player",
      "momentary": { "warmth": 1 },
      "durableChanges": { "trust": -1 },
      "qualifyingEvent": "one-sentence description of the gating event",
      "publicFaceShift": -1,
      "boundaryChanges": { "private_vulnerability": "revoked" }
    }
  ],
  "secretDeltas": [
    {
      "secret": "secret_key",
      "lifecycle": "suspected->tested",
      "suspects": ["npc_id"],
      "newEvidence": ["evidence description"]
    }
  ],
  "hookDeltas": [
    { "arc": "arc_key", "fact": "the planted detail", "lifecycle": "warm->ripe" }
  ],
  "playerDeltas": {
    "attire": "grey cloak, hood up",
    "inventory": { "add": ["sealed letter"], "remove": [] },
    "physicalState": "shallow cut, left forearm"
  },
  "newEntities": [
    { "name": "Display Name", "tier": "stranger", "location": "location_id" }
  ]
}
[/STATE_UPDATE]

## Field notes

- **sceneCast.active/nearby/offscreen:** NPC IDs present in each zone this turn.
- **sceneCast.cardPrincipal:** The {{char}} NPC ID.
- **sceneCast.beatFocal** (optional): The NPC who was your `focus` this beat (from your task_rail Task 0). Null if ensemble/external camera.
- **sceneCast.beatDriver** (optional): The NPC behind the `pressure` this beat. Null if no single driver.
- **npcDeltas.moodNow/locationNow:** Optional for active NPCs (the Cast State Ledger covers them). Required for offscreen NPCs.
- **npcDeltas.emotionalStateNow:** Always include for Major NPCs. This is hidden psychology, not visible mood.
- **edgeDeltas.durableChanges:** Core relationship axes (trust, warmth, fear, etc., 0-9 scale). These ONLY apply if you also provide a `qualifyingEvent`. Without a qualifyingEvent, the change routes to momentary instead.
- **edgeDeltas.qualifyingEvent:** A one-sentence diegetic description of the event that justifies any durable change. Required for durableChanges to take effect.
- **edgeDeltas.publicFaceShift:** Separate from durableChanges. Shifts on visible social incidents, gossip, reputation events. No qualifyingEvent needed.
- **edgeDeltas.boundaryChanges:** Domain → new state. Domains: touch, proximity, care, medical_help, shelter_dependence, command, public_exposure, private_vulnerability, intimacy, restraint, pursuit, secret_access, resource_use, status_claim, public_face.
- **secretDeltas.lifecycle:** Use arrow notation for transitions: "dormant->strained", "suspected->tested". Valid states: dormant, strained, suspected, tested, partial_exposure, full_exposure, aftermath.
- **hookDeltas.lifecycle:** planted->warm, warm->ripe, ripe->fired, etc. Valid: planted, warm, ripe, fired, spent, buried.
- **timeAdvance:** Include ONLY if in-world time jumped (skip, travel, sleep). Null otherwise.
- **newEntities:** Any new NPC introduced this turn. LWE generates the ID from the name.

## Critical constraints
- Durable axis changes WITHOUT a qualifyingEvent are silently downgraded to momentary. Always name the event.
- betrayal_scar and public_face are never momentary — only durable.
- Do not re-emit all secrets/hooks every turn. Only emit deltas (changes this turn). LWE preserves omitted secrets/hooks.
- Emit [STATE_UPDATE] in your visible response, never only in reasoning.

[/STATE_UPDATE_CONTRACT]
```

---

## Setup checklist for the user

1. Ensure MLRPE mode variable `social_ledger_mode` is set to `compact` (the default). If it's `off`, LumiWorld falls back to `[STATE_UPDATE]` npcDeltas only for active-NPC physical state.
2. Paste Block A as a new pre-history system block (near the cast/world section).
3. Paste Block B as a new post-history user block (after block 55 "CoT Test").
4. Enable both blocks.
5. Start a chat — LumiWorld seeds the world graph on first load and begins injecting `{{@lwe_world_state}}`.
6. After the first assistant response, check: does the message contain `[STATE_UPDATE]...[/STATE_UPDATE]`? Does it contain a `<details>` Cast State Ledger?
7. If the model puts `[STATE_UPDATE]` inside its thinking block instead of visible output, reinforce Block B's "emit in VISIBLE output, NOT inside your thinking/reasoning block" instruction.

## Troubleshooting

- **No [STATE_UPDATE] emitted:** The model may not have internalized Block B. Try moving it higher in the post-history block order, or strengthen the emission language.
- **Malformed JSON:** LumiWorld saves the raw block to `worlds/{chatId}/debug/last_failed_state_update.txt` and skips the commit. The visible response is left intact.
- **[STATE_UPDATE] in reasoning only:** LumiWorld's parser now strips `<thinking>`/`<reasoning>`/`<reflection>` blocks before matching, so a reasoning-only STATE_UPDATE is correctly ignored. But this means NO state is committed — reinforce the "visible output" instruction in Block B.
- **Cast State Ledger missing:** Check that `social_ledger_mode` isn't set to `off`. LumiWorld needs it on `compact`.
