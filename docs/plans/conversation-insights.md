# Plan: Insights from team channels

Last updated: 2026-11-28

## Status

Proposed. In a configured chat space the channel pickup (`entities/conversation-memory/src/lib/channel-pickup`) turns new messages into action items and decisions, announces them in the space and takes them back on Undo. This plan adds a third kind of memory to it, the insight, behind a setting, and tries it on the team brain before it becomes a default. Nothing writes summaries any more, and this plan does not bring them back.

## The model

A conversation establishes three kinds of thing, each a claim with a source:

- an **action item**: someone committed to do something;
- a **decision**: the group settled something;
- an **insight**: the group learned or concluded something.

All three record the conversation they came from, the people involved, when it was said, and whether it still holds. The summary is not in this family. It restates what was said, which the conversation database already keeps, and it never had a unit that fit: per conversation it grows without end in a channel, and per day or per topic it serves one reader and fails another. Stored summaries stay readable.

## Behavior

In a chat space the brain is configured for (`spaces`), when insight capture is on:

- The brain picks up insights as people talk: a conclusion or finding the conversation reached that is worth knowing later and is neither a task nor a decision. Chatter, questions, and facts the brain already holds are not insights.
- An insight is announced in the batch's notice beside its cards and decisions, with an **Undo**. There is no approval step.
- An insight belongs to people once a person has edited it: the pickup never changes it again. One the pickup made and nobody touched may still be superseded by later messages ("turns out it was the mail server").
- A superseded insight stays, marked `superseded`, and links what replaced it when something did.
- Undo deletes it and is remembered: the pickup never recreates it. One a person has edited is kept, and the notice says so.
- An insight carries the brain's memory visibility when the pickup makes it, and is never `public`.
- An insight recorded by hand is stored at the visibility the request states, `shared` or `restricted`, from the conversation it was said in when it was said in one.
- The brain draws on insights from the same space when it answers there, as it does for decisions.

## Current state

- **Pickup.** `pickUpChannel` (`channel-pickup/pickup.ts`) claims a conversation's unprocessed range on a bookmark in runtime state, runs the action-item extractor and the decision extractor over it, writes what they found under ids derived from the source message, records a notice, and moves the bookmark. What a dead run wrote from the range is left out of what the extractors are shown, so a rerun finds and announces it.
- **Decision extraction.** `ChannelDecisionExtractor` asks the model for the language of the new messages, then for candidates, each judged `decision`, `action-item`, `undecided` or `recorded`, with the recorded decision it replaces when it replaces one. Only a `decision` is kept. Nine eval cases cover it (`evals/test-cases/channel-decision-*.yaml`).
- **Ownership.** The bookmark's `own` holds the hash of each decision the pickup wrote. `rewriteOwnDecision` (`own-decisions.ts`) changes a decision only while its content still has that hash; supersede and Undo both go through it.
- **Notice and Undo.** A notice item has a kind: a card when it states none, or `decision`. `undoNoticeCard` deletes a decision that is still the pickup's own, records it in `rejected`, and makes active again what it had superseded.
- **Decision type.** `decisionMetadataSchema` (`schemas/conversation-memory.ts`): optional `conversationId`, `channelId`, `channelName`, `interfaceType` and `timeRange`, `status`, optional `supersededBy`, `decidedBy` and `mentionedBy`. Its create route (`decision-create.ts`) stores a decision asked for through `system_create`.
- **Readers.** `ConversationMemoryRetriever` and the agent-context provider return `summary`, `decision` and `action-item`, scoped to the caller's space; the dashboard has a decisions widget and a recent-memory widget that lists summaries.
- **Summary type.** Registered, read-only through its action policy, produced by nothing.

## Design

### Schema

The fields a memory records about its source are defined once and used by `decision` and `insight`: the four conversation fields, `timeRange`, `status` and `supersededBy`. `decision` keeps its field names, so stored decisions read unchanged. An insight adds `statedBy` and `mentionedBy`. Its body is a heading and its text.

`insight` is a new entity type in `entities/conversation-memory`, defined with the same `memoryCodec` and registered as projection source material, as `decision` is, with a create route like the decision's.

### Extraction

The decision extractor's candidates gain the kind `insight`, and the prompt its definition. Decisions and insights are judged in one call because the two are told apart most reliably side by side: a statement becomes one or the other, never both. When insight capture is off the prompt does not offer the kind.

The extractor is shown the conversation's active insights beside its decisions, and a candidate may replace one of either.

### Writing and ownership

The decision writer and `rewriteOwnDecision` become the writer of both types: ids `flatId(conversation id, "insight", position, n)`, the hash of what was written in the bookmark's `own`, supersede only while that hash holds.

### Notice and Undo

A notice item's kind gains `insight`; its line reads "Insight: …". Undo on an insight behaves as on a decision.

### Readers

The retriever and the agent-context provider add `insight` to the types they return. The dashboard gets a "Recent insights" widget, the decisions widget's list over insights. The recent-memory widget keeps listing stored summaries.

### Summaries

The type stays registered and its stored entities stay readable by the retriever, the agent context and the site templates. Eval handlers that no longer exercise a producer are removed.

### Configuration

`summaryConfigSchema` gains `captureInsights` (default `false`). The team brain turns it on for the trial.

## Failure handling

The pickup's failure handling applies unchanged: a failed extraction or write leaves the bookmark where it was and every write is idempotent. One bookmark covers cards, decisions and insights, so an extraction that keeps failing holds up the announcement of the whole batch; the job's failure is visible in the job queue.

## Phases

Each phase is one capability with its tests and evals, on one pull request.

1. **The type.** The shared source fields, `insight`, its codec, create route and registration, the readers and its widget; its golden file in the stored-form contract and its place in the team bundle's permissions.
2. **Capture.** `captureInsights`, the `insight` kind in the extractor, the writer, notice and Undo. The decision evals rerun against the extended prompt.
3. **Trial.** Insight capture on for the team brain for two weeks, then a review of what it captured.

## Evals

Through the conversation-memory plugin's `extractChannelDecisions` eval handler, each message with its speaker:

- an insight for a conclusion reached over several messages;
- none for chatter, a question left open, or a restated decision;
- a statement that is a decision stays a decision, and one that is a task stays a task;
- an insight overturned by a later finding.

## Open questions

- **Insight capture after the trial.** The review decides whether it becomes the default, stays opt-in, or is removed. The criterion is whether the captured insights are ones a team member would have saved.
- **Stored summaries on disk.** A summary is read-only through the action tools, but directory sync imports an edited summary file whose body still parses. Whether sync should refuse changes to system-maintained types is undecided.
- **`decision-record` in `team-posture-capabilities.md`.** That parked item describes decision logs with rationale. Whether it is still a separate type now that decisions are picked up and recorded by hand is undecided.
