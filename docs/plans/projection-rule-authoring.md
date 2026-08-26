# Projection Rule Authoring

## Status

Proposed. Fact-checked against the tree 2026-08-26.

An earlier revision of this plan proposed a `defineDerivation` wrapper over
`defineProjectionRule`, on the claim that three rules hand-rolled the same
gather-generate-reconcile loop at ~70% overlap. That claim was measured
wrong — from greps for `listEntities` / `ai.generate` / `operation: "upsert"`
appearing in all three, not from reading their bodies. Read properly, the five
derivations have five different generation loops:

| rule                          | AI calls                                     | targets                 | deletes         |
| ----------------------------- | -------------------------------------------- | ----------------------- | --------------- |
| `swot-derivation`             | 2, sequential (draft → refine → validate)    | 1, fixed id             | never           |
| `skill-derivation`            | 1                                            | N via `scopedDerivedId` | unmentioned     |
| `series-projection`           | 1 per group, skipped when content exists     | N                       | unmentioned     |
| `topic-extraction`            | N batched, weighted thresholds, mint ceiling | N                       | never           |
| conversation summary (paused) | per conversation                             | N                       | not yet decided |

A wrapper over that either grows config flags reproducing all five shapes or
forces the odd ones out. Generation is legitimately the package's job — it is
where the domain lives. This plan drops the wrapper.

What is worth changing is smaller and has a real failure mode behind it.

## What is already right

The `selectInput` / `derive` split is deliberate and stays. Input selection is
deterministic and hashable, which is what makes memoization and eval replay
(`runProjectionRule`) possible; derivation is expensive and nondeterministic.
The scheduler-only runtime shipped in `173b53092` owns waves, batching,
memoization, persistence and retry. None of that is reopened here.

## The defect

Whether a rule owns its whole target set is expressed today as "did the author
write a delete loop, and did they scope it correctly". Two of the four rules
write one, and they disagree:

- `entities/agent-discovery/src/lib/skill-projection.ts` selects its delete set
  with `options: { filter: { visibilityScope: targetVisibility } }` and deletes
  unmentioned skills within that scope.
- `entities/series/src/lib/series-projection.ts` selects with
  `listEntities({ entityType: "series" })` — unscoped — and deletes anything
  not in the derived set. A derivation running at one visibility can delete
  series belonging to another.

Same invariant, two implementations, one of them wrong. Both failure modes are
silent: forgetting the loop accumulates orphaned derived entities that look
real, and scoping it wrong deletes entities the rule never owned.

`swot-derivation` and `topic-extraction` deliberately never delete, but that
intent exists only as _absent code_ — indistinguishable from an author who
forgot.

## Decisions

- **Target authority becomes declared, and the runtime enforces it.** A rule
  states whether it is exclusive over its targets within a visibility scope.
  The runtime computes deletions; rules stop writing diff loops. Choosing
  becomes mandatory, so forgetting is no longer possible and "never deletes"
  becomes a statement rather than an omission.
- **Reconcile runs at apply time against live target state, not inside
  `derive`.** `projection-rule-job-handler.ts:286` replays cached
  `writeIntents` on a memo hit; deletions computed inside `derive` would be
  frozen into that memo, while the existing target set can drift independently
  of the input fingerprint. Computing them from current state at apply keeps
  the operation idempotent.
- **Context types get exported.** All four rules type their callbacks
  `Parameters<ProjectionRule["selectInput"]>[1]`. Naming those two types is the
  cheapest real improvement to rule authoring on offer.
- **The gather preamble stays duplicated.** ~15 lines per rule, varying by
  source type and prompt count. A helper for "call `listEntities` a few times
  in parallel" would name a thing without removing a decision.
- **No new `define*` export.** The change is one property on an existing
  exported interface plus two exported types.

## Public surface

This is in scope for the current API-boundaries work: `ProjectionRule` is
already published through `@rizom/brain/entities` (advanced tier), gains a
declared property, and two context types join it. The stable tier does not
move. Ledger and `docs/public-release/AUTHORING_API_0.2.md` follow, enforced by
`public-authoring-golden.test.ts`.

## Phases

Each phase is a shippable slice with its tests written first.

1. **Pin series' scoping bug, then fix it.** A test that derives series at one
   visibility while series exist at another, asserting the others survive.
   Fixed in place by scoping the existing-set selection the way skill already
   does — before any of it moves, so the runtime inherits correct behavior
   rather than a bug with a new home.

2. **Export the context types.** `ProjectionSelectContext` and
   `ProjectionDeriveContext` (names to settle against the contract) exported
   from `@brains/sdk/entities`, with the four rules' `Parameters<...>`
   annotations replaced. Ledger and authoring doc updated. Pure surface work,
   no behavior change, and it makes the next phase readable.

3. **Declared target authority, runtime-enforced.** The property on
   `ProjectionRule`, reconcile computed in the job handler from live target
   state before `applyRuleResult`, and the four rules declaring their intent.
   `skill` and `series` lose their diff loops; `swot` and `topics` say out loud
   that they do not delete. Their existing behavior tests are the gate.

4. **The projection runtime learns conversation sources.** Rule sources are
   entity-only (`shell/plugins/src/entity/projection-rule.ts:28`).
   Conversation-memory's evidence is conversations, so this is the capability
   slice: a `{ kind: "conversation" }` source whose change signal comes from
   the conversation service, batched by the scheduler like entity changes.
   Named consumer: phase 5.

5. **Conversation-memory declares its derivation.** A `defineProjectionRule`
   like the other four, with declared target authority, replacing the
   776-line orphaned `SummaryProjector` class. The first full pass ships
   behind an explicit operator action rather than "no summaries exist yet" —
   that condition is true exactly once, on a fresh deploy, which is the
   machine least able to absorb N AI extractions at once. Exit criterion: the
   package holds no class-based projection code and the open question in
   `npm-package-boundaries.md` about its three unfilled types is closed.

## Validation that remains

- Series' cross-visibility deletion test failing before phase 1 and passing
  after.
- The four rules' existing behavior tests passing unchanged through phases 2–3.
- Export ledger and authoring doc consistency (`public-authoring-golden.test.ts`).
- A first-pass cost test for phase 5: N conversations, one AI call per eligible
  conversation, zero on a second run (`sourceHash` memoization), and nothing at
  all without the explicit trigger.
