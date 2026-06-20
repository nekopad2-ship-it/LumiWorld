# LumiWorld Tracker Depth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deepen LumiWorld's Phase 1 tracker UI and supporting world model while preserving the verified backend lifecycle and operator-scoped runtime fixes.

**Architecture:** Keep backend generation/hydration behavior stable, extend shared world types and merge logic only where the richer tracker needs more data, and rebuild the drawer/widget UI around denser read-only inspection. Styling should shift from hardcoded light colors to host-friendly neutral surfaces.

**Tech Stack:** TypeScript, Bun, Spindle backend/frontend APIs, existing local test suite

---

## File Structure

- Modify: `src/shared/types.ts`
  - Extend the tracked world model with optional richer NPC and relationship fields used by the read-only tracker.
- Modify: `src/shared/world.ts`
  - Preserve current world-merge semantics while filling richer structures and summaries.
- Modify: `src/frontend.ts`
  - Replace the shallow card list with a denser tracker UI and host-friendly styles.
- Modify: `tests/world-graph.test.ts`
  - Add coverage for richer world merge/display data.

### Task 1: Extend shared world types and world-merge behavior

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/shared/world.ts`
- Test: `tests/world-graph.test.ts`

- [ ] Add failing tests for richer NPC and relationship state that the tracker will display.
- [ ] Run the focused world-graph tests and verify the new expectations fail for the intended reason.
- [ ] Extend shared types with optional richer profile, relationship, and audit structures.
- [ ] Update world seeding and merge logic to populate those structures without changing the verified generation lifecycle behavior.
- [ ] Run the focused tests again, then the full test suite.

### Task 2: Rebuild the People and Relationships tracker views

**Files:**
- Modify: `src/frontend.ts`

- [ ] Review the current frontend rendering seams and keep message flow/widget lifecycle intact.
- [ ] Replace the flat People cards with grouped, expandable detail sections that reflect the richer world model.
- [ ] Replace the raw Relationships display with readable directed audits, axis groupings, and event context.
- [ ] Preserve empty states, hydrate behavior, widget toggling, and drawer activation flow.

### Task 3: Make the drawer and widget host-friendly

**Files:**
- Modify: `src/frontend.ts`

- [ ] Remove the hardcoded light-theme palette and replace it with neutral, inherited styling.
- [ ] Keep visual hierarchy through spacing, borders, and stateful accents rather than bright backgrounds.
- [ ] Simplify the widget so it reads as a Lumiverse-native quick pulse rather than a standalone light card.

### Task 4: Verification and gap review

**Files:**
- Modify as needed based on review feedback.

- [ ] Run `bun.cmd test`.
- [ ] Run `bun.cmd run build`.
- [ ] Review the resulting tracker/backend changes against the approved design scope.
- [ ] Document the remaining intentionally deferred Phase 1 gaps in the final handoff.
