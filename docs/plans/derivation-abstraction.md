# Derivation Abstraction

## Status

Proposed. Fact-checked against the tree 2026-08-26.

The scheduling half of projection is already structural and shipped — waves,
memoization, persistence, and retry live in `shell/core` (`projection-runtime`,
`projection-wave-scheduler`, `projection-rule-job-handler`), activated by
`173b53092` when event-driven projection was retired. Nothing in this plan
reopens that. What is not structural is the derivation body: three packages
hand-roll the same ~190-line shape around an 8-line declaration.

- `entities/assessment/src/lib/swot-projection.ts` (195 lines)
- `entities/agent-discovery/src/lib/skill-projection.ts` (175 lines)
- `entities/series/src/lib/series-projection.ts` (190 lines)

All three do exactly this:

```
selectInput:  Promise.all([ listEntities(sources), listEntities(existing targets),
                            appInfo(), resolvePrompt(template) ])
              → build prompt
derive:       ai.generate(prompt)
              → map results to { operation: "upsert" } with scopedDerivedId
              → diff against existing targets → { operation: "delete" }
```

What genuinely differs is three things: which source types feed it, what the
prompt says, and what shape comes back. Everything else — the parallel gather,
the appInfo-in-the-fingerprint input hashing, the upsert-then-reconcile-deletes
diff — is copied. Three implementations at ~70% overlap is past the extraction
threshold.

The counter-example was checked before this plan was written:
`entities/topics/src/lib/topic-wave-rule.ts` (330 lines) fits
`defineProjectionRule` but would not fit this abstraction — it loops batched AI
calls with weighted relevance thresholds, mint ceilings tied to a source ratio,
and never deletes. Topics stays on the raw rule interface, deliberately. The
abstraction is a layer over `defineProjectionRule`, not a replacement for it,
and topics existing is what proves the escape hatch works.

`conversation-memory` is the fourth consumer and the reason the timing is now:
it owns three derived entity types nothing fills, because its event-driven
projector was retired with the runtime it depended on. Its 776-line
`SummaryProjector` class is orphaned — no `defineProjection` or
`defineProjectionRule` exists anywhere in the package. Turning memory back on
should mean declaring a derivation, not writing a fourth copy of the loop.

## Decisions

Made here rather than deferred:

- **Name: `defineDerivation`**, exported beside `defineProjectionRule` from
  `@brains/sdk/entities`. `defineProjection` (the static entity-side slot) and
  `defineProjectionRule` (the raw rule) are both taken; this is the third
  altitude and gets its own name.
- **Classification: advanced-with-consumer**, not stable. It joins the export
  ledger (`packages/brain-cli/test/fixtures/public-authoring/export-ledger.json`)
  in the advanced tier, which keeps it off the compatibility-fixture hook.
  Promotion to stable is a later, separate act once external authors want it.
- **Topics is not converted.** Its shape is real, not legacy. If a second
  batched-loop rule ever appears, that is a different abstraction.
- **A derivation compiles to a `ProjectionRule`.** The runtime sees nothing
  new; `defineDerivation(...)` returns what `projectionRules` already accepts.
  No scheduler changes in phases 1–4.
- **Conversation-memory's first full pass is gated behind an explicit operator
  action**, not "no summaries exist yet." That condition is true exactly once,
  on a fresh deploy, which is the machine least able to absorb N AI extractions
  at once. An explicit trigger (system tool invocation) makes the cost a
  decision instead of a side effect. Incremental scheduling afterwards is the
  runtime's normal batching.
- **Retiring the memory types is off the table.** The producer was paused for
  core-architecture-first sequencing, not abandoned; this plan is the
  core-architecture work that unblocks it.

## Shape of the contract

A derivation declares data; the runtime owns the loop:

```ts
defineDerivation({
  id: "swot-derivation",
  version: "1",
  sources: [{ kind: "entity", types: ["agent", "skill"] }],
  targetType: "swot",
  prompt: (input) => string,          // fed the gathered sources
  output: zodSchema,                  // what ai.generate must return
  toEntities: (parsed, scope) => ..., // parsed output → entity bodies
  reconcile: "delete-unmentioned" | "keep",  // series/skill delete; swot keeps
})
```

The gather (sources + existing targets + appInfo + resolved prompt), the
single `ai.generate`, the `scopedDerivedId` mapping, and the reconcile diff are
the abstraction's body — written once, tested once. `sourceChangeBatchDelayMs`
and the other rule-level knobs pass through.

The exact field names are the first phase's to settle against swot, the
smallest consumer; the phase test is that the swot rule's existing behavior
tests pass unchanged against the declared form.

## Phases

Each phase is a shippable vertical slice with its tests written first.

1. **Coverage widget stops paying for a dead producer.**
   `entities/conversation-memory/src/lib/widgets/coverage.ts:151` issues
   1 + 2M queries per render (`reader.list()` then two reads per conversation
   through `SummarySourceReader`) for staleness data on summaries nothing
   produces. Independent live defect, fixed first: bound the fan-out to the
   conversations that can actually change the display, and cap M. This phase
   deliberately does not add a batched read to `EntityConversationReader` —
   phase 4 touches that contract once, with the projector as the named
   consumer.

2. **`defineDerivation` exists and swot uses it.** Walking skeleton: the
   contract in `shell/plugins`, the SDK re-export, the ledger entry (advanced),
   and `swot-projection.ts` collapsing to a declaration. Swot's existing
   projection tests are the acceptance gate and must pass without behavioral
   edits.

3. **Skill and series convert.** Two consumers with a `reconcile` mode swot
   doesn't use (both delete unmentioned targets). Their rule tests are the
   gate. After this phase the three ~190-line bodies are gone and
   `topic-wave-rule.ts` is the only hand-written rule left, on purpose.

4. **The projection runtime learns conversation sources.** Rule sources are
   entity-only today (`shell/plugins/src/entity/projection-rule.ts:28`).
   Conversation-memory's source is conversations, so this is the capability
   slice: a `{ kind: "conversation" }` source whose change signal comes from
   the conversation service, batched by the scheduler like entity changes.
   Named consumer: phase 5. Same discipline as the boundaries plan —
   capability-then-dependency, never speculative.

5. **Conversation-memory declares its derivation.** The summary derivation
   becomes a `defineDerivation` (or, if extraction's chunking pressure proves
   closer to topics' shape than to swot's, a hand-written
   `defineProjectionRule` — the phase decides against real code, and either
   outcome keeps the 776-line orphaned `SummaryProjector` class deleted).
   The first full pass ships as an explicit system tool per the decision
   above. Decision and action-item derivation follow the summary in the same
   declared form. Exit criterion: the package has no class-based projection
   code and `docs/plans/npm-package-boundaries.md`'s open question about the
   three unfilled types is closed.

## Validation that remains

- Swot/skill/series behavior tests passing unchanged against declared rules
  (phases 2–3).
- Export ledger and `docs/public-release/AUTHORING_API_0.2.md` consistency —
  the golden test (`public-authoring-golden.test.ts`) enforces both.
- A first-pass cost test for phase 5: N conversations, assert one AI call per
  eligible conversation and zero on the second run (sourceHash memoization),
  and assert nothing runs without the explicit trigger.
