# Conversation Memory Restart

## Status

Proposed. Fact-checked against the tree 2026-08-26.

The brain stopped deriving memory from conversations on 2026-08-04, in
`173b53092`. Not because the feature was unwanted — the README that commit
wrote says why:

> Automatic conversation-to-entity projection is disabled. Conversation
> messages live outside the entity database, and no second projection ingress
> or cross-database bridge is provided.

Moving to the scheduler-only projection runtime meant triggers came from
entity changes recorded inside the entity database's own transaction.
Conversations are in their own database. Rather than build a second ingress
beside the new one, the trigger was dropped and every reader left in place.

That bridge now exists, built on `work/plugin-api-boundaries`: a
`{ kind: "conversation" }` rule source, a watermark poller, an ascending
`listConversationsUpdatedSince` scan, and conversation reads on the rule
input context. What remains is wiring conversation-memory to it.

## What is not in question

`SummaryProjector` (`src/lib/summary-projector.ts`, 776 lines) is the live
summarization implementation, measured by **26 eval cases** under
`evals/test-cases/` through three handlers — `summarizeMessages`,
`decideProjection`, `projectMessages`. Those cases cover attribution of
delegated actions, self-contradicting conversations, topic shifts across a
long session, and canonical actor linking. They are the quality bar for
summarization and this plan does not lower it.

The extraction logic is the domain. It moves to a rule largely intact; it is
not rewritten.

## Decisions

- **The summary rule is additive, not exclusive.** A wave derives only the
  conversations it was woken about, so "every summary this run did not
  mention" would be every other conversation's. Orphaned summaries from
  deleted conversations are not cleaned by the rule; if that matters later it
  is a separate sweep, not a reason to make the rule authoritative.
- **The three memory types are written by chaining, not by one rule owning
  them.** `target_type` is a NOT NULL column on `projection_wave_rules`, so a
  rule owning several needs a schema migration or the store's write guard
  moved out of the store. Summary from conversations, then decision and
  action item from the summary, uses the topological levels that already
  exist. The downstream two are additive and parse-only, so there is one
  model pass and nothing existing is removed while old summaries lack the
  sections they read.
- **The first full pass is an explicit operator action.** Not "no summaries
  exist yet", which is true exactly once, on a fresh deploy, on the machine
  least able to absorb one model call per conversation.
- **The 26 eval cases are the acceptance criterion.** Green against the rule
  before the class is deleted, not after.

## Starting point already in the tree

`src/lib/summary-rule.ts` is drafted and typechecks: it selects only the
conversations a wave woke it about, abstains when none of them are in a
configured space, and skips writing over a prior summary when nothing worth
remembering was said. Its own tests cover those. It is **not registered** —
nothing constructs it — and phase 2 below is what makes it real. It is
committed rather than held back because this plan is its named consumer and
says when it gets wired.

`SummaryExtractor` now takes `Pick<IEntityAINamespace, "generate">` rather
than the whole namespace, which is what let a rule's execution context hand
it the one it has.

## Phases

1. **An eval can drive a conversation rule.** `runProjectionRule` hardcodes
   `inputs: []`, which suits a rule that reads the corpus and starves one
   that reads only what it was woken about. It takes trigger inputs so an
   eval can name the conversation it is measuring. Shipped on
   `work/plugin-api-boundaries`, because it changes `EntityEvalContext` —
   published, advanced tier. Everything below is package-internal.

2. **The summary rule replaces the projector's summarization.** Register it
   through the package definition's `projectionRules`, repoint
   `summarizeMessages` and `projectMessages` at it via `runProjectionRule`,
   and get the eval cases that measure summarization green.

3. **Decision and action item chain off the summary.** Two additive,
   parse-only rules. Requires the summary body to carry what the extraction
   found — a content-format change for new summaries only, which is why the
   rules are additive: old summaries yield nothing and nothing is deleted.
   `decideProjection`'s eval cases move with them.

4. **The poller runs.** Wire `createConversationSourcePoller` into the
   projection sweep, with the watermark in runtime state. Until this lands
   nothing is automatic — the rule exists but is never woken.

5. **The first pass is an operator action.** A tool that marks every eligible
   conversation dirty once, so a brain with history opts into the cost rather
   than discovering it on boot.

6. **The class goes.** Delete `summary-projector.ts` and its ~1000-line test
   once all 26 eval cases are green against the rules and nothing constructs
   it. That also closes the last open question from the package-boundaries
   work: conversation-memory owning three derived types nothing fills.

## Validation

- 26 eval cases green against the rules before deletion.
- An aggregate wave cost test: one wave with every registered rule, asserting
  the summary derivation reads only the conversations it was woken about and
  makes one model call per changed conversation — the fan-out question that
  matters once five rules run in the same wave.
- A second wave over unchanged conversations makes no model calls
  (`sourceHash` memoization).
- Nothing derives without either a conversation change or the explicit first
  pass.
