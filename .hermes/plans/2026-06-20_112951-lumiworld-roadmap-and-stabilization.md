# LumiWorld Implementation Plan — Stabilization, Data Model, Phase 2

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task. Phase 0 tasks are fully TDD-specified and safe to dispatch immediately. Phase 1.5 / 2 / 3 tasks need the exploration noted in each before being broken into bite-sized steps.

**Goal:** Stabilize the existing Phase-1 build (fix 4 bugs + sync the stale design doc), verify and author the MLRPE bridge contract, expand the data model to the full design §4 contract, then build the Phase-2 "Living World" features (tick engine, world processor sidecar, world books, log/archive).

**Architecture:** Lumiverse Spindle extension. Backend runtime (`src/backend.ts`, process mode) parses two model outputs per turn — a `[STATE_UPDATE]` JSON block and a Cast State Ledger `<details>` block — merges them into a per-chat `WorldGraph` in `spindle.storage`, injects a digest via `{{@lwe_world_state}}`, and pushes updates to a frontend Tracker UI + floating widget. Shared logic (`src/shared/*`) is pure TypeScript, unit-tested with `bun:test`.

**Tech Stack:** TypeScript (ESNext/strict), Bun (runtime + bundler + test), no external deps. Lumiverse Spindle extension API (`spindle.*` backend global, `ctx.*` frontend global).

**Current health (verified at planning time):** `bun test` → 11/11 pass. `bun build` → both bundles build clean. Branch `main`. No TODO/FIXME markers in source.

---

## Critical Context (read before touching anything)

1. **`LWE_DESIGN.md` is STALE on API signatures.** The *code* already uses the correct Lumiverse APIs; the *design doc* still shows the wrong ones. When the doc and code disagree on an API shape, **the code is right.** Task P0-6 syncs the doc. Do not "fix" the code to match the doc's wrong signatures.

2. **Verified Lumiverse API facts** (from docs.lumiverse.chat crawl, June 2026):
   - Manifest fields: `identifier`, `name`, `version`, `author`, `permissions`, `entry_backend`, `entry_frontend`, `minimum_lumiverse_version`. **NOT** `backend`/`frontend`/`runtimeMode`.
   - `spindle.characters.get(characterId, userId?)` — takes a **character id**, not chat id. Two-step: `chats.get(chatId)` → `characters.get(characterId)`.
   - `spindle.chats.get(chatId, userId?)`, `chats.getActive(userId?)`.
   - `spindle.chat.getMessages(chatId)`, `chat.updateMessage(chatId, msgId, { content, skipChunkRebuild })` ✅.
   - `spindle.generate.raw({ messages, parameters, connection_id })` and `generate.quiet(...)` both exist.
   - `spindle.connections.list(userId?)` (PLURAL — for settings picker). NOT `threads`/`connection`.
   - `spindle.world_books.entries` CRUD exists (list/get/create/update/delete).
   - `spindle.variables.chat.set(chatId, key, value)` + `{{@key}}` macro ✅.
   - Frontend: `ctx.ui.createFloatWidget(...)` and `ctx.ui.registerDrawerTab(...)`. **No `ctx.placement`.** Sandbox iframes have NO localStorage (CSP `connect-src 'none'`, `sandbox=allow-scripts` only) — not currently used, but forward note.
   - Lifecycle events confirmed: `CHAT_SWITCHED`, `CHARACTER_MESSAGE_RENDERED`, `GENERATION_STARTED`, `GENERATION_STOPPED`, `GENERATION_ENDED`, `MESSAGE_SENT`, `MESSAGE_EDITED`, `MESSAGE_DELETED`, `MESSAGE_SWIPED`, `SWIPE_EDITED`, `USER_MESSAGE_RENDERED`, `CHARACTER_EDITED`, `SETTINGS_UPDATED`.
   - **`GenerationEndedPayloadDTO` has NO `generationType` field** (only `{ generationId, chatId, messageId, content, error }`). The design doc's swipe-guard "Option A" (`generationType==='normal'`) is impossible. `MESSAGE_SWIPED` / `MESSAGE_EDITED` events are the reliable alternative.
   - `spindle.ephemeral` requires the `ephemeral_storage` permission (gated tier).

3. **Verified MLRPE v1.6.9 facts:**
   - Blocks 9 (Social), 10 (Moral), 11 (Secrets), 13 (Story/Arcs), 39 (Cast State Ledger) all CONFIRMED present. Every enum in design §4 matches the preset exactly (~120 values).
   - Block 39 emits `<details><summary>🗃️ Cast State</summary>…</details>` when `social_ledger_mode=compact` (the default).
   - **Block 55 is "CoT Test", NOT "task_rail".** `beatFocal`/`beatDriver` appear NOWHERE in MLRPE (0 hits). Native fields are `focus`/`pressure`/`ensemble`.
   - **`[STATE_UPDATE]`, `LWE_STATE`, `lwe_world_state` all absent from the preset** — entirely injected by the user via Block A + Block B. ✓ (design premise correct).
   - **`{{#if}}` and `{{@…}}` have ZERO precedent in the preset** — Block A's conditional macro is unverified against Spindle's templater. Needs testing.
   - The "Recency Anchor" block (54) is DISABLED; the active post-history block is 55. Design doc's "after the Recency Anchor" wording is misleading.
   - Block references should cite **UUIDs, not array indices**, to survive preset re-orders.

---

## Phase 0 — Stabilize Phase 1 (do first; all tasks are independent TDD units)

> Each P0 task is self-contained, tested, and committable. Order is suggested but not strictly required except P0-5 builds on P0-2.

### Task P0-1: Fix secrets/hooks wholesale-replacement bug (merge-by-key)

**Objective:** Secrets and hooks currently get replaced wholesale each turn (`world.ts:147-158`). Any secret/hook the model omits in a later `[STATE_UPDATE]` is silently deleted. Make them merge instead.

**Files:**
- Modify: `src/shared/world.ts:147-158` (the `next.secrets = …map(…)` and `next.hooks = …map(…)` block)
- Test: `tests/world-graph.test.ts` (add a new test case)

**The bug (current code at world.ts:147-158):**
```typescript
next.secrets = stateUpdate.secretDeltas.map((secret) => ({
  secret: secret.secret,
  lifecycle: secret.lifecycle,
  suspects: secret.suspects ?? [],
  evidence: secret.newEvidence ?? [],
}));

next.hooks = stateUpdate.hookDeltas.map((hook) => ({
  arc: hook.arc,
  fact: hook.fact,
  lifecycle: hook.lifecycle,
}));
```

**Step 1: Write failing test.** In `tests/world-graph.test.ts`, add inside an existing `describe` block (or a new one):

```typescript
test("secrets and hooks merge across turns instead of being replaced", () => {
  const graph = seedWorldGraph({
    chatId: "c1",
    characterName: "Mira",
  });

  // Turn 1: two secrets, one hook
  applyStateUpdateToWorld(graph, {
    sceneCast: { active: ["mira"], nearby: [], offscreen: [] },
    npcDeltas: [],
    edgeDeltas: [],
    secretDeltas: [
      { secret: "mira_is_traitor", lifecycle: "dormant", suspects: [], newEvidence: [] },
      { secret: "mira_debt", lifecycle: "dormant", suspects: [], newEvidence: [] },
    ],
    hookDeltas: [{ arc: "mira_identity", fact: "inscribed dagger", lifecycle: "planted" }],
    playerDeltas: {},
    newEntities: [],
  });

  // Turn 2: only ONE secret re-emitted (the other omitted), hook omitted entirely
  applyStateUpdateToWorld(graph, {
    sceneCast: { active: ["mira"], nearby: [], offscreen: [] },
    npcDeltas: [],
    edgeDeltas: [],
    secretDeltas: [
      { secret: "mira_is_traitor", lifecycle: "suspected", suspects: ["player"], newEvidence: ["overheard"] },
    ],
    hookDeltas: [],
    playerDeltas: {},
    newEntities: [],
  });

  // Both secrets must survive; the re-emitted one must be updated.
  const byKey = Object.fromEntries(graph.secrets.map((s) => [s.secret, s]));
  expect(byKey["mira_is_traitor"]?.lifecycle).toBe("suspected");
  expect(byKey["mira_is_traitor"]?.suspects).toContain("player");
  expect(byKey["mira_is_traitor"]?.evidence).toContain("overheard");
  // The omitted secret is PRESERVED, not deleted.
  expect(byKey["mira_debt"]).toBeDefined();
  expect(byKey["mira_debt"]?.lifecycle).toBe("dormant");
  // The omitted hook is PRESERVED.
  expect(graph.hooks.find((h) => h.arc === "mira_identity" && h.fact === "inscribed dagger")).toBeDefined();
});
```

**Step 2: Run test, verify failure.**
```bash
bun test tests/world-graph.test.ts
```
Expected: FAIL — `mira_debt` undefined (wholesale replacement deleted it).

**Step 3: Implement the fix.** Replace `world.ts:147-158` with merge logic keyed by `secret` (for secrets) and `arc + "|" + fact` (for hooks):

```typescript
// Secrets merge by `secret` key: update existing, append new, preserve omitted.
const secretByKey = new Map(next.secrets.map((s) => [s.secret, s]));
for (const delta of stateUpdate.secretDeltas) {
  const existing = secretByKey.get(delta.secret);
  if (existing) {
    existing.lifecycle = delta.lifecycle;
    existing.suspects = Array.from(new Set([...existing.suspects, ...(delta.suspects ?? [])]));
    existing.evidence = Array.from(new Set([...existing.evidence, ...(delta.newEvidence ?? [])]));
  } else {
    secretByKey.set(delta.secret, {
      secret: delta.secret,
      lifecycle: delta.lifecycle,
      suspects: delta.suspects ?? [],
      evidence: delta.newEvidence ?? [],
    });
  }
}
next.secrets = [...secretByKey.values()];

// Hooks merge by `arc|fact` composite key: update lifecycle, append new, preserve omitted.
const hookByKey = new Map(next.hooks.map((h) => [`${h.arc}|${h.fact}`, h]));
for (const delta of stateUpdate.hookDeltas) {
  const key = `${delta.arc}|${delta.fact}`;
  const existing = hookByKey.get(key);
  if (existing) {
    existing.lifecycle = delta.lifecycle;
  } else {
    hookByKey.set(key, { arc: delta.arc, fact: delta.fact, lifecycle: delta.lifecycle });
  }
}
next.hooks = [...hookByKey.values()];
```

**Step 4: Run test, verify pass.**
```bash
bun test tests/world-graph.test.ts
```
Expected: PASS (all tests including the new one).

**Step 5: Commit.**
```bash
git add src/shared/world.ts tests/world-graph.test.ts
git commit -m "fix: merge secrets/hooks across turns instead of wholesale replacement"
```

---

### Task P0-2: Replace swipe-guard heuristic with event-based guard + try/catch

**Objective:** The swipe guard uses an in-memory `generationSessions` Map keyed on an unverified `targetMessageId` field (`backend.ts:85-105`). It's lost on backend reload and unreliable. Replace with a verified approach: subscribe to `MESSAGE_SWIPED` / `MESSAGE_EDITED` to mark a "commit lockout" for the affected message id, and wrap the whole post-turn commit in try/catch so a mid-commit throw surfaces a toast instead of silently aborting.

**Files:**
- Modify: `src/backend.ts:19-22` (add `Set` for locked message ids), `:85-115` (event handlers), `:118-157` (guard + try/catch in `processCompletedGeneration`)
- Test: manual (backend.ts is not currently unit-tested; add a lightweight integration test if a harness is introduced in P0-7)

**Step 1: Add a commit-lockout set** near the other module state (`backend.ts:19-22`):

```typescript
const generationSessions = new Map<string, GenerationSession>();
const frontendChatByUser = new Map<string, string | null>();
const frontendUsersByChat = new Map<string, Set<string>>();
let activeChatId: string | null = null;
// Message ids that were produced by swipe/edit/regen — never commit world state for these.
const lockedMessageIds = new Set<string>();
```

**Step 2: Add event handlers** in `setupBackend()` alongside the existing `spindle.on(...)` calls (after `GENERATION_STOPPED` at `backend.ts:94-96`):

```typescript
spindle.on("MESSAGE_SWIPED", (payload) => {
  const id = payload?.messageId ?? payload?.message_id;
  if (id) lockedMessageIds.add(id);
});
spindle.on("MESSAGE_EDITED", (payload) => {
  const id = payload?.messageId ?? payload?.message_id;
  if (id) lockedMessageIds.add(id);
});
```

**Step 3: Use the lockout in `processCompletedGeneration`.** In `backend.ts:118-157`, add a guard at the top and wrap the body in try/catch. Replace the function to read:

```typescript
async function processCompletedGeneration(chatId: string, messageId: string, userId?: string): Promise<void> {
  // Never commit world state for a message produced by swipe/edit/regen.
  if (lockedMessageIds.has(messageId)) {
    return;
  }

  const graph = await ensureWorldGraph(chatId, userId);
  if (!graph || !spindle.permissions.has("chat_mutation")) {
    return;
  }

  try {
    const messages = await spindle.chat.getMessages(chatId);
    const assistantMessage =
      messages.find((message) => message.id === messageId) ??
      [...messages].reverse().find((message) => message.role === "assistant");

    if (!assistantMessage) {
      return;
    }

    const parsedStateUpdate = parseStateUpdateEnvelope(assistantMessage.content);
    const strippedContent = stripStateUpdateBlock(assistantMessage.content);
    const ledger = parseCompactLedger(strippedContent);

    if (strippedContent !== assistantMessage.content) {
      await spindle.chat.updateMessage(chatId, assistantMessage.id, {
        content: strippedContent,
        skipChunkRebuild: true,
      });
    }

    if (!parsedStateUpdate.found || !parsedStateUpdate.parsed) {
      if (parsedStateUpdate.rawBlock) {
        await spindle.storage.write(DEBUG_PATH(chatId), parsedStateUpdate.rawBlock);
      }
      spindle.toast?.error?.("LumiWorld skipped this turn because the hidden state update was invalid.");
      spindle.log.warn(`LumiWorld: invalid or missing STATE_UPDATE: ${parsedStateUpdate.error ?? "unknown error"}`);
      return;
    }

    const next = applyStateUpdateToWorld(graph, parsedStateUpdate.parsed, ledger);
    await saveWorldGraph(next);
    await writeDigest(chatId, next);
    sendWorldUpdate(chatId, summarizeWorld(next));
  } catch (error) {
    spindle.toast?.error?.("LumiWorld hit an unexpected error updating the world this turn.");
    spindle.log.error(`LumiWorld: post-turn commit failed for chat ${chatId}: ${formatError(error)}`);
  }
}
```

> **Note:** The existing `generationSessions` Map and its `targetMessageId` check at `backend.ts:103-105` can stay as a secondary heuristic, but the `lockedMessageIds` set is the primary, verified guard. If you want to fully remove the heuristic, delete the `generationSessions` Map and the `GENERATION_STARTED`/`GENERATION_STOPPED` handlers — but keeping both is harmless. Recommend keeping `GENERATION_STARTED` only if it's used elsewhere; verify with `grep generationSessions src/`.

**Step 4: Build + run full test suite.**
```bash
bun run build && bun test
```
Expected: build clean, 11/11 pass (no behavioral test for the guard yet — see P0-7).

**Step 5: Commit.**
```bash
git add src/backend.ts
git commit -m "fix: event-based swipe/edit commit guard + try/catch on post-turn commit"
```

---

### Task P0-3: Harden the ledger parser (defensive field extraction)

**Objective:** `parseLedgerEntry` does positional slotting (`location=details[0]`, `mood=details[1]`) — a Cast row without a location mis-slots mood into location. Make field extraction label-aware / defensive, and make the summary match tolerant of wording variation.

**Files:**
- Modify: `src/shared/parsers.ts:656-732`
- Test: `tests/state-update.test.ts` (add malformed-ledger cases)

**The bug (current code at parsers.ts:715-732):**
```typescript
export function parseLedgerEntry(line: string): LedgerEntry | null {
  const [namePart, detailPart] = line.split(/\s+[—-]\s+/u, 2);
  if (!namePart || !detailPart) {
    return null;
  }
  const details = detailPart.split(";").map((part) => part.trim()).filter(Boolean);
  return {
    name: namePart.trim(),
    location: details[0],   // ← fragile positional slotting
    mood: details[1],       // ← fragile positional slotting
    details,
  };
}
```

**Step 1: Write failing tests.** In `tests/state-update.test.ts`, add:

```typescript
describe("ledger parsing robustness", () => {
  test("parseLedgerEntry tolerates a Cast row with mood but no explicit location", () => {
    // Re-import parseLedgerEntry if not already imported.
    const entry = parseLedgerEntry("Mira — guarded");
    expect(entry?.name).toBe("Mira");
    expect(entry?.details).toContain("guarded");
    // Do not assert location==='guarded' — we just want no crash + sensible details.
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
```
(Add `parseLedgerEntry` to the import from `../src/shared/parsers`.)

**Step 2: Run, verify failure** on the positional-slotting case.

**Step 3: Implement.** Replace `parseLedgerEntry` and the summary regex in `parseCompactLedger`:

```typescript
// Keyword hints used to label a detail segment heuristically.
const LOCATION_HINTS = /\b(market|tavern|inn|tower|gate|keep|hall|room|street|alley|bridge|dock|forest|camp|road|square|chamber|cellar|rooftop|garden)\b/i;

export function parseLedgerEntry(line: string): LedgerEntry | null {
  const [namePart, detailPart] = line.split(/\s+[—-]\s+/u, 2);
  if (!namePart || !detailPart) {
    return null;
  }
  const details = detailPart.split(";").map((part) => part.trim()).filter(Boolean);

  // Label-aware extraction: don't assume position. Prefer a keyword hint for location;
  // fall back to first segment only when there are >=2 segments.
  let location: string | undefined;
  let mood: string | undefined;
  if (details.length >= 2) {
    location = details.find((d) => LOCATION_HINTS.test(d)) ?? details[0];
    mood = details.find((d) => d !== location) ?? details[1];
  } else if (details.length === 1) {
    // Single segment: ambiguous — leave both unset rather than mis-slotting.
    mood = details[0];
  }

  return { name: namePart.trim(), location, mood, details };
}
```

And relax the summary match in `parseCompactLedger` (line 657) to accept any `<details>` block containing a **Focus:** or **Cast:** row (the MLRPE contract), not the literal summary text:

```typescript
const match = content.match(/<details>[\s\S]*?<\/details>/i);
if (!match) return null;
// Must contain at least one canonical ledger row marker to count as the Cast State Ledger.
if (!/\*\*(Focus|Cast|Bonds\/social|Known pressure|<user>):\*\*/i.test(match[0])) {
  return null;
}
```

**Step 4: Run, verify pass.**
```bash
bun test tests/state-update.test.ts
```
Expected: PASS (existing + new).

**Step 5: Commit.**
```bash
git add src/shared/parsers.ts tests/state-update.test.ts
git commit -m "fix: defensive ledger field extraction and tolerant summary match"
```

---

### Task P0-4: Add reasoning-only guard for `[STATE_UPDATE]`

**Objective:** Design §10 rule: "Parse content only, not reasoning. If `[STATE_UPDATE]` appears only in a reasoning/thinking block, log and skip." The current regex (`parsers.ts:26`) matches the block anywhere in `content`, including inside an inlined `<thinking>…</thinking>` / `<reasoning>…</reasoning>` fence some models emit.

**Files:**
- Modify: `src/shared/parsers.ts:25-71` (`parseStateUpdateEnvelope`)
- Test: `tests/state-update.test.ts` (add a reasoning-only fixture case)

**Step 1: Write failing test.** In `tests/state-update.test.ts`:

```typescript
test("ignores a STATE_UPDATE that appears only inside a reasoning block", () => {
  const reasoningOnly = [
    "Some prose.",
    "<thinking>",
    "[STATE_UPDATE]",
    JSON.stringify({
      sceneCast: { active: ["mira"], nearby: [], offscreen: [] },
      npcDeltas: [], edgeDeltas: [], secretDeltas: [], hookDeltas: [],
      playerDeltas: {}, newEntities: [],
    }),
    "[/STATE_UPDATE]",
    "</thinking>",
  ].join("\n");
  const result = parseStateUpdateEnvelope(reasoningOnly);
  expect(result.found).toBe(false);
});
```

**Step 2: Run, verify failure** (currently `found` would be true).

**Step 3: Implement.** At the top of `parseStateUpdateEnvelope`, before matching, strip out reasoning/thinking fenced regions so they can't supply a match. Replace the function's opening (lines 25-35) to add the strip:

```typescript
export function parseStateUpdateEnvelope(content: string): StateUpdateEnvelope {
  // Strip reasoning/thinking fenced regions so a STATE_UPDATE that appears only
  // inside a model's reasoning block is never committed. (Design §10.)
  const strippedReasoning = content
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
    .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, "")
    .replace(/<reflection>[\s\S]*?<\/reflection>/gi, "");

  const match = strippedReasoning.match(/^\[STATE_UPDATE\][\t ]*\r?\n([\s\S]*?)^\[\/STATE_UPDATE\][\t ]*$/m);
  if (!match) {
    return { found: false, rawBlock: null, jsonText: null, parsed: null, error: null };
  }
  // ... rest unchanged (operate on `match` from strippedReasoning)
```

> **Note:** Keep `rawBlock` derived from the stripped content (the debug dump should show what was actually parsed). If reasoning is stored in a separate `reasoning` field on the message (as Lumiverse's `UpdateMessagePatch.reasoning` suggests), it's already not in `content` — this guard is belt-and-suspenders for models that inline reasoning.

**Step 4: Run, verify pass.**
```bash
bun test
```
Expected: all pass.

**Step 5: Commit.**
```bash
git add src/shared/parsers.ts tests/state-update.test.ts
git commit -m "fix: skip STATE_UPDATE that appears only inside a reasoning block"
```

---

### Task P0-5: Stop hardcoding `detectedPreset: "mlrpe"`

**Objective:** `world.ts:18` hardcodes `detectedPreset: "mlrpe"` and `types.ts:186` types it as the literal `"mlrpe"`. Design §10 requires it be detected (display-only, never a behavior flag). Since MLRPE detection is heuristic, make the type `string`, leave the value as a best-effort inference (default `"unknown"`), and remove the literal-type constraint so non-MLRPE chats aren't mislabeled.

**Files:**
- Modify: `src/shared/types.ts:186` (`detectedPreset: "mlrpe"` → `detectedPreset: string`)
- Modify: `src/shared/world.ts:18` (infer instead of hardcode)

**Step 1: Loosen the type.** In `types.ts:186`:
```typescript
detectedPreset: string;   // display-only, never a behavior flag (design §10)
```

**Step 2: Infer in `seedWorldGraph`.** In `world.ts` around line 18, replace the hardcoded `"mlrpe"` with a best-effort inference. Add a tiny helper:

```typescript
function inferDetectedPreset(scenario?: string): string {
  // Heuristic only — display label, never gates behavior.
  const text = (scenario ?? "").toLowerCase();
  if (text.includes("mlrpe")) return "mlrpe";
  return "unknown";
}
```
and use `detectedPreset: inferDetectedPreset(input.scenario)` in the seeded graph.

> **Note:** MLRPE doesn't reliably surface in the character `scenario` field. A more robust detection (scanning chat messages for MLRPE block markers) is a Phase-1.5 refinement; for now `unknown` is honest. Add a `// TODO(phase-1.5): richer preset detection` comment.

**Step 3: Build + test.**
```bash
bun run build && bun test
```
Expected: pass. (The existing seed test asserts shape, not the literal `"mlrpe"` — verify by checking `tests/world-graph.test.ts`; if it asserts the literal, update the assertion to expect a string.)

**Step 4: Commit.**
```bash
git add src/shared/types.ts src/shared/world.ts
git commit -m "fix: infer detectedPreset instead of hardcoding mlrpe (display-only)"
```

---

### Task P0-6: Sync `LWE_DESIGN.md` to the corrected APIs (doc-only)

**Objective:** The design doc's API signatures are wrong and will mislead any future implementer (human or agent). Fix them to match the verified Lumiverse docs and the actual code.

**Files:**
- Modify: `LWE_DESIGN.md` (§2 Architecture, §3 Storage, §4 Data Model references)

**Step 1: Fix the manifest block (§2 Runtime and Permissions).** Replace the JSON to:
```json
{
  "identifier": "lumiworld",
  "name": "LumiWorld",
  "version": "0.1.0",
  "author": "junbr",
  "permissions": ["generation", "characters", "chats", "chat_mutation", "ui_panels"],
  "entry_backend": "dist/backend.js",
  "entry_frontend": "dist/frontend.js",
  "minimum_lumiverse_version": "0.2.0"
}
```
Remove the `runtimeMode`/`backend`/`frontend`/`world_books` lines and the note asking to verify `world_books` (it's a valid permission; add it back only when Phase 2 world-books work lands).

**Step 2: Fix the cold-start flow (§2 Cold Start).** Change `spindle.characters.get(chatId)` to the two-step: `const chat = await spindle.chats.get(chatId); const char = await spindle.characters.get(chat.character_id);`

**Step 3: Fix the swipe-guard section (§2 Swipe / Regen Guard).** Strike Option A (`generationType` does not exist on the payload). Replace with: subscribe to `MESSAGE_SWIPED` / `MESSAGE_EDITED` events to lock out commit for the affected message id (primary guard), with the in-memory session map as a secondary heuristic.

**Step 4: Fix the widget API (§8 Floating Mini-Widget).** Change `ctx.placement.addFloatingWidget` to `ctx.ui.createFloatWidget`. Add a note: sandbox iframes have no localStorage; the current widget renders directly into host DOM, not a sandbox.

**Step 5: Fix the sidecar connection picker (§2 World Processor Sidecar + §9).** Change `spindle.threads`/`spindle.connection` to `spindle.connections.list(userId?)` (requires `generation` permission).

**Step 6: Fix `beatFocal`/`beatDriver` (§4 SceneCast + §5 schema).** Add a clear note: these field names are INVENTED — MLRPE has no native `beatFocal`/`beatDriver`; the native analogues are `focus`/`pressure`. Either Block B must explicitly map them, or they should be dropped. Mark them `// UNVERIFIED — see P1-2`.

**Step 7: Re-pin block references to UUIDs (§4).** Replace "block 9/10/11/13/39/55" index references with the MLRPE block UUIDs where known (block 9 = `b7dfb379-…` — fill in the rest from the preset). Add a note that the canonical "Recency Anchor" (block 54) is disabled and the active post-history block is 55 ("CoT Test").

**Step 8: Add a "STALE API NOTICE" header** at the top of the doc pointing to this plan and the verified API facts above, so future readers know the code is the source of truth.

**Step 9: Commit.**
```bash
git add LWE_DESIGN.md
git commit -m "docs: sync LWE_DESIGN.md to verified Lumiverse APIs and MLRPE facts"
```

---

### Task P0-7 (optional but recommended): Add a backend integration test harness

**Objective:** `backend.ts` (event handlers, turn cycle, cold-start) has zero test coverage. Add a minimal harness so P0-2's guard and future backend changes are testable. This is optional for stabilization but high-leverage before Phase 2.

**Files:**
- Create: `tests/backend.test.ts`
- May need: a tiny `spindle` stub/fake in the test file (the ambient `spindle` global is declared in `lumiverse.d.ts`; tests must provide it).

**Approach:** Since `backend.ts` references a global `spindle`, extract the setup into a factory `createBackend(deps)` that accepts the `spindle`-shaped object, so tests can inject a fake. If refactoring is too invasive for P0, defer to Phase 1.5 and instead write characterization tests against `applyStateUpdateToWorld` + `summarizeWorld` edge cases (hot-alert substring matching, empty graphs).

**Decision point:** Ask the user whether to refactor `backend.ts` for injectability now (cleaner, enables real backend tests) or defer (keeps P0 small). Default recommendation: defer the refactor, but add the `summarizeWorld` hot-alert tests now (they're pure-function tests on shared code).

---

## Phase 1 — Verify & Author the MLRPE Bridge Contract

> These are investigation + authoring tasks, not pure code. They unblock everything downstream because LWE is worthless if the model never emits `[STATE_UPDATE]`.

### Task P1-1: Verify `{{@lwe_world_state}}` + `{{#if}}` macro support in Spindle

**Objective:** Block A uses `{{#if @lwe_world_state}}…{{/if}}`. Neither `{{@…}}` chat-vars nor `{{#if}}` conditionals appear anywhere in MLRPE. Confirm Spindle's templater supports them, or design a fallback.

**Steps:**
1. Search Lumiverse docs (https://docs.lumiverse.chat/) for "macros", "chat variables", "template", "conditional". Use browser tools (JS-rendered site).
2. If confirmed supported: document the source URL in `docs/lumiworld-mlrpe-integration.md`.
3. If NOT confirmed, or ambiguous: switch Block A to unconditional emission — always emit `[LWE_STATE]…[/LWE_STATE]` and have the backend write a sentinel digest (`"No prior session state."`) on turn 1. Update `writeDigest` to never write empty string.
4. Record the decision in `docs/lumiworld-mlrpe-integration.md`.

**Deliverable:** A one-paragraph finding + the chosen Block A form.

---

### Task P1-2: Decide `beatFocal` / `beatDriver` fate and author Block B mapping

**Objective:** `SceneCast.beatFocal`/`beatDriver` are invented field names with zero MLRPE grounding. Either drop them or map them to MLRPE's `focus`/`pressure`/`ensemble` vocabulary in Block B.

**Steps:**
1. Inspect the actual MLRPE block 55 "CoT Test" `task_rail` output format (`input= | agency= | mode= | focus= | pressure= | ensemble= | staging= | protected_stop=`).
2. Decide: (a) drop `beatFocal`/`beatDriver` from `SceneCast` entirely (simplest; the model rarely emits them anyway), or (b) keep them and have Block B instruct: "`beatFocal` = the `focus` from your task rail; `beatDriver` = the NPC behind `pressure`."
3. Update `src/shared/types.ts` `SceneCast` accordingly (drop or keep).
4. Update the `[STATE_UPDATE]` schema doc in `LWE_DESIGN.md §5` to match.

**Deliverable:** Decision + type/doc update.

---

### Task P1-3: Author Block A and Block B text, test end-to-end

**Objective:** Produce the actual prompt-block text the user pastes into MLRPE, and prove the model emits a valid `[STATE_UPDATE]`.

**Files:**
- Create: `docs/mlrpe-bridge-blocks.md` (the copy-pasteable Block A + Block B)

**Steps:**
1. Author **Block A** (pre-history, `[LWE_STATE]` advisory injection) using the form chosen in P1-1.
2. Author **Block B** (post-history, `[STATE_UPDATE]` emission contract) — must specify: JSON-only, IDs not display names, the full schema, that it goes in VISIBLE output not reasoning, and that `beatFocal`/`beatDriver` map per P1-2 (or omit them).
3. Load a real MLRPE preset in Lumiverse, paste both blocks, run a test chat, and confirm the assistant message contains a parseable `[STATE_UPDATE]` + the `<details>` Cast State Ledger.
4. Iterate on Block B wording until emission is reliable (≥3 consecutive turns valid). Capture any model-compliance issues.

**Deliverable:** `docs/mlrpe-bridge-blocks.md` + a note in `docs/lumiworld-mlrpe-integration.md` confirming end-to-end emission works.

---

## Phase 1.5 — Expand the Data Model to Full Design §4

> Goal: bring `types.ts` up to the full MLRPE-verified data contract so Phase 2 features (tick engine, factions, locations) have types to build on. This is mostly additive type work + a migration stub. Break into bite-sized TDD tasks once started.

**Scope to add to `src/shared/types.ts`:**
- Block 9 psychology enums: `AttachmentOrientation`, `SelfStory`, `ClosenessStrategy`, `MeaningModel[]`, `RepairCondition[]`, `DominantOrigin`, `TriggerChannel[]`, plus `regulation_pattern`, `ClosenessStrategy`.
- Block 10 `moralProfile`: `ConscienceProfile`, `ThreatBias`, `MoralDriftStage`.
- Block 11 full `Secret`: add `owner`, `motive`, `cover`, `identity?` (coverRole/trueRole/coverHabits/weakPoints). Keep current `{secret,lifecycle,suspects,evidence}` as the merge shape.
- Block 13 typed `Arc`: `ArcType`, `ArcPhase` (+ phase bans), `ChekhovHook` with full lifecycle, `centralPressure`, `activeFuel`, `blockedTruthOrGoal`, etc.
- `AgendaItem`: `{ action, condition, priority, resourcesRequired, targetId, affectsPlayer, timeLimit }` + `agenda.queue`.
- `FactionNode` + cascade-rule types (`status`, `resources {wealth,reach,manpower}`, `members`).
- `LocationNode` + `currentOccupants`.
- `StrangerEdge` + `WorldGraph.strangerEdges`.
- `WorldEvent` + `WorldGraph.eventLog[]` (rolling 50).
- `meta: { schemaVersion: number }` on `WorldGraph` + a migration stub chain in `world.ts`.

**Exploration needed before bite-sizing:**
- Decide migration strategy: the current graph has no `meta.schemaVersion`. Task: add `meta.schemaVersion = 1` to seeded graphs, write a `migrate(graph)` that backfills new optional fields (`strangerEdges: []`, `eventLog: []`, `factions: {}`, `locations: {}`) on read, bump to `2`.
- Decide whether to move secrets/hooks from graph-level to per-NPC (`NPCNode.secrets`) as the design intends, or keep graph-level. **Recommendation:** keep graph-level for now (less migration churn), add a `// TODO` to move to per-NPC owner-keyed storage in Phase 2. This is a real design divergence — flag it.

**Tasks (to be expanded into bite-sized steps):**
1. P1.5-1: Add the block-9/10/11/13 enum unions to `types.ts` (pure types, no runtime change). Test: `bun run check` (tsc) passes.
2. P1.5-2: Add `meta.schemaVersion` to `WorldGraph` + seeded graphs. Test: seed test asserts `meta.schemaVersion === 1`.
3. P1.5-3: Add `FactionNode`/`LocationNode`/`StrangerEdge`/`WorldEvent` types + default-empty fields in `seedWorldGraph`. Test: seed shape.
4. P1.5-4: Write `migrateWorldGraph(graph)` in `world.ts` + call it on every `loadWorldGraph`. Test: feed a legacy (no-meta) graph, assert backfilled + bumped.
5. P1.5-5: Extend `[STATE_UPDATE]` validator (`parsers.ts` `validateStateUpdateContract`) to accept the new optional fields (`factionDeltas`, `locationDeltas`, `agendaDeltas`) — additive, don't break existing valid fixture.

---

## Phase 2 — Living World

> Each sub-phase is a mini-project. Break into bite-sized TDD tasks at start of each.

### P2-A: Tick Engine
- `src/shared/tick.ts` (new): evaluate Major-NPC `agenda` items against current `WorldGraph` when `timeAdvance` present; check faction cascade rules (`status==='collapsed'` → suspend; `manpower===0` → fail+log); resolve offscreen NPC actions into `eventLog`.
- Depends on: P1.5-2 (Factions/Locations/AgendaItem types).
- Hook into `processCompletedGeneration` after commit, async (doesn't block chat).

### P2-B: World Processor Sidecar
- `src/shared/sidecar.ts` (new): `generate.raw({ messages, parameters: {temperature:0.2, max_tokens:800}, connection_id })` with `WORLD_PROCESSOR_SYSTEM_PROMPT`.
- `LWESettings` type + `userStorage/settings.json` persistence.
- Frontend settings panel: connection picker via `spindle.connections.list()`.
- Author the World Processor system prompt (separate design artifact).

### P2-C: World Book Entry Management
- Add `world_books` permission to `spindle.json`.
- `src/shared/worldbooks.ts` (new): create-on-mint, update-post-turn, keyword = NPC name + aliases, compressed vs full entry by tier.
- Await WB updates before handler exits (prevent race). Hook into `processCompletedGeneration`.

### P2-D: Log Tab + Event Archive
- Frontend `Log` tab: read `WorldGraph.eventLog` (hot) + `worlds/{chatId}/events_archive.jsonl` (cold).
- `src/shared/archive.ts` (new): rollover when `eventLog.length > 50` → append oldest to jsonl, trim.
- Filter by NPC / location / type.

### P2-E: Map Tab (Phase 2 stretch)
- Schematic `LocationNode` graph + NPC pins + faction territory overlay.

---

## Phase 3 — Full Autonomy (higher-level, future)

- Persistent backend process (survive chat close).
- Optional Memory Cortex read for roster seeding.
- `userStorage` NPC profile library (`npc_profiles/{slug}.json` cross-chat seeds).
- Vault snapshots at arc fallout boundaries.

---

## Risks & Open Questions

1. **`targetMessageId` semantics unverified.** The current swipe heuristic keys on it but the docs subagent couldn't confirm it's a real field. P0-2 sidesteps this with `MESSAGE_SWIPED`/`MESSAGE_EDITED` events (docs-confirmed). Verify the `MESSAGE_SWIPED` payload shape on first real test.
2. **`{{@lwe_world_state}}` + `{{#if}}` support** — the entire digest-injection mechanism depends on this. P1-1 must resolve it before any production use. Fallback (unconditional emission) is safe.
3. **Secrets/hooks storage location** — graph-level (current) vs per-NPC (design). Recommend graph-level for now, revisit in Phase 2. Flag as a divergence.
4. **Group-chat cold-start** — only the principal is minted; group members aren't. Lumiverse's group-chat API is undocumented. Phase-1.5/2 investigation needed.
5. **`social_ledger_mode`** must stay `compact` (MLRPE default) or the Ledger parser returns null and physical state falls back to `[STATE_UPDATE]` only. Document this requirement for users.
6. **Reasoning models** — must emit `[STATE_UPDATE]` in visible content. P0-4 guards the inlined case; can't guard the separate-`reasoning`-field case without reading `message.reasoning`, which may not be in `content`. Verify on first thinking-model test.

---

## Verification Commands (run after each phase)

```bash
# Type-check
bun run check

# Full test suite
bun test

# Build both bundles
bun run build

# (Phase 2+) Confirm bundles output and dist/ is fresh
ls -la dist/
```

All three (`check`, `test`, `build`) must pass before any task is considered done.

---

## Progress Tracking

Mark tasks `- [ ]` → `- [x]` as completed.

**Phase 0 — Stabilize**
- [x] P0-1: secrets/hooks merge-by-key
- [x] P0-2: event-based swipe guard + try/catch
- [x] P0-3: ledger parser hardening
- [x] P0-4: reasoning-only STATE_UPDATE guard
- [x] P0-5: infer detectedPreset
- [x] P0-6: sync LWE_DESIGN.md
- [ ] P0-7 (opt): backend test harness

**Phase 1 — Bridge Contract**
- [x] P1-1: verify {{@}}/{{#if}} macro support — DONE: {{#if}} NOT supported; always-emit approach chosen
- [x] P1-2: decide beatFocal/beatDriver fate — DONE: keep optional, map to MLRPE focus/pressure
- [x] P1-3: author Block A + Block B — DONE: docs/mlrpe-bridge-blocks.md drafted (pending live test)
- [ ] P1-3b: USER tests Block A + Block B in live MLRPE chat, confirms model emits [STATE_UPDATE]

**Phase 1.5 — Data Model**
- [ ] P1.5-1: add block 9/10/11/13 enum types
- [ ] P1.5-2: add meta.schemaVersion
- [ ] P1.5-3: add Faction/Location/StrangerEdge/WorldEvent types
- [ ] P1.5-4: migrateWorldGraph on read
- [ ] P1.5-5: extend STATE_UPDATE validator for new fields

**Phase 2 — Living World**
- [ ] P2-A: tick engine
- [ ] P2-B: world processor sidecar
- [ ] P2-C: world book management
- [ ] P2-D: log tab + event archive
- [ ] P2-E: map tab (stretch)

**Phase 3 — Full Autonomy**
- [ ] persistent backend process
- [ ] memory cortex read for roster seeding
- [ ] userStorage NPC profile library
- [ ] vault snapshots
