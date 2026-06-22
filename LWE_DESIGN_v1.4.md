# Living World Engine (LWE)
## Design Document v1.4 — Standalone NPC Agency Extension

**Status:** Replacement for `LWE_DESIGN_v1.3_AUDITED.md`  
**Runtime target:** Lumiverse Spindle  
**Product identity:** Preset-agnostic, standalone NPC agency and persistent world-state extension  
**Primary change:** LWE no longer mirrors or depends on any named preset. It treats the main generation stack as an opaque scene renderer and supplies it with independent NPC actions and world developments.

---

# 0. Executive Definition

LWE is a persistent simulation layer that surrounds ordinary roleplay generation.

It answers four questions the main roleplay model is not reliably positioned to answer across long conversations:

1. **Who exists outside the current scene, and what do they know?**
2. **What do those people want, fear, protect, or pursue?**
3. **What actions do they independently take when time and opportunity permit?**
4. **Which of those actions have now reached or changed the current scene?**

The main LLM remains responsible for writing the immediate continuation. It receives the user’s latest message, the normal prompt and history, and a compact `LWE_SCENE_IMPACT` package. It then resolves timing, interruption, physical collisions, current reactions, dialogue, and prose.

```text
Character cards · lore · prior behaviour · user edits
                         ↓
                NPC Profile Builder
                         ↓
                Persistent WorldGraph
                         ↓
User message → Time/Event Router → NPC Agency Engine
                         ↓
                LWE_SCENE_IMPACT
                         ↓
        Main LLM + any prompt/preset + history
                         ↓
              Immediate scene + prose
                         ↓
                 State Extractor
                         ↓
              WorldGraph · Tracker UI
```

The core division is:

> **LWE decides what independent people are trying or managing to do. The main LLM decides how those developments collide with the user’s latest action and become a scene.**

---

# 1. Normative Decisions

1. **LWE is standalone.** It does not require preset blocks, hidden ledgers, custom macros, or structured output from the main LLM.
2. **The main generation stack is opaque.** LWE does not depend on how the main model reasons, which preset is active, or how prose is formatted.
3. **LWE owns persistent offscreen NPC agency.** It tracks profiles, knowledge, goals, agendas, plans, actions, movement, schedules, and consequences.
4. **The main LLM owns immediate scene resolution.** It resolves the user’s newest action against LWE actions that are currently reaching or occurring in the scene.
5. **Committed facts are authoritative; intentions are defeasible.** The main LLM must preserve events that already happened, but may interrupt, redirect, or defeat an intention or action in progress.
6. **The State Extractor records canon; it does not create it.** It may identify grounded changes in the generated text but may not invent hidden motives, elapsed time, relationships, or events.
7. **The Agency Engine is character-driven.** It must choose through each NPC’s knowledge, motives, self-story, strategies, costs, and opportunities—not through generic plot convenience.
8. **Inaction is always a valid candidate.** Witnessing an event does not create an obligation to report, recruit, intervene, gossip, or become relevant.
9. **Profiles are persistent.** Generate missing structure once; thereafter revise through evidence, user edits, or explicit development rather than rerolling personality every turn.
10. **Depth scales by tier.** Extras do not receive expensive psychology; recurring and consequential NPCs do.
11. **Time is conservative.** Explicit narrative cues advance time. Ambiguous dialogue does not accumulate automatic minutes.
12. **Every state change has provenance.** Inferred values retain source, evidence, confidence, and lock status.
13. **Every patch is idempotent.** The same generation or message may update a graph only once.
14. **Same-chat mutations are serialized.** A new turn must not read a half-applied prior update.
15. **LWE degrades safely.** Sidecar failure must never prevent the main roleplay generation from continuing.

---

# 2. Product Boundaries

## 2.1 LWE Owns

- Persistent NPC identities and aliases
- Character-card and lore intake
- Preset-neutral NPC Psychology Spines
- Goals, motives, obligations, fears, values, and moral limits
- Knowledge, beliefs, suspicions, misinformation, and information routes
- Offscreen NPC appraisal and candidate-action selection
- NPC agendas, plans, schedules, travel, and action lifecycles
- Factions, locations, objects, resources, and world events
- Secrets and evidence as world facts
- Relationship history and optional relationship facets
- In-world clock and scheduled consequences
- Scene-impact selection and prompt injection
- Post-turn state extraction
- Provenance, confidence, evidence, and user-locked fields
- Tracker Dock, Settings drawer, import/export, migrations, and debug traces

## 2.2 LWE Does Not Own

- The prose style of the main response
- POV, tense, formatting, or verbosity
- The user’s actions, thoughts, emotions, or decisions
- Immediate dialogue wording
- Moment-to-moment embodiment of characters currently being rendered
- Final physical resolution of a collision involving the latest user action
- The active preset’s private reasoning process
- Preset variables, prompt blocks, or mode switches
- Automatic rewriting of character cards or lorebooks
- Memory-system writes unless added as a separate optional integration

## 2.3 Active-Scene Boundary

The boundary is based on **action state**, not merely whether an NPC is physically present.

### LWE may determine and commit

- An NPC travelled while offscreen and has already arrived.
- A witness reported an incident before the current turn.
- A faction closed a gate overnight.
- An NPC sent a message that is now waiting to be delivered.
- An NPC has taken a position outside the current room.
- An NPC has formed an intention, scheduled a plan, or begun an approach.

### The main LLM resolves

- Whether the user notices an approaching NPC.
- Whether the user interrupts an action in progress.
- Whether an NPC’s prepared speech is ever delivered.
- The immediate response to the user’s newest behaviour.
- Timing and physical priority when multiple actions collide.
- How the scene is narrated.

Example:

```text
Committed fact:
Dena reached the street outside the shop before Ken entered.

Action in progress:
Dena is moving toward the door.

Intention:
Dena wants to assess Ken for recruitment.

User action:
Ken dives through the rear window.
```

LWE may not force the recruitment conversation. The main LLM resolves the window escape, what Dena can observe, and whether her plan is interrupted. The extractor then records the actual outcome.

---

# 3. Spindle Runtime and Manifest

Backend extensions run through Spindle’s isolated extension runtime. Prompt interceptors execute after prompt assembly and before the final request reaches the main LLM. LWE uses this interceptor stage to calculate and inject `LWE_SCENE_IMPACT` directly; no user-installed prompt block is required.

## 3.1 Manifest

```json
{
  "identifier": "lwe_living_world",
  "name": "Living World Engine",
  "version": "0.3.0",
  "author": "YOUR_NAME",
  "github": "YOUR_REPOSITORY_URL",
  "homepage": "YOUR_PROJECT_URL",
  "description": "Persistent NPC agency, offscreen simulation, and living-world tracking for Lumiverse roleplay chats.",
  "permissions": [
    "generation",
    "interceptor",
    "characters",
    "chats",
    "chat_mutation",
    "ui_panels"
  ],
  "entry_backend": "dist/backend.js",
  "entry_frontend": "dist/frontend.js",
  "minimum_lumiverse_version": "0.2.0",
  "interceptorTimeoutMs": 20000
}
```

### Permission purposes

| Permission | Use |
|---|---|
| `generation` | Run raw sidecar calls for profile building, agency decisions, extraction, and optional time inference |
| `interceptor` | Insert the scene-impact package into the assembled main prompt |
| `characters` | Read character cards for profile seeding |
| `chats` | Resolve chat metadata and associated character IDs |
| `chat_mutation` | Read committed messages for extraction, rebuild, and reconciliation |
| `ui_panels` | Create the floating orb and right-side Tracker Dock |

### Optional permissions

Add `world_books` only if a future optional synchronization feature creates or edits World Book entries. It is not required by the core architecture.

### Free capabilities

Spindle extension storage, user storage, variables, frontend/backend messaging, logs, and drawer tabs do not require additional permissions.

## 3.2 Interceptor timeout policy

The manifest timeout is a ceiling, not a target. LWE should usually finish pre-generation work quickly by:

- Parsing time cues deterministically first
- Evaluating only NPCs whose state or opportunity changed
- Reusing cached profiles
- Precomputing low-urgency plans after the preceding turn
- Skipping sidecar agency calls when no trigger fires
- Falling back to the last valid world state rather than blocking generation

---

# 4. System Architecture

```text
┌──────────────────────────────────────────────────────────────┐
│                    Source Intake Layer                       │
│ Character cards · lore · chat evidence · user edits         │
└────────────────────────────┬─────────────────────────────────┘
                             │
┌────────────────────────────▼─────────────────────────────────┐
│                    NPC Profile Builder                       │
│ Psychology Spine · goals · strategies · provenance          │
└────────────────────────────┬─────────────────────────────────┘
                             │
┌────────────────────────────▼─────────────────────────────────┐
│                       WorldGraph                             │
│ entities · knowledge · relationships · agendas · actions    │
│ events · locations · factions · secrets · clock             │
└───────────────┬───────────────────────────────┬──────────────┘
                │                               │
┌───────────────▼────────────────┐  ┌───────────▼──────────────┐
│      NPC Agency Engine         │  │   State Extractor        │
│ subjective appraisal           │  │ grounded canon updates   │
│ candidates · cost · selection  │  │ after main generation    │
└───────────────┬────────────────┘  └───────────┬──────────────┘
                │                               │
┌───────────────▼───────────────────────────────▼──────────────┐
│                    Turn Orchestrator                         │
│ time · schedules · relevance · injection · commit queue     │
└────────────────────────────┬─────────────────────────────────┘
                             │ LWE_SCENE_IMPACT
┌────────────────────────────▼─────────────────────────────────┐
│                      Main LLM                               │
│ Conversation + user message + active prompt/preset          │
│ Resolves current scene and writes prose                     │
└──────────────────────────────────────────────────────────────┘
```

The main LLM is not an LWE component. LWE neither assumes nor inspects its internal reasoning.

---

# 5. Operation Modes

Operation mode determines how much agency LWE exercises. It is independent of whichever preset or prompt the user has selected.

## 5.1 Full Agency — default

LWE:

- Builds persistent NPC profiles
- Evaluates relevant offscreen NPCs
- Selects and schedules independent actions
- Advances movement and time-gated events
- Injects scene-impact developments
- Extracts what became canon

This is the complete living-world experience.

## 5.2 Observe-Only

LWE:

- Reads cards and conversation
- Extracts and stores state
- Displays the world in the Tracker
- Does not autonomously select new NPC actions

Use when the user already relies on another world simulation or wants LWE only as a tracker.

## 5.3 Manual

LWE:

- Stores profiles and world state
- Advances only user-authored plans, schedules, and events
- Provides Tracker controls for creating or approving NPC actions
- Does not automatically call the Agency Engine

Use for tightly directed stories or debugging.

## 5.4 Per-NPC overrides

Any NPC may independently be set to:

- `auto`
- `observe_only`
- `manual`
- `frozen`

A frozen NPC retains state but neither advances nor receives autonomous profile changes.

---

# 6. Complete Turn Cycle

## 6.1 Before generation

When the user sends a message:

1. Capture `chatId` and `generationType` from interceptor context.
2. Await the prior same-chat commit barrier.
3. Load and migrate the current WorldGraph.
4. Parse explicit time cues from the user message.
5. Optionally run conservative time inference when a real cue exists but is ambiguous.
6. Advance due schedules, travel, deadlines, and actions already in progress.
7. Promote completed offscreen actions to committed world facts.
8. Route new stimuli to potentially affected NPCs.
9. Evaluate only NPCs whose knowledge, goals, opportunity, schedule, or current pressure changed.
10. Persist selected intentions or plans in a provisional in-memory graph.
11. Select only developments relevant to the current scene.
12. Build `LWE_SCENE_IMPACT`.
13. Inject it as a system message with Prompt Breakdown attribution.
14. Allow the main generation to proceed.

## 6.2 During main generation

The main LLM receives:

- Its normal assembled prompt
- Conversation history
- The user’s latest message
- `LWE_SCENE_IMPACT`

It must weave these into one continuation.

The main LLM may:

- Interrupt an intention
- Prevent an action in progress
- Reveal only the observable part of a hidden plan
- Resolve timing and physical collisions
- Change an NPC’s immediate response because of new user behaviour

It may not silently erase a committed fact without an in-scene explanation.

## 6.3 After generation

On a confirmed normal generation:

1. Read the newly stored assistant message.
2. Run the State Extractor using a bounded relevant graph slice, the injected impact package, the user message, and the assistant response.
3. Produce a strict `lwe.patch.v1` patch containing only grounded outcomes.
4. Validate the patch.
5. Mark LWE actions as completed, interrupted, abandoned, redirected, or still pending.
6. Update location, presence, injuries, objects, messages, knowledge, and events.
7. Route newly established stimuli to affected NPCs.
8. Optionally precompute low-urgency next plans asynchronously for the following turn.
9. Commit the graph transactionally.
10. Increment revision and record patch IDs.
11. Update the Tracker Dock and orb badge.

## 6.4 Why two agency moments may exist

### Pre-turn agency

Determines what has already progressed or is now reaching the scene before the main response.

### Post-turn planning

May form or revise hidden intentions based on what just became canon. It must not retroactively insert a visible event into the response that already finished. Observable consequences surface on a later turn unless the main response itself established them.

---

# 7. Sidecar Task Architecture

“Sidecar” means a separate raw model call used for a narrow machine task. It is not a second narrator and it does not automatically share the active roleplay preset.

The same connection may run several tasks, but each task uses a separate prompt contract.

## 7.1 Character Card Profile Builder

**Question:** What stable, causally useful NPC structure is supported by the source material?

**Inputs:**

- Character card fields
- Relevant lore
- Existing partial profile
- Explicit user edits
- Bounded behavioural evidence
- Requested NPC tier

**Output:**

- `NPCAgencyProfile`
- Provenance and confidence per field
- Explicit contradictions
- Unresolved fields
- No action decision

**Frequency:**

- Cold start for card-backed characters
- First persistence of a recurring NPC
- Tier promotion
- Explicit user rebuild
- Major new evidence requiring profile revision

It does not run every turn.

## 7.2 State Extractor

**Question:** What objectively became canon in the completed turn?

**Inputs:**

- Relevant prior graph slice
- `LWE_SCENE_IMPACT` used for the generation
- Current user message
- New assistant message

**Output:**

- `CanonicalPatchV1`
- Warnings for ambiguity
- No unsupported hidden psychology

The extractor must distinguish:

- Attempt from outcome
- Intention from completed action
- Dialogue claim from objective fact
- Perception from shared world truth
- Example or hypothetical language from canon

## 7.3 Time Inference

**Question:** How much in-world time definitely or probably passed?

Use deterministic parsing first. Call the sidecar only if:

- The user or assistant used an ambiguous but real temporal cue
- Travel or a task clearly consumed time without a stated duration
- The current timeline cannot be reconciled without an estimate

Output:

```json
{
  "minutes": 0,
  "confidence": 0.0,
  "source": "explicit|narrative_cue|travel_estimate|uncertain",
  "cue": null
}
```

If uncertain, return zero rather than creating cumulative drift.

## 7.4 NPC Agency Processor

**Question:** Given what this NPC knows and wants, what—if anything—will they now attempt?

**Inputs:**

- One NPC’s profile
- Their knowledge and misconceptions
- Current goals and obligations
- Relevant relationships
- Stimulus events
- Available resources
- Time, location, access, and opportunity
- Existing plans and competing priorities

**Output:**

- Subjective read
- Activated stakes
- Candidate actions
- Rejected candidates
- Selected decision or inaction
- Requirements and schedule
- Confidence and decision trace

## 7.5 Profile Evidence Updater

**Question:** Does accumulated behaviour justify revising a stable profile field?

This task is evidence-gated. One unusual action should normally update current state or pressure, not rewrite personality.

Examples:

- One avoided fight does not make a high-risk NPC permanently cowardly.
- Repeated sacrifices for a faction may strengthen inferred institutional loyalty.
- A card-explicit trait is not overwritten by a single contradictory beat.

## 7.6 Scene Impact Composer

This should be deterministic code where possible.

It selects:

- Committed facts now relevant to the current location or characters
- Actions currently entering or occurring in the scene
- Intentions needed to preserve continuity
- Knowledge limits that prevent omniscient rendering
- Immediate environmental or institutional effects

An optional sidecar may compress wording when the deterministic package exceeds the token budget. Compression must preserve certainty labels and IDs internally.

---

# 8. Character Card and Lore Intake

Character cards are primary authored sources for card-backed characters. LWE converts them into a canonical profile without altering the card.

## 8.1 Cold-start access path

```typescript
const chat = await spindle.chats.get(chatId)
if (!chat?.character_id) return

const character = await spindle.characters.get(chat.character_id)
```

Do not pass `chatId` directly to `characters.get()`.

## 8.2 Source priority

Highest authority first:

1. User-locked manual edits
2. Explicit character-card and lore facts
3. Repeated established conversation behaviour
4. High-confidence contextual inference
5. Sidecar-generated provisional inference
6. Role-based prior

A lower-authority source may flag a contradiction but may not silently overwrite a locked or explicit higher-authority field.

## 8.3 Card fields LWE may use

- Name and aliases
- Description and personality
- Scenario and role
- Backstory
- Goals, fears, dislikes, loyalties, and values
- Relationships and factions
- Secrets explicitly authored in the card
- Speech examples as behavioural evidence
- First message as presentation evidence
- Lorebook facts associated with the character

## 8.4 Example-dialogue rule

Example dialogue may support inferences about:

- Directness
- Register
- Negotiation style
- Emotional disclosure
- Treatment of authority, peers, or subordinates
- Typical deflection or coping strategy

It must not be stored as an event that literally occurred in the current timeline unless the conversation establishes it.

## 8.5 No mandatory trauma generation

Depth does not require every NPC to receive:

- A childhood wound
- An attachment label
- A secret shame
- A tragic origin
- A hidden obsession

Ordinary motives are often sufficient:

- Needs money
- Wants promotion
- Does not trust guards
- Hates the merchant
- Is late for work
- Finds Ken impressive
- Wants to avoid public trouble
- Protects a sibling

Formative history is included only when authored, evidenced, or necessary to explain a stable recurring pattern.

## 8.6 Group and multi-card chats

Where the platform exposes multiple member cards, each card receives a separate entity and Agency Profile. LWE must never merge group members into one shared personality, knowledge state, or agenda.

---

# 9. NPC Tiers and Profile Depth

## 9.1 Extra

- Unnamed or function-only crowd member
- No persistent Psychology Spine
- No independent tick
- May contribute only to immediate crowd conditions

## 9.2 Stranger

Stores:

- Role
- Immediate want
- Current pressure
- Disposition
- Risk tolerance
- Minimal knowledge

May choose only low-complexity outcomes such as leave, watch, intervene, avoid, remember, or ignore.

## 9.3 Minor

Stores:

- Compact Psychology Spine
- One to three goals
- Stable strategies
- Basic relationships
- Limited agenda queue
- Persistent knowledge

Ticks only when adjacent to a relevant event or schedule.

## 9.4 Major

Stores:

- Full Psychology Spine
- Conflicting motives
- Long-term agendas
- Moral limits and rationalizations
- Complex relationships
- Secrets and faction ties
- Adaptive strategies
- Rich decision history

## 9.5 Promotion and demotion

Suggested rules:

- First meaningful named appearance → Stranger
- Recurrent presence or consequential action → Minor
- User promotion, card backing, or sustained narrative importance → Major
- Long-term inactivity may archive but should not erase the profile

Auto-promotion must be configurable and reversible.

---

# 10. Preset-Neutral NPC Psychology Spine

The Psychology Spine exists to produce causal, differentiated choices. It is not a clinical diagnosis.

```typescript
type NPCAgencyProfile = {
  identity: {
    role: string | null;
    socialPosition: string | null;
    occupation: string | null;
    affiliationIds: string[];
    materialCircumstances: string[];
  };

  motivation: {
    wants: Motive[];
    avoids: Motive[];
    currentGoals: Goal[];
    obligations: Obligation[];
    competingPriorities: string[];
  };

  causalSpine: {
    protectedSelfStory: string | null;
    recurringNeed: string | null;
    worldAssumptions: string[];
    threatMeanings: string[];
    learnedStrategies: string[];
    failureOrBreakPatterns: string[];
    formativeEvidence: string[];
  };

  values: {
    commitments: string[];
    moralLimits: string[];
    rationalizableHarms: string[];
    admiredQualities: string[];
    contemptTriggers: string[];
  };

  behaviour: {
    defaultStrategies: string[];
    stressStrategies: string[];
    socialStyle: string | null;
    initiative: 'passive' | 'reactive' | 'proactive';
    riskTolerance: 'low' | 'moderate' | 'high';
    empathy: 'low' | 'selective' | 'broad';
    uncertaintyTolerance: 'low' | 'moderate' | 'high';
  };

  attention: {
    notices: string[];
    underweights: string[];
    peopleOfInterest: string[];
    opportunitySignals: string[];
  };

  capacity: {
    resources: string[];
    skills: string[];
    vulnerabilities: string[];
    currentPressures: string[];
  };

  fields: Record<string, ProfileField<unknown>>;
};
```

## 10.1 Motive

```typescript
type Motive = {
  id: string;
  description: string;
  strength: 'weak' | 'moderate' | 'strong' | 'dominant';
  horizon: 'immediate' | 'short_term' | 'long_term';
  targetIds: string[];
  source: Provenance;
};
```

## 10.2 Goal

```typescript
type Goal = {
  id: string;
  description: string;
  status: 'dormant' | 'active' | 'blocked' | 'achieved' | 'abandoned';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  successConditions: string[];
  failureConditions: string[];
  deadlineAtMinute: number | null;
  source: Provenance;
};
```

## 10.3 Profile fields and locks

```typescript
type ProfileField<T> = {
  value: T;
  confidence: number;
  status: 'explicit' | 'inferred' | 'provisional' | 'contested';
  lockedByUser: boolean;
  evidenceIds: string[];
  provenance: Provenance;
};
```

## 10.4 Baseline versus current condition

The profile describes the stable person. Current state is stored separately.

```text
Baseline:
Proactive, strength-oriented recruiter who tests people before trusting them.

Current condition:
Injured, under investigation, short on money, and urgently missing two recruits.
```

Decisions use both. Temporary pressure must not silently rewrite the baseline.

---

# 11. NPC Agency Decision Pipeline

For each triggered NPC, the Agency Processor runs this sequence.

## 11.1 KNOW

What information does this NPC actually possess?

Separate:

- Witnessed facts
- Reports from others
- Beliefs
- Suspicions
- False information
- Unknowns

An NPC cannot act on private conversation content they never learned.

## 11.2 INTERPRET

What does the event mean to this specific NPC?

The same event may be interpreted as:

- Criminal intimidation
- Useful courage
- Recklessness
- Justified resistance
- A business opportunity
- A threat to public order
- Someone else’s problem

The Agency Engine must not substitute objective truth for the NPC’s limited interpretation.

## 11.3 STAKE

Which of the following was activated?

- Goal
- Fear
- Value
- Obligation
- Relationship
- Status concern
- Resource need
- Opportunity
- Self-story

If no meaningful stake is touched, the default result should usually be observation, memory, avoidance, or inaction.

## 11.4 OPTIONS

Generate a diverse candidate set from physically and socially available actions.

The candidate set must consider:

- Act directly
- Act indirectly
- Delay
- Observe
- Delegate
- Seek more information
- Warn someone
- Exploit
- Assist
- Avoid
- Leave
- Change future behaviour
- Do nothing

Do not generate only plot-escalating candidates.

## 11.5 COST

For each candidate, estimate:

- Personal danger
- Social exposure
- Time
- Money or resources
- Moral resistance
- Reputation risk
- Opportunity cost
- Uncertainty
- Harm to valued relationships

## 11.6 FIT

Does the action match:

- Established strategies
- Protected self-story
- Risk tolerance
- Initiative
- Moral range
- Current condition
- Prior decision history

## 11.7 THRESHOLD

Is the motive strong enough to act now?

An NPC may care but still:

- Wait for privacy
- Seek confirmation
- Delegate
- Store the information
- Abandon the idea
- Fail to act due to fear or competing priorities

## 11.8 COMMIT

Choose one of:

- `act`
- `schedule`
- `observe`
- `delay`
- `delegate`
- `abandon`
- `do_nothing`

The decision becomes an `NPCActionNode` or a no-action record.

---

# 12. Candidate Actions and Selection

```typescript
type CandidateAction = {
  id: string;
  action: string;
  targetIds: string[];
  expectedBenefit: string;
  activatedMotiveIds: string[];
  personalCost: string;
  risk: 'low' | 'moderate' | 'high' | 'extreme';
  moralResistance: 'none' | 'low' | 'moderate' | 'high' | 'absolute';
  opportunityAvailable: boolean;
  resourceRequirements: string[];
  profileFit: 'invalid' | 'weak' | 'moderate' | 'strong';
  rejectionReason: string | null;
};
```

## 12.1 Heuristic selection model

The sidecar need not perform literal arithmetic, but its prompt should reason as though:

```text
Action viability =
  goal benefit
+ value alignment
+ self-story alignment
+ emotional or situational pressure
+ relationship motive
+ opportunity
- personal risk
- resource cost
- moral resistance
- uncertainty
- competing priorities
```

## 12.2 Controlled variation

When two or three candidates are similarly valid, LWE may select among them using seeded variation.

Suggested seed:

```text
chatId + npcId + worldRevision + stimulusEventId
```

Randomness may choose only among psychologically and practically valid actions. It may not rescue an invalid action merely for drama.

## 12.3 Decision trace

```typescript
type AgencyDecisionTrace = {
  npcId: string;
  stimulusEventIds: string[];
  knownFacts: string[];
  subjectiveRead: string;
  uncertainties: string[];
  activatedMotiveIds: string[];
  candidates: CandidateAction[];
  selectedCandidateId: string | null;
  outcome: 'act' | 'schedule' | 'observe' | 'delay'
         | 'delegate' | 'abandon' | 'do_nothing';
  reason: string;
  confidence: number;
};
```

Decision traces are hidden simulation data. They appear only in Debug or the NPC Inspector and are not injected into the main prompt.

---

# 13. Trigger Routing and Simulation Scope

The Agency Engine must not evaluate every NPC every turn.

An NPC is eligible when at least one trigger fires:

- They learned a new fact
- A fact they believe changed
- One of their goals was helped, blocked, or threatened
- A deadline arrived
- Travel completed
- A required resource became available or unavailable
- A relevant person entered their accessible area
- A faction issued an order
- An existing plan’s condition became true
- A relationship event crossed their attention threshold
- Current pressure materially changed

## 13.1 Relevance index

Maintain indexes such as:

```text
entity → active goal targets
entity → watchers and interested parties
location → occupants and approaching entities
event tag → subscribed motives or obligations
secret → knowers, suspects, and evidence holders
faction → members and command routes
```

These indexes let LWE route stimuli without scanning the full graph.

## 13.2 Tick policy by tier

| Tier | Evaluation policy |
|---|---|
| Extra | Never independently evaluated |
| Stranger | Only on direct exposure or immediate opportunity |
| Minor | Event-triggered and player-adjacent schedules |
| Major | Event-triggered, scheduled, and limited periodic goal review |

No NPC should generate activity simply because a turn occurred.

---

# 14. NPC Action Lifecycle

```typescript
type NPCActionNode = {
  id: string;
  actorId: string;
  action: string;
  targetIds: string[];

  status:
    | 'considered'
    | 'intended'
    | 'scheduled'
    | 'in_progress'
    | 'committed'
    | 'interrupted'
    | 'completed'
    | 'abandoned'
    | 'cancelled';

  motiveIds: string[];
  sourceEventIds: string[];

  requirements: {
    knowledge: string[];
    opportunity: string[];
    resources: string[];
  };

  schedule: Schedule | null;
  locationId: string | null;
  visibility: 'hidden' | 'observable' | 'known';
  interruptionReason: string | null;
  decisionTraceId: string | null;
  provenance: Provenance;
};
```

## 14.1 Meaning of states

- `considered`: Candidate only; usually not persisted outside debug.
- `intended`: NPC has chosen it but has not secured time or opportunity.
- `scheduled`: Conditions or due time are defined.
- `in_progress`: The action has begun and may be interrupted.
- `committed`: It already happened offscreen or cannot reasonably be undone before the current scene.
- `completed`: Outcome was established in canon.
- `interrupted`: Another event prevented completion.
- `abandoned`: NPC voluntarily gave it up.
- `cancelled`: User or system explicitly removed it.

## 14.2 Causal history

LWE must preserve chains such as:

```text
witnessed threat
→ considered reporting and recruiting
→ chose observation
→ followed Ken
→ reached shop
→ attempted contact
→ Ken escaped
→ plan interrupted
→ revised goal to identify his lodging
```

This history makes later consequences explainable and debuggable.

---

# 15. Canonical Data Model

## 15.1 Provenance

```typescript
type Provenance = {
  source:
    | 'user'
    | 'character_card'
    | 'lore'
    | 'conversation'
    | 'profile_builder'
    | 'state_extractor'
    | 'agency_processor'
    | 'manual_edit'
    | 'migration';
  sourceId?: string;
  confidence: number;
  evidenceIds: string[];
  createdAtWorldMinute: number;
  updatedAtWorldMinute: number;
};
```

## 15.2 WorldGraph

```typescript
type WorldGraph = {
  schemaVersion: 3;
  chatId: string;
  revision: number;

  clock: WorldClock;
  scene: SceneState;

  entities: Record<string, EntityNode>;
  locations: Record<string, LocationNode>;
  factions: Record<string, FactionNode>;
  relationships: Record<string, RelationshipEdge>;
  knowledge: Record<string, KnowledgeRecord>;
  secrets: Record<string, SecretNode>;
  agendas: Record<string, AgendaNode>;
  actions: Record<string, NPCActionNode>;
  events: Record<string, WorldEvent>;
  hooks: Record<string, HookNode>;
  threads: Record<string, NarrativeThreadNode>;

  decisionTraces: Record<string, AgencyDecisionTrace>;
  appliedPatchIds: string[];

  meta: {
    operationMode: 'full_agency' | 'observe_only' | 'manual';
    lastCommittedMessageId: string | null;
    lastGenerationId: string | null;
    lastAgencyRunAt: number | null;
    lastExtractionRunAt: number | null;
  };
};
```

## 15.3 World clock

```typescript
type WorldClock = {
  minute: number;
  display: string;
  lastExplicitCue: string | null;
  confidence: number;
};

type Schedule = {
  dueAtMinute: number | null;
  conditions: string[];
  recurrence: string | null;
};
```

Use one monotonic in-world minute counter for schedules. Do not mix turn counts with minute countdowns.

## 15.4 Scene state

```typescript
type SceneState = {
  locationId: string | null;
  presentEntityIds: string[];
  nearbyEntityIds: string[];
  timeLabel: string | null;
  environment: string[];
  exits: string[];
  activeActionIds: string[];
  lastChangedAtMinute: number;
};
```

## 15.5 Entity node

```typescript
type EntityNode = {
  id: string;
  kind: 'player' | 'card_character' | 'npc' | 'faction_agent' | 'object';
  name: string;
  aliases: string[];
  tier: 'major' | 'minor' | 'stranger' | 'extra';
  simulationMode: 'auto' | 'observe_only' | 'manual' | 'frozen';

  agencyProfile: NPCAgencyProfile | null;

  physical: {
    locationId: string | null;
    position: string | null;
    attire: string | null;
    injuries: string[];
    heldObjectIds: string[];
    visibleState: string | null;
  };

  current: {
    pressures: string[];
    emotionalOrBehaviouralState: string | null;
    activeGoalIds: string[];
    activeAgendaIds: string[];
    activeActionIds: string[];
  };

  factionIds: string[];
  relationshipEdgeIds: string[];
  knowledgeRecordIds: string[];
  secretIds: string[];

  lastSeenAtMinute: number | null;
  lastSeenLocationId: string | null;
  archived: boolean;
};
```

## 15.6 Relationship edge

Relationships are directed. A→B may differ from B→A.

```typescript
type RelationshipEdge = {
  id: string;
  fromId: string;
  toId: string;

  stance: string | null;
  durableFacets: Record<string, FacetValue>;
  currentFacets: Record<string, FacetValue>;

  boundaries: string[];
  obligations: string[];
  unresolvedEvents: string[];
  sharedHistoryEventIds: string[];

  provenance: Provenance;
};

type FacetValue = {
  value: string | number | boolean;
  confidence: number;
  evidenceIds: string[];
};
```

LWE does not require one universal numeric affinity score. UI summaries may derive labels from available evidence.

## 15.7 Knowledge record

```typescript
type KnowledgeRecord = {
  id: string;
  holderId: string;
  subjectId: string | null;
  proposition: string;
  status: 'knows' | 'believes' | 'suspects' | 'misinformed' | 'forgotten';
  sourceEntityId: string | null;
  sourceEventId: string | null;
  confidence: number;
  acquiredAtMinute: number;
  visibility: 'private' | 'shared' | 'public';
};
```

## 15.8 Agenda node

```typescript
type AgendaNode = {
  id: string;
  ownerId: string;
  goalId: string | null;
  description: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  status: 'dormant' | 'active' | 'blocked' | 'completed' | 'abandoned';
  nextActionId: string | null;
  blockers: string[];
  schedule: Schedule | null;
  provenance: Provenance;
};
```

## 15.9 World event

```typescript
type WorldEvent = {
  id: string;
  type: string;
  summary: string;
  actorIds: string[];
  targetIds: string[];
  locationId: string | null;
  occurredAtMinute: number;
  visibility: 'hidden' | 'witnessed' | 'public';
  witnessIds: string[];
  causedByEventIds: string[];
  causedActionIds: string[];
  tags: string[];
  provenance: Provenance;
};
```

## 15.10 Secret and evidence

```typescript
type SecretNode = {
  id: string;
  content: string;
  ownerIds: string[];
  knowerIds: string[];
  suspectIds: string[];
  evidenceIds: string[];
  coverStory: string | null;
  exposureRisk: 'low' | 'moderate' | 'high' | 'critical';
  status: 'hidden' | 'strained' | 'partially_exposed' | 'exposed' | 'resolved';
  provenance: Provenance;
};
```

## 15.11 Hook and narrative thread

These are optional planning aids, not requirements imposed on the main model.

```typescript
type HookNode = {
  id: string;
  label: string;
  plantedAtMinute: number;
  conditions: string[];
  status: 'dormant' | 'ripening' | 'ripe' | 'fired' | 'stale';
  relatedEntityIds: string[];
  relatedEventIds: string[];
  provenance: Provenance;
};

type NarrativeThreadNode = {
  id: string;
  name: string;
  participantIds: string[];
  pressure: string;
  status: 'dormant' | 'active' | 'escalating' | 'resolved' | 'abandoned';
  relatedGoalIds: string[];
  relatedHookIds: string[];
  provenance: Provenance;
};
```

---

# 16. Versioned Patch Contract

Every sidecar task that mutates the graph normalizes to a strict patch.

```typescript
type CanonicalPatchV1 = {
  schema: 'lwe.patch.v1';
  patchId: string;
  chatId: string;
  messageId: string | null;
  generationId: string | null;
  sourceTask:
    | 'card_profile_builder'
    | 'profile_evidence_updater'
    | 'state_extractor'
    | 'time_inference'
    | 'agency_processor'
    | 'manual_edit'
    | 'migration';

  expectedRevision: number;
  elapsedMinutes?: number;
  explicitTimeCue?: string;

  sceneUpdate?: Partial<SceneState>;
  entityCreates?: EntityNode[];
  entityUpdates?: EntityPatch[];
  profileUpdates?: ProfilePatch[];
  relationshipUpdates?: RelationshipPatch[];
  knowledgeUpdates?: KnowledgePatch[];
  secretUpdates?: SecretPatch[];
  agendaUpdates?: AgendaPatch[];
  actionUpdates?: ActionPatch[];
  eventCreates?: WorldEvent[];
  hookUpdates?: HookPatch[];
  threadUpdates?: ThreadPatch[];

  warnings?: string[];
};
```

## 16.1 Validation rules

- Reject unknown schema versions.
- Reject malformed JSON.
- Reject patches targeting another chat.
- Reject stale `expectedRevision` unless explicitly rebased.
- Reject updates to missing entities unless the patch also creates them.
- Reject repeated `patchId` values.
- Reject hidden psychological facts from the State Extractor without textual evidence.
- Reject completion of an action when the prose established only an attempt.
- Reject time advancement unsupported by an explicit cue or approved inference.
- Preserve higher-authority locked fields.
- Store uncertainty rather than forcing a false resolution.

## 16.2 Transactional application

1. Clone the current graph in memory.
2. Validate all references.
3. Apply the full patch to the clone.
4. Run invariant checks.
5. Increment revision.
6. Persist atomically.
7. Append event/archive records.
8. Publish UI update.

A partial patch must never leave the persistent graph half-mutated.

---

# 17. `LWE_SCENE_IMPACT` Contract

LWE injects one compact, preset-neutral system message.

```yaml
[LWE_SCENE_IMPACT v1]
time:
  display: Day 4, 14:25
  elapsed_since_last_turn: 10 minutes

scene:
  location: merchant_shop

committed_facts:
  - Dena reached the street outside before Ken entered.
  - The merchant locked the rear exit several minutes ago.

observable_or_incoming_actions:
  - actor: city_guard
    action: approaching the shop from the eastern market
    state: in_progress
    expected_arrival: approximately 2 minutes

  - actor: Dena
    action: watching the shop entrance from across the street
    state: in_progress

active_intentions:
  - actor: Dena
    intent: assess whether Ken is useful and controllable
    constraints:
      - does not want the city watch to detain him first
      - will not risk guild personnel without a test

knowledge_limits:
  - Dena does not know why Ken entered the shop.
  - The guard knows only that a public threat was reported.

integration_rules:
  - Preserve committed facts.
  - Resolve in-progress actions alongside the user's latest action.
  - Treat intentions as guidance, not guaranteed outcomes.
  - Do not reveal hidden information unless it becomes observable.
[/LWE_SCENE_IMPACT]
```

## 17.1 Certainty classes

### Committed facts

Already occurred. The main LLM must preserve them unless it explicitly establishes that a report was false or the fact was misidentified.

### Actions in progress

Currently underway and interruptible.

### Active intentions

Chosen plans or motives. They influence behaviour but do not guarantee execution.

### Knowledge limits

Prevent accidental omniscience and distinguish what each actor can use in the current scene.

## 17.2 Relevance rules

Inject only information that can affect the current response through:

- Current location
- Present or arriving entity
- Immediate deadline
- Message or event reaching the scene
- Active relationship collision
- Environmental change
- Knowledge necessary to portray an incoming NPC consistently

Do not inject:

- Candidate lists
- Rejected actions
- Full decision traces
- Unrelated offscreen activity
- Full NPC profiles
- Old events already represented in conversation history

## 17.3 Token budget

Recommended defaults:

- Typical: 120–250 tokens
- Complex scene: up to 400 tokens
- Hard ceiling configurable by user

Priority when over budget:

1. Committed scene-changing facts
2. Actions entering the scene
3. Physical and timing constraints
4. Relevant intention and knowledge limits
5. Environmental changes
6. Drop distant background developments

---

# 18. Main LLM Integration Contract

LWE makes no assumption about the active preset. The main generation may be a simple prose prompt, a structured roleplay preset, or no custom preset.

The main LLM should be instructed only through `integration_rules` to:

- Combine the user’s latest message with incoming LWE developments
- Preserve already committed facts
- Resolve simultaneous or competing actions
- Allow user actions to interrupt plans in progress
- Avoid exposing hidden intention as narration unless the scene supports it
- Write one coherent continuation rather than listing world updates

The main LLM is not required to emit JSON, a ledger, or an LWE-specific block.

---

# 19. Worked Example: Merchant Incident

## 19.1 Extracted event

```text
Ken threatened Merchant Arlo in public.
Six people witnessed it.
Arlo backed down.
No guard was present.
```

The extractor records only these grounded facts.

## 19.2 Witness profiles

### Dena, guild recruiter

```text
Goal: Find capable recruits.
Self-story: She recognises competence before others do.
World assumption: Pressure reveals what people are.
Strategy: Observe, test, then offer conditional work.
Risk tolerance: High.
Current pressure: Two enforcers are unavailable.
```

### Pell, junior clerk

```text
Goal: Avoid another reprimand.
Self-story: Responsible citizen.
World assumption: Unreported disorder becomes chaos.
Strategy: Defer to formal authority.
Risk tolerance: Low.
Current pressure: Recently punished for overlooking an incident.
```

### Mara, exhausted worker

```text
Goal: Return home to a sick child.
Strategy: Avoid public conflict.
Risk tolerance: Very low.
Current pressure: Late, hungry, and short on money.
```

## 19.3 Agency decisions

```text
Dena:
Subjective read: Capable but possibly undisciplined.
Decision: Observe and arrange a low-risk test.

Pell:
Subjective read: Dangerous disorder that may become his responsibility.
Decision: Report after reaching safety.

Mara:
Subjective read: Trouble unrelated to her immediate obligations.
Decision: Leave, avoid the stall later, tell nobody unless asked.
```

The same event produces recruitment, reporting, and inaction because each witness has different stakes.

## 19.4 Later scene impact

When Ken enters Arlo’s shop:

```yaml
committed_facts:
  - Pell reported the incident to the city watch.
  - Dena identified the shop Ken entered.

actions_in_progress:
  - A guard is approaching the shop.
  - Dena is watching from across the street.

active_intentions:
  - Dena wants to test Ken before the guard reaches him.
```

The main LLM then resolves this alongside Ken’s latest action.

---

# 20. Time, Movement, and Opportunity

## 20.1 Time hierarchy

1. Explicit user cue: use exactly.
2. Explicit assistant prose from the committed prior turn: use if unambiguous.
3. Deterministic travel or task duration from world data: use range or configured value.
4. Sidecar inference: use only with a real narrative cue.
5. Ambiguous dialogue or emotional beat: zero by default.

## 20.2 Movement

Travel requires:

- Origin
- Destination
- Route or plausible access
- Duration or due time
- Interruption conditions

An arrival is promoted to committed only when sufficient time passes and no blocker intervenes.

## 20.3 Opportunity gate

An NPC action is viable only if the required combination exists:

```text
motivation
+ knowledge
+ opportunity
+ resources
+ sufficient time
- unacceptable cost
= viable action
```

Examples of blockers:

- Cannot leave work
- Does not know the target’s identity
- Lacks access to the location
- Fears exposing their own crime
- Cannot afford the resource
- A more urgent obligation dominates
- The intended witness is not present

---

# 21. Storage Architecture

## 21.1 Per-chat storage

```text
worlds/{chatId}/graph.json
worlds/{chatId}/events_archive.jsonl
worlds/{chatId}/decision_archive.jsonl
worlds/{chatId}/rebuild_checkpoint.json
```

## 21.2 User-scoped storage

```text
settings.json
prompt_profiles/*.json
profile_templates/*.json
npc_library/{slug}.json
schema_migrations/*.json
```

The optional NPC library stores reusable seeds, not live cross-chat state, unless the user explicitly exports or links a character.

## 21.3 Chat variables

Direct interceptor injection is the primary path. Chat variables may expose compact status values to macros or UI, for example:

```text
lwe_enabled
lwe_world_revision
lwe_scene_summary
```

No prompt block is required for normal operation.

## 21.4 World Books

Core LWE does not require World Books. Optional synchronization may later create concise NPC entries for compatibility with other systems, but the WorldGraph remains authoritative.

---

# 22. Generation Lifecycle and Commit Guard

## 22.1 Generation type

The interceptor context contains generation metadata including `generationType`. Capture it before the main request.

`GENERATION_ENDED` should not be assumed to carry the same field. Bind lifecycle records using chat and generation identifiers.

Recommended tracking:

1. Interceptor stores `{ chatId, generationType, timestamp, provisionalRevision }`.
2. Generation-start lifecycle binds a generation ID where available.
3. Generation-end lookup resolves the pending record.
4. Commit only allowed types.

## 22.2 Initial commit policy

| Generation type | Commit? | Reason |
|---|---:|---|
| normal | yes | Canonical new assistant turn |
| continue | no by default | Requires span-aware continuation support |
| regenerate | no | Alternate candidate |
| swipe | no | Alternate candidate |
| impersonate | no | Not a canonical assistant world turn |
| quiet/internal | no | Sidecar or internal generation |

## 22.3 Per-chat serialization

```text
chat A: interceptor → main generation → extraction → commit
chat B: interceptor → main generation → extraction → commit
```

Different chats may run concurrently. The same chat must use a serialized queue or revision-checked commit barrier.

## 22.4 Failure policy

### Pre-turn Agency Engine failure

- Log warning
- Preserve existing graph
- Advance only deterministic schedules already validated
- Inject current known scene state without speculative new actions
- Continue main generation

### State Extractor failure

- Store unresolved extraction job
- Do not apply speculative patch
- Mark orb warning badge
- Allow user to retry extraction from Debug/Data UI

### Storage failure

- Keep last valid in-memory copy only for the current operation
- Surface explicit error
- Do not claim the graph was committed

---

# 23. UI Architecture

The extension has three distinct surfaces.

## 23.1 Floating orb

Create with `ctx.ui.createFloatWidget()`.

The orb is a launcher and compact status indicator, not the tracker itself.

Suggested states:

- Neutral: LWE enabled
- Number badge: new offscreen developments
- Pulse: sidecar processing
- Amber: extraction warning or stale graph
- Red: commit or schema failure
- Paused icon: Observe-Only, Manual, or globally disabled

Clicking opens or focuses the right Tracker Dock.

## 23.2 Right Tracker Dock

Create using `ctx.ui.requestDockPanel({ edge: 'right' })`.

This is the complete tracker interface.

### Overview

- Current time and location
- Present and approaching entities
- Incoming events
- Active warnings
- Recent world changes
- Simulation mode

### People

- Searchable NPC list
- Tier and simulation mode
- Location and last seen
- Active goals
- Current pressure
- Profile confidence

### Agency

- Active agendas
- Intended and scheduled actions
- Actions in progress
- Blocked actions
- Recently completed, interrupted, or abandoned plans
- Opportunity and deadline indicators

### Relationships

- Directed pair edges
- Stance and supported facets
- Obligations and unresolved events
- Knowledge asymmetry
- Evidence history

### World

- Locations and occupants
- Factions and active operations
- Secrets and evidence
- Hooks and narrative threads
- Objects and resources

### Timeline

- Chronological world events
- Causal links
- Information transfers
- Travel and arrivals
- Filter by entity, location, type, or visibility

### Inspector

For a selected NPC:

- Psychology Spine
- Card-derived versus inferred fields
- Current goals and blockers
- Knowledge and misconceptions
- Resources and vulnerabilities
- Active plans
- Decision history
- Provenance and confidence
- Manual edit and lock controls

### Decision Trace — debug or advanced view

```text
Stimulus
→ Known facts
→ Subjective interpretation
→ Activated stakes
→ Candidate actions
→ Rejected candidates
→ Selected action
→ Opportunity gate
→ Result
```

## 23.3 Lumiverse drawer tab

Register separately with `ctx.ui.registerDrawerTab()`.

This contains settings and diagnostics, not the tracker.

### General

- Enable LWE
- Operation mode: Full Agency / Observe-Only / Manual
- Injection token budget
- Auto-promotion rules
- Archive and event retention
- Time policy

### Simulation

- Maximum NPC evaluations per turn
- Tier tick policy
- Post-turn preplanning
- Seeded variation
- Relationship inference policy
- Secret and faction simulation toggles

### Sidecar

- Connection selection
- Model override where supported
- Task-specific temperatures and token limits
- Fallback policy
- Connection test
- Latency and token statistics

### Prompts

Editable versioned profiles for:

- Character Card Profile Builder
- Profile Evidence Updater
- State Extractor
- Time Inference
- NPC Agency Processor
- Optional Scene Impact Compressor

Each editor includes:

- Restore default
- Validate placeholders
- Dry run
- Compare version
- Import/export
- Save as profile

### Debug

- Last interceptor input
- Last `LWE_SCENE_IMPACT`
- Last raw sidecar outputs
- Validation warnings
- Generation lifecycle record
- Patch and revision IDs
- Sidecar timing and token usage
- Pending extraction jobs

### Data

- Export WorldGraph
- Import with validation
- Rebuild from conversation
- Rebuild selected NPC from card
- Reset current chat
- Clear archives
- Migration report

### About

- Extension version
- Schema version
- Permission explanations
- Documentation and repository links

## 23.4 UI resilience

- The Tracker must remain usable when the right dock becomes a mobile bottom sheet.
- The Settings drawer must remain available if `ui_panels` permission is denied.
- LWE must reopen cleanly after the user hides or resets extension panels.
- Do not use browser `localStorage` or `sessionStorage` for persistent settings.

---

# 24. Settings Schema

```typescript
type LWESettings = {
  enabled: boolean;
  operationMode: 'full_agency' | 'observe_only' | 'manual';

  sidecar: {
    connectionId: string | null;
    modelOverride: string | null;
    allowMainConnectionFallback: boolean;
    timeoutMs: number;
  };

  injection: {
    tokenBudget: number;
    includeIntentions: boolean;
    includeKnowledgeLimits: boolean;
    maxIncomingActions: number;
  };

  time: {
    explicitOnly: boolean;
    allowTravelEstimates: boolean;
    dialogueMinutesPerTurn: number | null;
  };

  agency: {
    enabled: boolean;
    maxNpcEvaluationsPerTurn: number;
    allowPostTurnPreplanning: boolean;
    seededVariation: boolean;
    periodicMajorReviewMinutes: number | null;
  };

  profiles: {
    autoBuildCardCharacters: boolean;
    autoBuildRecurringNpcs: boolean;
    autoPromoteStrangerTurns: number | null;
    protectExplicitCardFields: boolean;
  };

  tasks: {
    profileBuilder: TaskSettings;
    profileUpdater: TaskSettings;
    stateExtractor: TaskSettings;
    timeInference: TaskSettings;
    agencyProcessor: TaskSettings;
    impactCompressor: TaskSettings;
  };

  ui: {
    dockDefaultTab: 'overview' | 'people' | 'agency'
      | 'relationships' | 'world' | 'timeline' | 'inspector';
    showOrbBadge: boolean;
    showHiddenState: boolean;
    showDecisionTrace: boolean;
  };

  debug: {
    enabled: boolean;
    retainRawSidecarResponses: boolean;
    logInterceptorPayloads: boolean;
    retainDecisionTraces: boolean;
  };
};

type TaskSettings = {
  promptProfileId: string;
  temperature: number;
  maxTokens: number;
  enabled: boolean;
};
```

## 24.1 Recommended defaults

```typescript
const defaults: LWESettings = {
  enabled: true,
  operationMode: 'full_agency',

  sidecar: {
    connectionId: null,
    modelOverride: null,
    allowMainConnectionFallback: false,
    timeoutMs: 12000
  },

  injection: {
    tokenBudget: 250,
    includeIntentions: true,
    includeKnowledgeLimits: true,
    maxIncomingActions: 4
  },

  time: {
    explicitOnly: true,
    allowTravelEstimates: true,
    dialogueMinutesPerTurn: null
  },

  agency: {
    enabled: true,
    maxNpcEvaluationsPerTurn: 6,
    allowPostTurnPreplanning: true,
    seededVariation: true,
    periodicMajorReviewMinutes: null
  },

  profiles: {
    autoBuildCardCharacters: true,
    autoBuildRecurringNpcs: true,
    autoPromoteStrangerTurns: 3,
    protectExplicitCardFields: true
  },

  ui: {
    dockDefaultTab: 'overview',
    showOrbBadge: true,
    showHiddenState: true,
    showDecisionTrace: false
  },

  debug: {
    enabled: false,
    retainRawSidecarResponses: false,
    logInterceptorPayloads: false,
    retainDecisionTraces: false
  }
};
```

---

# 25. Prompt Contracts

Prompts are implementation assets, not part of the main roleplay prompt.

## 25.1 Profile Builder principles

```text
Build a stable causal profile only from supplied evidence.
Distinguish explicit facts from inference.
Do not invent trauma to create depth.
Do not treat example dialogue as timeline history.
Prefer a small coherent profile over many decorative traits.
Return provenance, confidence, contradictions, and unresolved fields.
```

## 25.2 Agency Processor principles

```text
Act through the NPC's limited knowledge and subjective interpretation.
Identify the goal, fear, value, obligation, relationship, or opportunity touched.
Generate multiple viable actions, including delay and doing nothing.
Reject actions blocked by knowledge, access, resources, time, risk, or moral limits.
Do not choose the most dramatic, kind, hostile, or plot-convenient action by default.
Preserve established strategies and current priorities.
Return a structured decision, not prose.
```

## 25.3 State Extractor principles

```text
Extract only changes grounded in the user and assistant messages.
Separate attempt, interruption, and completed outcome.
Do not infer durable psychology from one beat.
Do not convert dialogue claims into objective truth.
Do not advance time without a cue.
When uncertain, emit a warning and omit the field.
```

## 25.4 Time Inference principles

```text
Prefer zero to unsupported drift.
Use explicit durations exactly.
Estimate only when travel or task duration is clearly implied.
Return cue, confidence, and source.
```

---

# 26. Cold Start and Rebuild

## 26.1 New chat

1. Resolve chat and card.
2. Create WorldGraph revision 1.
3. Create the card-backed entity.
4. Run Profile Builder if enabled.
5. Seed only explicit scene facts available from card, scenario, and first message.
6. Create no arbitrary relationships or secrets.
7. Keep the Tracker closed until the user opens it from the orb.

## 26.2 Existing chat without a graph

1. Read the card and recent committed history.
2. Extract entities, locations, and major events in bounded batches.
3. Build card-backed profiles first.
4. Create provisional profiles only for recurring NPCs.
5. Reconcile contradictions with confidence and provenance.
6. Present a rebuild report before marking uncertain hidden state as canonical.

## 26.3 Rebuild limits

A rebuild cannot perfectly recover facts never stated in conversation. Unknown hidden motives should remain unknown rather than being retroactively invented.

---

# 27. Performance and Cost Controls

- Trigger-route NPCs instead of evaluating the whole cast.
- Cache card-derived profiles.
- Use deterministic code for schedules, relevance, and patch validation.
- Batch multiple low-tier witnesses in one agency call when their inputs are small.
- Give Major NPCs separate calls only when necessary.
- Preplan low-urgency actions after the prior turn.
- Cap candidate counts.
- Archive old decision traces.
- Inject summaries, not full profiles.
- Skip the Agency Engine when no meaningful trigger exists.
- Allow users to set maximum sidecar calls per turn.

Suggested typical turn:

```text
0 calls: no trigger; inject existing relevant state
1 call: Agency Processor or State Extractor only
2 calls: Agency Processor + State Extractor
3 calls: uncommon; add Time Inference or Profile Builder
```

Profile building is episodic, not per-turn.

---

# 28. Critical Reliability Rules

- Never require a particular preset.
- Never require structured output from the main LLM.
- Never treat the sidecar as a second narrator.
- Never ask the Agency Engine “what would be dramatic next?” without profiles and constraints.
- Never let every witness become an active plot agent.
- Never omit `do_nothing`, `delay`, or `observe` from candidate consideration.
- Never give an NPC knowledge they did not obtain.
- Never commit an intention as a completed action.
- Never force an in-progress action to succeed against the user’s newest move.
- Never allow temporary state to silently replace a stable profile.
- Never overwrite user-locked or explicit card facts with weaker inference.
- Never invent trauma merely to justify behaviour.
- Never treat example dialogue as historical canon.
- Never auto-advance ambiguous dialogue time.
- Never mix turn countdowns and world minutes.
- Never commit swipe, regenerate, quiet, or impersonate output.
- Never apply the same patch twice.
- Never start a same-chat turn against a half-committed graph.
- Never silently accept malformed sidecar JSON.
- Never use browser local storage for persistent extension state.
- Never block main roleplay generation solely because a sidecar failed.

---

# 29. Migration from v1.3

| v1.3 concept | v1.4 action |
|---|---|
| Named-preset audit and adapter sections | Removed entirely |
| Preset detection and adapter selection | Removed from core and settings |
| Mirror versus authoritative preset modes | Replaced with Full Agency, Observe-Only, and Manual |
| Generic mode as a fallback | Replaced by universal standalone operation |
| LWE does not own psychological interpretation | Revised: LWE owns offscreen NPC subjective appraisal for agency decisions |
| Generic post-turn extractor only | Expanded into Profile Builder, Agency Processor, and State Extractor |
| Vague World Processor | Replaced with explicit NPC Agency decision pipeline |
| Generic goals/fears/convictions only | Replaced with causal Psychology Spine |
| No card-processing contract | Added primary character-card and lore intake |
| Objective-only injection | Replaced with typed committed facts, in-progress actions, intentions, and knowledge limits |
| Main preset “generates normally” | Replaced with explicit scene-collision and integration contract |
| Adapter namespaces in core graph | Removed |
| Adapter ID in patch contract | Removed; patches now identify sidecar task |
| Relationship schema optimized for adapters | Simplified to preset-neutral directed evidence-backed facets |
| Social simulation ownership conflict | Eliminated by treating the main model as scene renderer and LWE as persistent agency layer |
| Tracker lacks full agency inspection | Added Agency tab, Psychology Spine, and Decision Trace |

---

# 30. Implementation Order

## Phase 1 — Foundation

- Implement manifest and permissions.
- Implement WorldGraph schema v3.
- Implement storage, migrations, per-chat queue, and idempotent patch engine.
- Implement floating orb, right Tracker Dock, and Settings drawer.
- Implement direct interceptor injection with static scene facts.

## Phase 2 — Canon extraction

- Implement generation lifecycle guard.
- Implement State Extractor and patch validation.
- Implement timeline, entities, locations, and event history.
- Implement rebuild from bounded conversation history.

## Phase 3 — Character intake

- Implement card and lore loading.
- Implement Profile Builder.
- Implement provenance, confidence, contradictions, and field locks.
- Implement NPC tiers and promotion controls.

## Phase 4 — Agency Engine

- Implement trigger routing.
- Implement candidate generation and selection.
- Implement knowledge, cost, opportunity, and resource gates.
- Implement agenda and action lifecycles.
- Implement seeded variation and decision traces.

## Phase 5 — Scene-impact integration

- Implement relevance selection.
- Implement `LWE_SCENE_IMPACT v1` composer.
- Test committed facts versus in-progress actions versus intentions.
- Add token-budget compression.

## Phase 6 — Advanced world systems

- Factions and command routes
- Rumour and information propagation
- Secrets and evidence
- Hooks and narrative threads
- Optional reusable NPC library
- Optional World Book synchronization

---

# 31. Acceptance Tests

## 31.1 Preset independence

1. LWE works with a simple prose prompt and no custom preset.
2. Switching presets does not require graph migration or adapter changes.
3. Main output contains no LWE ledger or JSON requirement.

## 31.2 Character fidelity

4. A card-explicit cautious recruiter remains cautious after one impulsive event.
5. Example dialogue affects style inference but is not stored as history.
6. A new shopkeeper receives a provisional compact profile, not fabricated childhood trauma.
7. User-locked fields survive rebuilds and sidecar calls.

## 31.3 Agency diversity

8. Three witnesses to one event plausibly choose report, recruit, and ignore.
9. `do_nothing` can win when no meaningful stake is activated.
10. An NPC cannot report a private event they did not learn about.
11. A motivated action remains blocked when opportunity or resources are absent.
12. Seeded reprocessing of the same revision yields the same selected candidate.

## 31.4 Scene integration

13. A committed arrival remains true in the main response.
14. An intention is interruptible by the user’s latest action.
15. The main LLM weaves the impact package into prose rather than listing it.
16. Hidden motives are not exposed merely because LWE stores them.
17. Only scene-relevant world developments enter the prompt.

## 31.5 State extraction

18. An attempted punch is not recorded as a landed injury when the prose says it was blocked.
19. A lie spoken by an NPC is stored as a claim, not objective fact.
20. An interrupted LWE plan is marked interrupted rather than completed.
21. Ambiguous turns do not advance time.

## 31.6 Lifecycle and reliability

22. Swipe and regenerate outputs create no canonical graph revision.
23. Reprocessing one message does not duplicate events.
24. A rapid next turn reads the prior committed graph or a safe last-valid revision.
25. Sidecar failure allows main generation to proceed and surfaces a recoverable warning.
26. Malformed JSON is rejected without partial mutation.

## 31.7 UI

27. The floating orb opens the right Tracker Dock.
28. The Settings drawer remains separate from the Tracker.
29. The Tracker remains usable as a mobile bottom sheet.
30. Decision traces are hidden by default and visible when Debug is enabled.

---

# 32. Final Architecture Statement

LWE is a standalone NPC agency and continuity engine.

It reads authored character material, builds persistent causal profiles, tracks what each person knows, evaluates only the NPCs whose stakes or opportunities changed, and advances actions that can plausibly occur outside the current scene. It then sends the main LLM a small, typed package describing committed facts, incoming actions, relevant intentions, and knowledge limits.

The main LLM remains free to use any preset and any prose style. It combines that package with the user’s newest message, resolves the immediate collision, and writes the scene. LWE observes the result, records what became canon, and lets the rest of the world continue from there.

> **The world feels alive not because every NPC acts, but because every meaningful NPC can act for their own reasons—and the world remembers when they do.**

---

# 33. Official Lumiverse References

- Spindle Developer Guide: `https://docs.lumiverse.chat/`
- Manifest: `https://docs.lumiverse.chat/getting-started/manifest/`
- Permissions: `https://docs.lumiverse.chat/getting-started/permissions/`
- Interceptors: `https://docs.lumiverse.chat/backend-api/interceptors/`
- Generation: `https://docs.lumiverse.chat/backend-api/generation/`
- Characters: `https://docs.lumiverse.chat/backend-api/characters/`
- Chats: `https://docs.lumiverse.chat/backend-api/chats/`
- Variables: `https://docs.lumiverse.chat/backend-api/variables/`
- UI Placement: `https://docs.lumiverse.chat/frontend-api/ui-placement/`
