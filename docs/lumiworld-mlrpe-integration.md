# LumiWorld + MLRPE Integration

LumiWorld Phase 1 expects two MLRPE-side additions. The full copy-pasteable block text with field-by-field schema and setup instructions is in **[docs/mlrpe-bridge-blocks.md](./mlrpe-bridge-blocks.md)**.

## 1. Pre-history bridge block (Block A)

Paste as a new `pre_history` / `role: system` block near the roles/cast/world section. Injects the current world digest as advisory continuity evidence.

Uses `{{@lwe_world_state}}` (a chat-scoped variable set by LumiWorld via `spindle.variables.chat.set()`).

**Note:** The original design used `{{#if @lwe_world_state}}...{{/if}}` to suppress the block when empty. This does NOT work — Lumiverse's templating engine does not support Handlebars conditionals. Instead, the block is always emitted. `{{@lwe_world_state}}` resolves to an empty string when unset, so the block just emits empty brackets on turn 1 — harmless. The backend seeds the digest before the first generation regardless.

## 2. Post-history hidden update contract (Block B)

Paste as a new `post_history` / `role: user` block, ordered AFTER the active post-history block (block 55 "CoT Test"). Instructs the model to emit a `[STATE_UPDATE]` JSON block at the end of every assistant message.

The contract requires: `sceneCast`, `npcDeltas`, `edgeDeltas`, `secretDeltas`, `hookDeltas`, `playerDeltas`, `newEntities`, optional `timeAdvance`.

Key constraint: durable relationship-axis changes require a `qualifyingEvent`. Without one, the change is silently downgraded to momentary.

## beatFocal / beatDriver

These map to MLRPE's native task_rail vocabulary:
- `beatFocal` = the `focus` from Task 0 (the POV subjectivity this beat)
- `beatDriver` = the NPC behind the `pressure` from Task 0

Both are optional — the model may omit them without breaking the parser.

## Ledger behavior

- If MLRPE compact ledger mode is enabled (`social_ledger_mode=compact`, the default), LumiWorld reads visible cast state from the `<details>` Cast State block.
- LumiWorld never strips the visible ledger from chat history.
- LumiWorld does strip the hidden `[STATE_UPDATE]` block from the saved assistant message with `skipChunkRebuild: true`.
- If the hidden block is malformed, LumiWorld leaves the visible response intact, stores the failing raw block under `worlds/{chatId}/debug/last_failed_state_update.txt`, and skips the world-state commit for that turn.
- LumiWorld strips `<thinking>`/`<reasoning>`/`<reflection>` blocks before matching `[STATE_UPDATE]`, so a state update that appears only in a model's reasoning trace is correctly ignored (design §10).

## Phase 1 scope

Phase 1 is digest-only prompt injection. LumiWorld does not manage world books yet.
