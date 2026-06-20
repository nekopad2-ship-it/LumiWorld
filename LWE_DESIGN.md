# Living World Engine (LWE)
## Design Document v1.1 — updated post-audit

> **Source of truth for data model**: MLRPE v1.6.9 blocks 9 (Social), 10 (Moral), 11 (Secrets), 13 (Story), 39 (Cast State Ledger), 55 (task_rail).

> ⚠️ **STALE API NOTICE**: This design doc was written before the Lumiverse Spindle API was verified. Several API signatures in earlier sections have been corrected in the code but not yet fully propagated through this doc. **Where this doc and the code disagree, the code is the source of truth.** Known-corrected call sites below are marked inline. See `.hermes/plans/2026-06-20_112951-lumiworld-roadmap-and-stabilization.md` for the full list of corrections.

---

## 1. What LWE Is (and Isn't)

LWE is a **Lumiverse Spindle extension** that runs a persistent world simulation alongside any RP chat.

**LWE owns:** world state, NPC profiles, relationships, secrets, arcs, events, locations, Tracker UI.
**LWE does NOT own:** writing, prose, RP rules, preset internals, mode variables, Memory Cortex writes.
**MLRPE owns:** all social physics, psychology reasoning, secrets logic, arc direction, disclosure pacing.

The model does the psychology. LWE keeps score.

---

## 2. Architecture

### Runtime and Permissions

> ⚠️ Corrected to match the real `spindle.json`. `runtimeMode` is **not** a manifest field — it is host-side config, not declared here.

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
Storage is free tier (no permission needed). The `world_books` permission is **not** required and is not declared. The active permissions are: `generation` (World Processor sidecar raw gen + `connections.list`), `characters`, `chats`, `chat_mutation` (message content strip), and `ui_panels` (Tracker / float widget).

### Bridge Contract

Two blocks added to MLRPE **once** by the user. LWE does not own these blocks.

**Block A — Pre-history (near Roles/Cast/World section):**
```
{{#if @lwe_world_state}}
[LWE_STATE]
{{@lwe_world_state}}
[/LWE_STATE]
{{/if}}
```
Conditional macro suppresses the block entirely on turn 1 before any WorldGraph exists. LWE writes `{{@lwe_world_state}}` via `spindle.variables.chat.set()`. MLRPE treats injected content as advisory continuity evidence.

**Block B — Post-history (after Recency Anchor):**
The `[STATE_UPDATE]` contract instruction. Tells the model to emit a `[STATE_UPDATE]` block at turn end for hidden simulation state only. Player-visible fields (location, attire, visible mood) are not required in [STATE_UPDATE] for active NPCs — the Cast State Ledger already captures those.

### Data Sources Per Turn

Two machine-readable outputs from every generation. LWE parses both.

| Source | What it contains | Visibility | LWE action |
|---|---|---|---|
| **Cast State Ledger** (block 39) | Visible stance, location, attire, injuries, observable social pressure, known pressure | Player-visible, stays in chat | Parse for physicalState of active NPCs |
| **[STATE_UPDATE] block** | Hidden psychology, emotional state, agenda, offscreen NPC location, durable/momentary edge deltas, secret lifecycle, hook lifecycle, player deltas, new entities, time advance | Hidden, stripped from stored message | Parse for all simulation state |

The Ledger handles player-visible surface data. [STATE_UPDATE] handles everything the player cannot see. The model does not need to double-report visible facts in [STATE_UPDATE] for in-scene NPCs.

### Turn Cycle

```
PRE-TURN
  1. Read WorldGraph from spindle.storage (per-chat file)
  2. If WorldGraph missing: seed from character cards via spindle.characters → init cold start
  3. Distill scene digest → spindle.variables.chat.set(chatId, 'lwe_world_state', digest)
  4. Await World Book NPC entry updates if dirty from last turn

GENERATION
  5. MLRPE runs with [LWE_STATE] + [STATE_UPDATE] contract in context
  6. Model writes prose + Cast State Ledger + [STATE_UPDATE] at end

POST-TURN (GENERATION_ENDED)
  7. Skip commit on swipe/regen via MESSAGE_SWIPED / MESSAGE_EDITED lockout (see §Guard)
  8. Call spindle.chat.getMessages(chatId); take last assistant message
  9. Extract [STATE_UPDATE] from content (regex, anywhere-in-content)
  10. Extract Cast State Ledger from content (regex <details>...</details>)
  11. Strip [STATE_UPDATE] from stored message:
        spindle.chat.updateMessage(chatId, msg.id, {
          content: strippedContent,
          skipChunkRebuild: true
        })
  12. Apply Ledger data → active NPC physicalState (location, attire, mood)
  13. Apply [STATE_UPDATE] deltas → WorldGraph (hidden state)
  14. Increment sceneTurnCount for active NPCs; promote Strangers at count=3
  15. If timeAdvance: fire World Processor sidecar (raw gen, async — see §Sidecar)
  16. Commit WorldGraph → spindle.storage + update chat vars
  17. Push WORLD_UPDATED to Tracker UI frontend
```

### Swipe / Regen Guard

`GENERATION_ENDED` fires for all generation types, including swipes and edits. There is **no** `generationType` field on `GenerationEndedPayloadDTO` — do not attempt to gate on it.

- **Primary approach:** Subscribe to `MESSAGE_SWIPED` and `MESSAGE_EDITED` events. When either fires, add the affected message id(s) to a commit-lockout set. On the subsequent `GENERATION_ENDED`, if the produced message id is in the lockout set (or belongs to a swipe/edit lineage), **skip the commit step** — WorldGraph stays at pre-turn state. Clear the lockout entry once the next genuine new message is committed.
- **Secondary fallback only:** A `generationSessions` heuristic — comparing session ids across consecutive `GENERATION_ENDED` firings to detect re-runs of the same position. Less reliable than the event subscription; use only if the host does not emit `MESSAGE_SWIPED` / `MESSAGE_EDITED`.

Net effect is identical to the old (incorrect) `generationType === 'normal'` check: swipes and regens never commit; only freshly generated assistant messages update the WorldGraph.

### Cold Start

On `CHAT_SWITCHED` (or first `CHARACTER_MESSAGE_RENDERED` with no existing WorldGraph):
1. Fetch the chat, then the character card. This is a **two-step** lookup — `spindle.characters.get()` takes a `characterId`, **not** a `chatId`:
   ```typescript
   const chat  = await spindle.chats.get(chatId);
   const char  = await spindle.characters.get(chat.character_id);
   ```
2. Create stub NPCNode for `{{char}}` and any group members as Majors
3. Create empty WorldGraph, write to `spindle.storage`
4. Set initial `{{@lwe_world_state}}`: `"WorldGraph initialised. No prior session state. Emit [STATE_UPDATE] with sceneCast and any NPCs introduced this turn."`

### World Processor Sidecar

Fires async post-turn when `timeAdvance` is present. Uses `spindle.generate.raw()` — NOT `generate.quiet()`. Quiet routes through MLRPE preset; raw does not.

```typescript
const result = await spindle.generate.raw({
  messages: [
    { role: 'system', content: WORLD_PROCESSOR_SYSTEM_PROMPT },
    { role: 'user', content: JSON.stringify({ worldGraph, stateUpdate }) }
  ],
  parameters: { temperature: 0.2, max_tokens: 800 },
  connection_id: settings.sidecarConnectionId ?? undefined  // null = main connection
})
```

The World Processor prompt is a separate design artifact (Phase 2 deliverable). Connection routing uses `LWESettings.sidecarConnectionId` if configured; falls back to main connection.

---

## 3. Storage Architecture

### `spindle.storage` — Per-Chat Truth Store (file system, extension-scoped)
```
worlds/{chatId}/graph.json          ← current WorldGraph
worlds/{chatId}/events_archive.jsonl ← rolled-over event log entries
```
Written post-turn. Read on chat start and by World Processor sidecar.

### `spindle.userStorage` — Cross-Chat Library (user-scoped)
```
npc_profiles/{slugId}.json    ← canonical NPC seed profiles reused across chats
settings.json                 ← LWESettings
```
When an NPC is promoted to Major, their profile can be saved here as a seed for future chats.

### `spindle.variables.chat` — Scene Digest (macro-accessible)
What goes into `{{@lwe_world_state}}`. Hard ceiling: **200 tokens**.

Priority order when budget is tight:
1. Active scene cast with roles and emotional state (always included)
2. Secrets at `tested` / `partial_exposure` / `full_exposure`
3. Arc phases for active arcs
4. In-world time + recent significant event
5. PlayerNode summary (attire, physical state)
6. Drop lower-priority items if over budget

Format: compact YAML-ish block matching MLRPE's aesthetic.

### World Book Entries — Per-NPC Profile Injection

One World Book entry per NPC, managed by LWE via `spindle.world_books.entries`.

- **Activation keyword:** NPC name (primary) + nameAliases
- **Contains:** psychology spine (attachment_orientation, self_story, meaning_models), current agenda, key active bonds toward player, moral profile
- **Major NPCs:** full profile, ~80–120 tokens
- **Minor NPCs:** compressed 2–3 line entry, ~30–50 tokens
- **Strangers:** no World Book entry (disposition only, in scene digest)

Created on NPC mint. Updated post-turn (awaited before handler exits to prevent race condition). Only fires when NPC name appears in context — Lumiverse's keyword matching handles relevance automatically.

### Token Budget (typical 3-NPC scene)
```
{{@lwe_world_state}} digest      ~120 tokens  (hard ceiling 200)
World Book Major NPC (×2)        ~200 tokens
World Book Minor NPC (×1)        ~40 tokens
[STATE_UPDATE] contract instr.   ~80 tokens
──────────────────────────────────────────
Total LWE footprint              ~440 tokens
```

---

## 4. Data Model

### NPC Tiers

| Tier | Simulated | Axes | Tick | World Book |
|---|---|---|---|---|
| Major | Full psychology, arcs, secrets, agenda queue | Full 13 axes | Full (time-gated) | Full entry |
| Minor | Reduced profile, light arc | Relevant subset | When player-adjacent | Compressed entry |
| Stranger | Single disposition only | StrangerEdge | Never | None |
| Extra | Unnamed placeholder | None | Never | None |

Realistic count: 15–30 per chat. ~3–5 Major, 8–12 Minor, rest Strangers/Extras.

### Tier Promotion Rules
- First mention → **Stranger** (auto-minted)
- 3 scene turns present → **Minor** (auto via `sceneTurnCount`, tracked in WorldGraph)
- Minor → Major → **user-promoted** via Tracker UI

### NPC ID Convention
IDs are `snake_case` slugs of the primary name. Generated by LWE on mint — never by the model. Examples: `mira` → `"mira"`, `Innkeeper Bo` → `"innkeeper_bo"`. Aliases cover name variations. The [STATE_UPDATE] contract instruction must specify that deltas reference IDs, not display names.

---

### NPCNode

```typescript
type NPCNode = {
  id: string                       // snake_case slug, LWE-generated
  name: string                     // display name
  nameAliases: string[]            // name variations for World Book keyword matching
  tier: 'major' | 'minor' | 'stranger' | 'extra'

  profile: {
    // MLRPE block 9 — Social Psychology Core
    attachment_orientation: AttachmentOrientation
    self_story: SelfStory
    closeness_strategy: ClosenessStrategy
    regulation_pattern: {
      settles_by: string
      escalates_when: string
      shuts_down_when: string
      repairs_by: string
    }
    meaning_models: MeaningModel[]
    repair_condition: RepairCondition[]
    dominant_origin: DominantOrigin
    trigger_channels: TriggerChannel[]
    goals: string[]
    fears: string[]
    convictions: string[]
    factionId: string | null
    role: string
  }

  moralProfile: {
    // MLRPE block 10 — Moral Psychology (Major only)
    conscience_profile: ConscienceProfile
    threat_bias: ThreatBias
    moral_drift_stage?: MoralDriftStage
  }

  physicalState: {
    location: string               // locationId — updated from Ledger for active NPCs
    attire: string                 // updated from Ledger for active NPCs
    injuries: string[]             // updated from Ledger for active NPCs
    mood: string                   // observable mood — updated from Ledger
    emotionalState: {              // PERSISTENT psychological state — from [STATE_UPDATE] only
      dominant: string
      secondary: string | null
      intensity: number            // 0–9
    }
  }

  secrets: Secret[]
  agenda: {
    current: string
    pursuing: string[]
    queue: AgendaItem[]
  }
  arcs: Arc[]

  selfKnowledge: {
    knows: string[]
    backstory: string[]
  }

  factionId: string | null
  factionFlags?: ('faction_orphaned')[]
  lastSeenTime: InWorldTime
  lastSeenLocation: string
}

// Note on physicalState:
// location / attire / injuries / mood → parsed from Cast State Ledger for active NPCs
//                                     → from [STATE_UPDATE] npcDeltas for offscreen NPCs
// emotionalState                      → always from [STATE_UPDATE] (hidden, never in Ledger)
```

---

### AgendaItem

```typescript
type AgendaItem = {
  action: string                                    // what the NPC intends to do
  condition: string                                 // must be true before this fires
  priority: 'urgent' | 'active' | 'pending' | 'dormant'
  resourcesRequired: ('wealth' | 'reach' | 'manpower' | string)[]
  targetId: string | null                           // npcId | factionId | locationId | 'player'
  affectsPlayer: boolean
  timeLimit: string | null                          // in-world deadline
}
```

---

### Profile Enumerations (MLRPE block 9)

```typescript
type AttachmentOrientation =
  'secure' | 'anxious' | 'avoidant' | 'disorganized' | 'role_bound' | 'unknown'

type SelfStory =
  'competent' | 'unneeded' | 'desirable' | 'useful' | 'loyal' | 'dangerous' |
  'kind' | 'rational' | 'chosen' | 'pure' | 'ordinary' | 'superior' | 'tough' |
  'innocent' | 'necessary' | 'independent' | 'other'

type ClosenessStrategy =
  'reaches' | 'tests' | 'jokes' | 'serves' | 'teases' | 'performs' |
  'withdraws' | 'controls' | 'competes' | 'bargains' | 'protects' |
  'provides' | 'seduces' | 'intellectualizes' | 'acts_useful'

type MeaningModel =
  'care_as_debt' | 'help_as_humiliation' | 'rest_as_weakness' |
  'command_as_control' | 'attraction_as_threat' | 'dependence_as_shame' |
  'kindness_as_leverage' | 'touch_as_claim' | 'secrecy_as_safety' |
  'refusal_as_abandonment' | 'praise_as_transaction' | 'authority_as_danger' |
  'vulnerability_as_defeat' | 'attention_as_demand' | 'silence_as_rejection' |
  'apology_as_trap' | 'desire_as_loss_of_control' |
  'public_scrutiny_as_threat' | 'care_in_public_as_humiliation'

type RepairCondition =
  'space' | 'apology' | 'restitution' | 'privacy' | 'returned_control' |
  'public_face_restored' | 'changed_behavior' | 'proof_over_time' |
  'shared_action' | 'humor' | 'service' | 'truth' | 'consequence_accepted'

type DominantOrigin =
  'abandonment' | 'betrayal' | 'humiliation' | 'deprivation' |
  'coercion' | 'duty_training' | 'survival_history' | 'status_shaping' | 'other'

type TriggerChannel =
  'touch' | 'authority' | 'silence' | 'public_attention' | 'debt' |
  'dependence' | 'exposure' | 'comparison' | 'bodily_loss' |
  'abandonment_signal' | 'other'
```

---

### Moral Psychology (MLRPE block 10)

```typescript
type ConscienceProfile =
  'guilt_prone' | 'shame_prone' | 'reputation_bound' | 'duty_bound' |
  'ingroup_limited' | 'low_guilt' | 'dominance_rewarded' | 'sadistic' |
  'avoidant_cowardly' | 'ideological'

type ThreatBias =
  'abandonment' | 'disrespect' | 'control' | 'pity' | 'betrayal' |
  'humiliation' | 'weakness' | 'dependency' | 'exposure' | 'loss_of_face' |
  'loss_of_control' | 'bodily_threat' | 'status_loss' | 'resource_loss' |
  'rival_advantage' | 'incompetence' | 'moral_contamination' |
  'secrecy_breach' | 'public_shame' | 'unknown'

type MoralDriftStage =
  'grievance' | 'entitlement' | 'small_boundary_test' |
  'reward_or_no_consequence' | 'rationalization' |
  'repetition' | 'identity_lock' | 'escalation'
```

---

### Secrets (MLRPE block 11)

```typescript
type Secret = {
  content: string
  owner: string
  motive: string
  cover: string
  knowers: string[]
  suspects: string[]
  evidence: string[]
  lifecycle: SecretLifecycle
  exposureCost: string
  identity?: {
    coverRole: string
    trueRole: string
    coverHabits: string[]
    weakPoints: string[]
  }
}

type SecretLifecycle =
  'dormant' | 'strained' | 'suspected' | 'tested' |
  'partial_exposure' | 'full_exposure' | 'aftermath'
```

Secrets surface only through diegetic routes (MLRPE block 11): witnessed contradiction, physical evidence, gossip chain, confession, coercion, blackmail, mistake under pressure, third-party reveal, accumulated suspicion, detection if lore permits, public record.

---

### Arcs (MLRPE block 13)

```typescript
type ArcType =
  'relationship' | 'secret' | 'mystery' | 'faction' | 'survival' | 'rivalry' |
  'character' | 'setting' | 'romance' | 'betrayal' | 'recovery' | 'moral_drift' |
  'exploitation' | 'false_accusation' | 'complicity' | 'reputation_collapse' | 'mixed'

// MLRPE block 13 arc phases — with their enforcement bans
type ArcPhase =
  'grounding'    // ban: major reveal, full confession, climax, closure
  | 'disturbance'  // ban: full explanation, instant repair, final consequence
  | 'complication' // ban: full payoff, easy reconciliation, painless solution
  | 'reversal'     // ban: consequence reset, costless forgiveness
  | 'payoff'       // earned confrontation, reveal, or decisive consequence only
  | 'fallout'      // ban: new arc from nowhere, instant reset, unearned forgiveness

type ChekhovHook = {
  fact: string
  lifecycle: 'planted' | 'warm' | 'ripe' | 'fired' | 'spent' | 'buried'
  ownerId: string | null
}

type Arc = {
  id: string
  name: string
  type: ArcType
  principals: string[]
  phase: ArcPhase
  centralPressure: string
  activeFuel: string[]
  hooks: ChekhovHook[]
  blockedTruthOrGoal: string
  nextCollisionRoute: string
  payoffConditions: string
  falloutRisk: string
  playerAware: boolean
  independentOfPlayer: boolean
}
```

---

### Relationships (MLRPE block 9)

TWO directed edges per pair (A→B and B→A).

```typescript
type RelationshipAxes = {
  // 12 core durable axes
  trust: number          // 0–9
  warmth: number
  obligation: number
  attraction: number
  fear: number
  resentment: number
  dependence: number
  suspicion: number
  rivalry: number
  debt: number
  shared_secret: number
  betrayal_scar: number
  // Structural modifier (MLRPE v1.6.9 addition)
  public_face: number    // reputation/public standing between these two parties
                         // moves on gossip, public scenes, reputation events
                         // NOT purely event-gated like core axes — can shift on
                         // visible social incidents without a named qualifying event
}

type RelationshipEdge = {
  fromId: string
  toId: string
  durable: RelationshipAxes
  momentary: Partial<Omit<RelationshipAxes, 'public_face' | 'betrayal_scar'>>
                         // public_face and betrayal_scar are never momentary
  qualifyingEvents: string[]
  boundaries: Partial<Record<BoundaryDomain, BoundaryState>>
  knowledge: {
    knows: string[]
    believes: string[]
    suspects: string[]
    gaps: string[]
  }
  lastUpdated: InWorldTime
}

type StrangerEdge = {
  fromId: string
  toId: string
  disposition: 'warm' | 'neutral' | 'hostile'
}

type BoundaryDomain =
  'touch' | 'proximity' | 'care' | 'medical_help' | 'shelter_dependence' |
  'command' | 'public_exposure' | 'private_vulnerability' | 'intimacy' |
  'restraint' | 'pursuit' | 'secret_access' | 'resource_use' |
  'status_claim' | 'public_face'

type BoundaryState =
  'unknown' | 'refused' | 'tolerated_under_cost' | 'conditional' | 'welcomed' | 'revoked'
```

**Ordinal band display** (for Tracker UI — never show raw numbers):
0 unsafe/hostile · 1 alarmed · 2 fragile · 3 conditional · 4 functional ·
5 ordinary baseline · 6 tested · 7 vulnerability-capable · 8 durable/proven · 9 foundational/rare

**Hard rules (MLRPE block 9):**
- Core 12 durable axes: change only on named qualifying events. No exceptions.
- `public_face`: shifts on visible social incidents, gossip chains, public scenes — no named event required, but must have a diegetic route.
- `betrayal_scar`: persists after `trust` recovers. Only in durable, never momentary.
- Momentary affect never writes to durable without a qualifying gate.
- `shared_secret` and `public_face` are structural — they modify the entire relationship texture rather than representing a single emotional axis.
- No axis globally unlocks consent, vulnerability, confession, or intimacy.

---

### Factions

```typescript
type FactionNode = {
  id: string
  name: string
  type: 'guild' | 'government' | 'criminal' | 'religious' | 'mercantile' | 'other'
  status: 'active' | 'weakened' | 'collapsed' | 'unknown'
  resources: { wealth: 0|1|2|3; reach: 0|1|2|3; manpower: 0|1|2|3 }
  territory: string[]
  publicStance: string
  trueAgenda: string
  members: { npcId: string; role: string }[]
}
```

Cascade rule: `status === 'collapsed'` → suspend faction-dependent agenda items + flag members `faction_orphaned`. `manpower === 0` → items requiring manpower FAIL (log attempt).

---

### Locations

```typescript
type LocationNode = {
  id: string
  name: string
  type: 'building' | 'district' | 'wilderness' | 'settlement' | 'dungeon' | 'other'
  controlledBy: string | null
  accessLevel: 'open' | 'restricted' | 'hidden' | 'sealed'
  currentOccupants: string[]       // npcIds — updated from Ledger and [STATE_UPDATE]
  recentEvents: string[]
  connections?: string[]           // Phase 3 only
}
```

---

### WorldEvents

```typescript
type WorldEvent = {
  id: string
  sourceId: string
  type: 'npc_action' | 'faction_move' | 'time_advance' | 'offscreen_resolution' | 'player_targeted'
  description: string
  affectedIds: string[]
  playerVisible: boolean
  injectionState: 'queued' | 'injected' | 'resolved' | 'expired'
  conditions: string
  timestamp: InWorldTime
}
```

**Rolling window:** Keep last 50 events in `eventLog[]` on WorldGraph. Archive older entries to `worlds/{chatId}/events_archive.jsonl` (append-only). Tracker UI Log tab reads both.

---

### PlayerNode

```typescript
type PlayerNode = {
  attire: string
  physicalState: string
  inventory: { name: string; notes?: string }[]
  skills: string[]
  backstory: string[]
  knownBy: Record<string, {
    knows: string[]
    believes: string[]
    suspects: string[]
    gaps: string[]
  }>
}
```

---

### SceneCast

> ⚠️ **NOTE:** `beatFocal` and `beatDriver` are **not native MLRPE fields**. They are invented names with zero preset grounding. MLRPE's native vocabulary here is `focus` / `pressure` / `ensemble`. Either Block B must explicitly map `beatFocal`/`beatDriver` onto MLRPE's `focus`/`pressure` vocabulary, or these fields should be dropped entirely. **This is unresolved — see P1-2 in the implementation plan.**

```typescript
type SceneCast = {
  active: string[]
  nearby: string[]
  offscreen: string[]
  cardPrincipal: string | null     // MLRPE — loaded {{char}} card
  beatFocal: string | null         // MLRPE block 55 Task 0 — current POV counterpart
  beatDriver: string | null        // MLRPE block 55 Task 0 — who drives this beat
  lastUpdated: number              // turnCount
}
```

---

### WorldGraph (root)

```typescript
type InWorldTime = {
  descriptor: string
  turnCount: number
  lastExtracted: string
}

type WorldGraph = {
  chatId: string
  inWorldTime: InWorldTime
  sceneCast: SceneCast
  sceneTurnCount: Record<string, number>  // npcId → consecutive active-scene turns
                                           // resets when NPC leaves active; drives promotion
  npcs: Record<string, NPCNode>
  edges: RelationshipEdge[]
  strangerEdges: StrangerEdge[]
  factions: Record<string, FactionNode>
  locations: Record<string, LocationNode>
  eventLog: WorldEvent[]                  // rolling: last 50 only; rest archived
  playerNode: PlayerNode
  meta: {
    schemaVersion: number                 // increment on breaking changes
    detectedPreset: string | null         // display label only, never a behavior flag
  }
}
```

---

### LWESettings (userStorage)

```typescript
type LWESettings = {
  sidecarConnectionId: string | null    // null = use main connection
  sidecarModel: string | null           // null = use connection's default
}
```

Exposed in Tracker UI settings panel. Default: `null` for both. Document performance implication: null means every tick costs a call on the main connection.

> ⚠️ **Corrected connection API.** The secondary-connection picker is populated via `spindle.connections.list(userId?)` — note the **plural** `connections` namespace. It requires the `'generation'` permission (already declared in the manifest). There is **no** `spindle.threads` and no singular `spindle.connection` namespace; do not use either. `sidecarConnectionId` stores the `id` returned by `connections.list()`.

---

### Schema Migration

On every `spindle.storage.read()` of a WorldGraph:
1. Check `meta.schemaVersion`
2. If lower than current version, run the versioned migration chain:
   ```typescript
   const migrations: Record<number, (g: any) => any> = {
     1: migrate_1_to_2,
     2: migrate_2_to_3,
     // ...
   }
   ```
3. Apply each migration in order, write result back to storage

---

## 5. `[STATE_UPDATE]` Schema

Emitted by the model at turn end, per the post-history contract block.

**Important:** For NPCs currently in `sceneCast.active`, `moodNow` and `locationNow` are optional — the Cast State Ledger captures these as player-visible data and LWE reads them from there. For offscreen NPCs, they are required. `emotionalStateNow` is always required for Major NPCs (it is hidden psychology, not in the Ledger).

> ⚠️ **NOTE:** the `beatFocal` / `beatDriver` keys shown in the `sceneCast` object below are **not native MLRPE fields**. They are invented names with zero preset grounding. Native MLRPE vocabulary is `focus` / `pressure` / `ensemble`. Either Block B must explicitly map them, or they should be dropped. **Unresolved — see P1-2 in the implementation plan.** (Same caveat applies to the `SceneCast` type in §4.)

```
[STATE_UPDATE]
{
  "sceneCast": {
    "active": ["mira", "draven"],
    "nearby": ["innkeeper_bo"],
    "offscreen": ["veth"],
    "cardPrincipal": "mira",
    "beatFocal": "mira",
    "beatDriver": "draven"
  },
  "timeAdvance": { "amount": "3 days", "newDescriptor": "early winter, year 4" } | null,
  "npcDeltas": [
    {
      "id": "mira",
      // moodNow and locationNow: optional for active NPCs (Ledger covers them)
      //                          required for offscreen NPCs
      "moodNow": "guarded",
      "locationNow": "east_market",
      // emotionalStateNow: always include for Major NPCs (hidden, not in Ledger)
      "emotionalStateNow": { "dominant": "dread", "intensity": 6 },
      "agendaNow": "stalling guild while deciding whether to warn player"
    }
  ],
  "edgeDeltas": [
    {
      "from": "mira", "to": "player",
      "momentary": { "warmth": 1 },
      "durableChanges": { "trust": -1, "suspicion": 2, "betrayal_scar": 1 },
      "qualifyingEvent": "player lied about the dagger (refusal of honesty, witnessed)",
      "publicFaceShift": -1,           // optional — separate from durable, no qualifying event needed
      "boundaryChanges": { "private_vulnerability": "revoked" }
    }
  ],
  "secretDeltas": [
    {
      "secret": "mira_true_faction",
      "lifecycle": "suspected->tested",
      "suspects": ["player"],
      "newEvidence": ["overheard guild password"]
    }
  ],
  "hookDeltas": [
    { "arc": "mira_identity", "fact": "inscribed dagger", "lifecycle": "warm->ripe" }
  ],
  "playerDeltas": {
    "attire": "grey cloak, hood up",
    "inventory": { "add": ["sealed letter"], "remove": [] },
    "physicalState": "shallow cut, left forearm"
  },
  "newEntities": [
    { "name": "hooded courier", "tier": "stranger", "location": "east_market" }
  ]
}
[/STATE_UPDATE]
```

### Parser Rules

- Find `[STATE_UPDATE]...[/STATE_UPDATE]` anywhere in content using regex (not assumed to be at end)
- Opening tag must be at the start of a line: `/^\[STATE_UPDATE\]/m`
- On malformed / missing JSON: log warning, skip commit, show toast notification to user
- On durable change with no `qualifyingEvent`: route change to momentary instead — never silently commit
- `newEntities`: LWE generates the ID (slugify name), stores `name` in `nameAliases[0]`
- `publicFaceShift` on edgeDelta: apply directly to `durable.public_face` without qualifying event gate

---

## 6. Cast State Ledger Parsing

MLRPE block 39 (`LEDGER_COMPACT`) emits a `<details>` block at turn end when `social_ledger_mode = compact`. LWE parses this for player-visible surface state of active NPCs.

### Parser

```typescript
function parseLedger(content: string): LedgerData | null {
  const match = content.match(/<details>[\s\S]*?<\/details>/i)
  if (!match) return null   // ledger absent (mode=off or not emitted this turn)

  const rows = match[0].split('\n')
  // Parse **Focus:**, **Cast:**, **Bonds/social:**, **Known pressure:** rows
  // Extract NPC names and their visible state/location from each row
  // Return structured LedgerData for WorldGraph update
}
```

Fallback: if `parseLedger` returns null (ledger disabled or not emitted), physicalState for active NPCs is updated from `npcDeltas` in [STATE_UPDATE] only.

The Ledger is NOT stripped from the stored message. It is player-visible and belongs in the chat history.

### What LWE Extracts from the Ledger

| Ledger field | Updates in WorldGraph |
|---|---|
| Focus/Cast: visible stance, distance | `physicalState.mood` (observable only) |
| Focus/Cast: position, location mention | `physicalState.location` + `LocationNode.currentOccupants` |
| Focus/Cast: attire, injuries, gear | `physicalState.attire`, `physicalState.injuries` |
| Bonds/social: observable relationship behavior | Not stored separately — already captured in Ledger as player-known history |
| Known pressure: unresolved promises, clues | Surfaced in Tracker UI "player-known pressure" panel only |

What LWE does NOT extract from the Ledger: hidden motives, private psychology, durable axis values, secret lifecycle, arc phase — these come only from [STATE_UPDATE].

---

## 7. Tick Engine

Trigger: `timeAdvance` present in [STATE_UPDATE]. Time-based, not turn-based.

```
On GENERATION_ENDED (confirmed send, after WorldGraph commit):

  If timeAdvance in stateUpdate:
    For each MAJOR NPC with agenda items:
      - Check item.condition met (against current WorldGraph)?
      - Check faction viability (cascade rule)?
      - fireable + affectsPlayer + target in sceneCast.active  → queue WorldEvent (immediate)
      - fireable + affectsPlayer + target offscreen            → queue WorldEvent (conditional)
      - fireable + !affectsPlayer                             → resolve offscreen, append eventLog
    Resolve NPC-NPC conflicts (resources/leverage weighting)

  For each active arc:
    Check if current phase bans have been violated in the turn's [STATE_UPDATE]
    Advance hook lifecycles per hookDeltas

  Commit updated WorldGraph
```

World Processor runs while user reads the response. Zero added latency to the chat.
Swipe / Regen: DO NOT commit. WorldGraph stays at pre-turn state.

---

## 8. UI

### Floating Mini-Widget (`ctx.ui.createFloatWidget`)

Minimal. Collapsible. Visible at chat edge. Only shown when active WorldGraph exists for the current chat.

Contents:
- Scene cast name chips colored by tier
- Hot alert row: secrets at `tested`+, NPC urgent agenda items, arc at `payoff` phase
- Click → opens full Tracker drawer

Updated after each turn via `spindle.sendToFrontend({ type: 'WORLD_UPDATED', chatId })` push.

> ⚠️ **Corrected.** The Spindle frontend API is `ctx.ui.createFloatWidget` — there is no `ctx.placement.addFloatingWidget`. Additionally, the sandbox iframe does **not** expose `localStorage` / `sessionStorage`, and the current widget renders directly into the host DOM rather than into an isolated iframe (so it shares the host's storage surface, not a sandboxed one). Keep all state on the backend; the widget is presentational only.

### Tracker Drawer (main panel)

**Phase 1:**

**People** — NPC cards by tier. Expand to full profile:
- Psychology (attachment_orientation, self_story, meaning_models, regulation_pattern, etc.)
- Moral profile (conscience_profile, threat_bias, moral_drift_stage if active)
- Emotional state: dominant / secondary / intensity (bands displayed as text)
- Current agenda, goals, fears, convictions
- Secrets with lifecycle badges
- Arcs with phase indicators and hook list
- Physical state (location, attire, injuries) — sourced from Ledger for active NPCs
- Manual override on any field; flag user-edited vs simulation-written visually

**Relationships** — Per NPC pair:
- All 13 durable axes (incl. public_face) displayed as ordinal band text
- Momentary axes shown separately, dimmer (transient — will decay)
- Boundary states per domain
- Knowledge gaps per direction (knows / believes / suspects / gaps)
- Qualifying events audit trail

**Phase 2:**

**Log** — Timestamped WorldEvents. Filter by NPC / location / type. Offscreen events marked. Reads both `eventLog` (hot) and `events_archive.jsonl` (cold).

**Map** — Schematic location nodes with NPC pins. Faction territory overlay. List/graph format.

### Frontend Push Protocol

Backend → Frontend messages after GENERATION_ENDED:
```typescript
spindle.sendToFrontend({ type: 'WORLD_UPDATED', chatId, summary: { 
  activeCast: string[],
  hotAlerts: string[]    // for mini-widget update without full data request
}})
```

Frontend requests full WorldGraph on drawer open:
```typescript
// frontend
ctx.sendToBackend({ type: 'GET_WORLD_GRAPH', chatId })
// backend responds
spindle.sendToFrontend({ type: 'WORLD_GRAPH_DATA', graph: WorldGraph })
```

---

## 9. Phase Breakdown

### Phase 1 — Foundation
1. `types.ts` — full data contract (this document)
2. `[STATE_UPDATE]` schema + parser + robust regex
3. Cast State Ledger parser
4. `spindle.json` manifest
5. Cold-start NPC seeding from character cards
6. `GENERATION_ENDED` handler → swipe guard → getMessages → parse both sources → strip [STATE_UPDATE] → commit
7. `sceneTurnCount` tracking + auto-promotion (Stranger → Minor at 3)
8. World Book entry management (create on mint, await updates post-turn)
9. `{{@lwe_world_state}}` digest builder with 200-token ceiling
10. Floating mini-widget
11. Tracker UI: People + Relationships tabs (read-only first, then manual override)
12. Frontend push protocol

### Phase 2 — Living World
- World Processor sidecar prompt + `generate.raw()` integration
- `LWESettings` UI (secondary connection picker)
- Tick engine (time-based, Major NPC agenda advance)
- NPC-NPC edge simulation; offscreen resolution
- World Log tab + event archive
- Map tab

### Phase 3 — Full Autonomy
- Persistent backend process
- World Map with location connections
- Optional Memory Cortex read for roster seeding
- `userStorage` NPC profile library (cross-chat profile seeds)
- Vault snapshots at arc fallout boundaries

---

## 10. Hard Rules

- **Core durable axes are event-gated.** No qualifying event named in the delta → route to momentary. Non-negotiable.
- **`public_face` is not event-gated** — it shifts on visible social incidents, gossip, reputation events. Has its own `publicFaceShift` field in edgeDeltas.
- **`betrayal_scar` is durable only.** Never momentary. Persists after `trust` recovers.
- **Harm > repair.** Positive movement needs repeated proof.
- **Regen / swipe never commits.** WorldGraph stays at pre-turn state.
- **Tier gates compute.** Strangers/Extras never tick. Minor only when player-adjacent.
- **Bonds seed from evidence only.** Declared closeness is a claim, not proof.
- **No Memory Cortex writes.** Read only (Phase 3 seeding). LWE state stays in storage + chat vars.
- **Never touch MLRPE mode variables.** `agency_mode`, `arc_mode`, `social_ledger_mode` etc. are preset-owned.
- **World Book entries + storage keys namespaced** under `lwe.living-world`. No generic keys.
- **No browser storage in Tracker UI.** Spindle iframe does not support localStorage/sessionStorage.
- **World Processor uses `generate.raw()`.** Never `generate.quiet()` — quiet runs MLRPE.
- **[STATE_UPDATE] strip uses `skipChunkRebuild: true`.** Prevents double-embedding in Long-Term Memory.
- **Cast State Ledger is never stripped.** It is player-visible and stays in chat history.
- **Parse content only, not reasoning.** For thinking models, [STATE_UPDATE] must appear in visible output. If it appears only in the reasoning block, log and skip.
- **`detectedPreset` is display only.** Never a behavior flag.
