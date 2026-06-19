# LumiWorld + MLRPE Integration

LumiWorld Phase 1 expects two MLRPE-side additions.

## 1. Pre-history bridge block

Paste this near the roles/cast/world context area so the current world digest is visible to the preset only when LumiWorld has state for the chat:

```txt
{{#if @lwe_world_state}}
[LWE_STATE]
{{@lwe_world_state}}
[/LWE_STATE]
{{/if}}
```

## 2. Post-history hidden update contract

Paste the `[STATE_UPDATE]` instruction block after the recency anchor so MLRPE emits the hidden simulation update at the end of each assistant message.

The contract should require:

- `sceneCast`
- `npcDeltas`
- `edgeDeltas`
- `secretDeltas`
- `hookDeltas`
- `playerDeltas`
- `newEntities`
- optional `timeAdvance`

## Ledger behavior

- If MLRPE compact ledger mode is enabled, LumiWorld reads visible cast state from the `<details>` Cast State block.
- LumiWorld never strips the visible ledger from chat history.
- LumiWorld does strip the hidden `[STATE_UPDATE]` block from the saved assistant message with `skipChunkRebuild: true`.
- If the hidden block is malformed, LumiWorld leaves the visible response intact, stores the failing raw block under `worlds/{chatId}/debug/last_failed_state_update.txt`, and skips the world-state commit for that turn.

## Phase 1 scope

Phase 1 is digest-only prompt injection. LumiWorld does not manage world books yet.
