# LumiWorld Tracker Depth Design

**Goal:** Deepen the Phase 1 LumiWorld tracker so the `People` and `Relationships` views feel much closer to `LWE_DESIGN.md`, while keeping the working generation, hydration, and operator-scoped backend paths stable.

**Chosen scope:** `UI + MVP hardening` with `Tracker depth` as the primary target and `read-only` UI for this pass.

## Outcomes

- Expand the stored world model only where it directly improves read-only tracker depth.
- Rework the `People` view into expandable NPC detail cards with richer sections.
- Rework the `Relationships` view into readable directed audits instead of raw dumps.
- Remove the hardcoded light-theme styling so the drawer/widget sit naturally inside Lumiverse.
- Keep regen/swipe safety, hidden-block stripping, startup hydration, and operator-scoped backend handling intact.

## In Scope

- Richer `NPCNode` data for profile-like display:
  - aliases
  - visible physical state
  - emotional state
  - agenda and simple agenda queue presentation
  - goals, fears, convictions
  - self-knowledge and description
  - secrets and hooks/arcs display state
  - faction and role labels where available
- Richer `RelationshipEdge` presentation:
  - directed source/target labels
  - durable vs momentary axes
  - public-face and betrayal-scar visibility
  - boundary state display
  - knowledge buckets
  - qualifying-event audit trail
- Drawer UI improvements:
  - tier grouping
  - expandable detail sections
  - improved empty/loading states
  - host-friendly styling
- Widget cleanup:
  - visually subdued and theme-friendly
  - preserve its role as a quick summary entry point

## Out of Scope

- Manual override editing
- Sidecar processing and tick engine
- Log and map tabs
- Cross-chat NPC library
- Tokenizer-accurate digest budgeting
- Proving the exact Lumiverse minimum-version cutoff beyond the current safer floor

## Architecture

The backend event lifecycle remains the stable foundation. We will not change the generation commit semantics except where richer display data must be stored from already-parsed inputs. Model and parser work should remain additive and backwards-compatible with existing fixtures/tests.

The world model will move partway toward `LWE_DESIGN.md`, not all the way. The implementation should prefer optional fields and sensible defaults over a disruptive rewrite. The UI should consume those richer structures directly rather than inventing parallel presentation-only state.

The frontend should use neutral, inherited styling instead of a custom light palette. LumiWorld can keep hierarchy and spacing, but it should stop fighting the host shell.

## Testing

- Add tests for any world-model merge behavior that changes.
- Preserve existing parser and world-update tests.
- Add focused tests for richer relationship/NPC summary behavior where practical.
- Rebuild the extension bundles and run the full local test suite before calling the pass complete.
