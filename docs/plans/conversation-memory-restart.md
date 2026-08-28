# Conversation Memory Restart

## Status

Complete. Revised after implementation review and fact-checked against
`work/plugin-api-boundaries` on 2026-08-27. All eight phases are implemented.
The production-rule eval chain passed all 26 model cases on 2026-08-28, after
which the old `SummaryProjector` comparison path was removed.

The brain stopped deriving memory from conversations in `173b53092`. The
feature was not rejected; the scheduler-only projection runtime had no durable
way to notice changes in the separate conversation database, so automatic
projection was removed instead of adding a best-effort second ingress.

`work/plugin-api-boundaries` now supplies most of that bridge: conversation
rule sources, conversation reads during input selection, an ascending change
scan, and a watermark poller. This plan first closes the bridge's remaining
correctness gaps, then wires conversation-memory to it.

## Quality baseline

The former `SummaryProjector` behavior is the compatibility baseline, not a
design to rewrite on the way out. The package has 26 eval cases:

- 12 use `summarizeMessages`;
- 4 use `projectMessages`;
- 3 use `decideProjection`;
- 4 cover retrieval; and
- 3 cover agent-context injection.

The 19 summarization/projection cases cover low-signal skips, corrections,
append behavior, long and multi-phase conversations, separate decision and
action-item entities, delegated work, and canonical actor links. The other 7
protect the readers of the resulting memory. All 26 remain green before the
class is deleted.

The following behavior is non-negotiable:

- only configured conversation spaces derive memory;
- actor/source metadata and attribution survive projection;
- `maxSourceMessages`, `maxMessagesPerChunk`, entry compaction, append/update,
  and low-signal skip semantics remain effective;
- changed decisions and action items do not leave stale active entities;
- old summaries remain readable and are not destructively migrated; and
- installing or restarting the runtime never launches an implicit historical
  model backfill.

## Decisions

### 1. Harden the conversation cursor before relying on it

A timestamp alone is not a safe bounded cursor. The current scan orders only by
`updated` and resumes with `updated > watermark`; more rows than one page at the
same timestamp are stranded. Message insertion and conversation timestamp
advancement are also separate writes, so a crash between them can hide a stored
message from the poller.

The cursor becomes `{ updated, id }`:

- scans order by `updated ASC, id ASC`;
- resume means `updated > cursor.updated OR (updated = cursor.updated AND id >
cursor.id)`;
- every mutation makes a conversation's `updated` strictly newer than its
  previous value, even when two writes occur in the same millisecond; and
- message insertion, conversation advancement, and summary-tracking advancement
  commit in one conversation-database transaction. Broadcasts remain after the
  commit.

The persisted runtime-state value is a Zod-validated cursor object, not a raw
string.

### 2. Cold start establishes a baseline; it does not backfill

When a conversation-source rule first becomes active and no live cursor exists,
the runtime records the current conversation change head and marks nothing
dirty. This initialization happens before interfaces begin accepting messages;
a boot-order test pins that requirement. Subsequent polls see only changes
strictly after that baseline.

The live cursor is never reset to perform a historical pass. Backfill has its
own cursor and progress record, so new live changes cannot be skipped or
replayed by an operator action.

The poller runs only when the registered graph contains at least one
conversation-source rule. One bounded page is marked before an idle sweep
claims its next wave; it does not keep filling an active wave while projection
work is running.

### 3. Projection input receives configured spaces

The drafted summary rule needs configured spaces, but
`ServicePackageDefinition.projectionRules` receives only package config and a
template resolver. Duplicating shell spaces into conversation-memory config
would create two authorities.

Add `spaces: readonly string[]` to `ProjectionInputContext`, populated from the
resolved shell configuration. `createSummaryProjectionRule` then closes only
over `SummaryConfig` and checks eligibility from `context.spaces` during input
selection.

`ProjectionInputContext` is published in the advanced authoring tier, so this
is an acknowledged API change: update the SDK export ledger, authoring docs,
golden tests, and changeset. The earlier claim that all work after eval trigger
inputs was package-internal is withdrawn.

### 4. The summary remains the only model-backed rule

The summary rule is additive because one wave contains only the conversations
that changed. Exclusive authority at visibility scope would delete summaries
for every other conversation.

For each triggered conversation upsert, input selection reads:

- the eligible conversation and its recent source window;
- complete message role, timestamp, actor, source, and metadata;
- the existing same-visibility summary, when present;
- the configured model identity; and
- a source hash produced by the same shared function used by coverage.

The rule reuses the projector's domain behavior rather than the current draft's
simplification:

- projection decision remains one model call over the new/changed messages;
- extraction remains chunked by `maxMessagesPerChunk` with its existing bounded
  concurrency;
- append parses and retains prior entries;
- update re-extracts the configured source window and replaces stale memory;
- a legacy summary without the new machine envelope takes the update path on
  its first post-upgrade change;
- entry compaction and `maxEntries` remain; and
- participant and item attribution are computed from the original message
  metadata.

Move these behaviors from private class methods into package-local derivation
helpers used by both the rule and evals. The comparison class remains only
until parity is proven, then is removed.

The selected-input fingerprint, including model and config version, is the
scheduler memo key. `sourceHash` remains stored provenance for coverage; it is
not described as the scheduler memo key.

### 5. Carry one lossless, versioned extraction envelope

Decision and action-item rules must not call a model or reread conversations.
The summary therefore carries the complete desired first-class memory produced
by the extraction pass.

Keep the human narrative format unchanged and append a versioned machine
envelope in a canonical HTML comment. The envelope is validated by Zod and
contains only JSON data needed downstream:

- format version;
- complete decision and action-item records for the represented summary state;
- stable item id inputs, text, time range, and source message count; and
- precomputed actor references for decider, assignee, and requester provenance.

It is not placed in entity metadata/frontmatter: that metadata must remain
small and query-oriented. It does not add visible `### Decisions` or
`### Action Items` sections, preserving the narrative-only summary contract.
The parser treats an absent or invalid envelope as legacy input and abstains;
it never guesses or deletes from malformed data.

Item ids are deterministic from conversation id, memory type, normalized text,
and source time range rather than a mutable array index. An append combines the
prior valid envelope with newly extracted items; an update writes the complete
replacement envelope.

### 6. Downstream rules explicitly reconcile one summary partition

A visibility-wide exclusive rule is unsafe for decisions and action items: a
wave for one summary would delete the other conversations' entities. Plain
additive rules are also wrong because corrections would leave stale decisions
and action items active.

Extend `ProjectionTargetAuthority` with a declared `managed` mode:

- `additive` permits upserts only; enforce that it cannot return deletes;
- `exclusive` keeps runtime-owned visibility-wide reconciliation; and
- `managed` permits explicit upsert/delete intents when a domain has a narrower
  partition than the runtime can express.

This is another advanced-tier contract change and receives the same ledger,
documentation, golden-test, and changeset treatment.

The decision and action-item rules use `managed` authority. Each is sourced by
`summary`, selects only summary ids that woke it, and for every valid envelope:

1. reads existing targets at the configured visibility whose
   `sourceSummaryId` equals that summary id;
2. upserts the complete desired item set from the envelope; and
3. deletes only existing ids absent from that same desired partition.

A legacy or malformed summary is omitted from reconciliation, so old memory is
left untouched. Tests pin zero-item replacement, cross-conversation isolation,
cross-visibility isolation, and malformed-envelope abstention. Existing
lifecycle status is preserved for a stable id (`done`/`dropped` action items and
`superseded` decisions) rather than reset by a later conversation message.

The three-rule graph remains:

1. conversation → summary (model-backed, additive);
2. summary → decision (parse-only, managed); and
3. summary → action-item (parse-only, managed).

`target_type` therefore remains one type per rule and needs no database schema
migration. Downstream rules make zero model calls.

### 7. Evals execute the rule code without writing live fixtures

Supplying trigger ids to `runProjectionRule` was necessary but is not sufficient
for the existing synthetic evals: that method still reads the live conversation
database, and its dry run does not persist a summary for downstream rules.

Keep the runtime eval API narrow. Inside conversation-memory, add a package-local
in-memory rule-chain runner that:

- builds the same validated selected input from eval messages;
- invokes the actual summary rule derive callback;
- overlays its summary intents in an in-memory entity reader;
- invokes the actual decision and action-item rule callbacks; and
- returns the same result shape the current handlers expose, without writes.

Input-selection unit tests cover the real runtime readers and configured-space
filter separately. `summarizeMessages`, `decideProjection`, and
`projectMessages` share the extracted pure helpers/rule callbacks rather than a
second implementation. The 3 decision evals continue to measure skip, append,
and correction; the 4 projection evals measure the full dry-run chain.

### 8. Historical projection is a confirmed, durable operator action

Add a shell-owned, source-generic admin tool named
`system_backfill_conversation_projections`. The shell owns it because scanning
the conversation database and marking the entity projection store crosses the
same database boundary as the poller; entity packages must not receive raw
runtime services to implement it.

The tool:

- requires admin permission;
- declares writes and requires explicit confirmation with a model-cost warning;
- starts or resumes one durable backfill run rather than blocking the request;
- scans with its own composite cursor in bounded pages;
- marks conversation sources dirty while eligibility remains the rule's job;
- reports scanned, eligible-derived/abstained where available, marked, and
  remaining progress;
- waits for a marked page's wave to settle before marking the next page; and
- never reads or writes the live poll cursor.

Starting the tool while a run is active returns that run. A completed run is
not silently repeated; repeating requires a new confirmed run. With the current
graph this wakes conversation-memory, while the tool remains valid for future
conversation-source rules.

## Phases

Each phase is test-first and shippable.

1. **Make the bridge lossless.** Composite cursor and tie-break query;
   transactional message/timestamp/tracking writes; strictly monotonic
   conversation revisions; runtime-state cursor schema.
2. **Complete the advanced rule contracts.** Add spaces to
   `ProjectionInputContext`; add and enforce managed target authority; update
   SDK ledger, authoring documentation, golden tests, and changeset.
3. **Reach summary parity.** Refactor projector domain helpers, replace the
   draft's reduced hash/message/model path, register the additive summary rule,
   and keep the class as a comparison oracle.
4. **Chain first-class memory.** Add the versioned envelope and the two managed,
   parse-only rules with partition-scoped reconciliation.
5. **Move evals onto the rules.** Add the in-memory chain runner and get all 26
   package evals green against shared rule/domain code.
6. **Turn on live polling safely.** Baseline-before-interfaces boot behavior,
   idle bounded polling, persisted live cursor, and end-to-end changed
   conversation projection.
7. **Add explicit backfill.** Confirmed admin tool, durable bounded run,
   independent cursor, progress, resume, and live-change coexistence.
8. **Remove the old path.** Delete `summary-projector.ts` and its class-focused
   tests only after eval and integration parity; update the README and roadmap.

## Validation

- All 26 conversation-memory eval cases green before class deletion.
- Summary rule unit tests prove configured-space filtering, complete actor
  metadata, shared source hashing, update/append behavior, chunking, compaction,
  and legacy-envelope migration.
- Downstream tests prove correction removes stale same-summary items while
  preserving other conversations, other visibilities, and user-updated
  lifecycle status.
- A page containing more equal-timestamp rows than the batch size is drained
  without loss or duplication; same-millisecond repeated updates advance.
- A transaction-failure test cannot commit a message without advancing its
  conversation revision.
- Fresh activation with historical conversations marks nothing; the first new
  message is marked; a restart resumes from the persisted composite cursor.
- An aggregate wave with every registered rule reads only triggered
  conversations. Model calls are bounded to the existing decision call plus
  the expected extraction chunks for each changed eligible conversation;
  downstream rules make none.
- Re-marking unchanged sources is a selected-input fingerprint memo hit and
  makes no model calls.
- Backfill is confirmed, bounded, resumable, independent of the live cursor,
  and cannot create one unbounded wave.
- Nothing derives without a post-baseline conversation change or the explicit
  backfill action.

## Out of scope

- Deleting summaries when conversations are deleted. Conversation deletion has
  no durable tombstone feed yet; add a separate sweep if product behavior
  requires it.
- Re-summarizing all history automatically on model or package upgrade.
- Changing retrieval ranking, dashboard presentation, or the human summary
  narrative format.
