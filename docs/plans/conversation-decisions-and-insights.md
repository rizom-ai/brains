# Plan: Decisions and insights from team channels

Last updated: 2026-11-28

## Status

Proposed. A team channel's conversation produces action items today and nothing else: the automatic producer of summaries and decisions was removed with the scheduler-only projection runtime (`173b53092f`), and only the action-item pickup (`entities/conversation-memory/src/lib/channel-action-items`) was rebuilt. This plan extends that pickup to decisions, adds a third kind of memory, the insight, and stops producing summaries.

## The model

A conversation establishes three kinds of thing, each a claim with a source:

- an **action item**: someone committed to do something;
- a **decision**: the group settled something;
- an **insight**: the group learned or concluded something.

All three record the conversation they came from, the people involved, when it was said, and whether it still holds. The summary is not in this family. It restates what was said, which the conversation database already keeps, and it never had a unit that fit: per conversation it grows without end in a channel, and per day or per topic it serves one reader and fails another. No new summaries are written. Stored ones stay readable.

## Behavior

In a chat space the brain is configured for (`spaces`):

- The brain picks up decisions as people talk, as it does action items. A decision is something a participant explicitly decided, or a proposal the conversation explicitly accepted. A recommendation nobody accepted, an ownership assignment ("Alice owns the rewrite") and a system instruction are not decisions.
- When insight capture is on, it also picks up insights: a conclusion or finding the conversation reached that is worth knowing later and is neither a task nor a decision. Chatter, questions, and facts the brain already holds are not insights.
- What it picks up is announced in the same notice as the batch's cards, each line saying what it is, each with an **Undo**. There is no approval step.
- A decision or insight belongs to people once a person has edited it: the pickup never changes it again. One the pickup made and nobody touched may still be superseded by later messages ("we're keeping the field after all", "turns out it was the mail server").
- A superseded decision or insight stays, marked `superseded`, and links what replaced it when something did.
- Undo deletes it and is remembered: the pickup never recreates it. One a person has edited is kept, and the notice says so.
- What the pickup makes carries the brain's memory visibility. Neither kind is ever `public`.
- A decision or insight recorded by hand ("note that we decided to drop the company field") is stored as a valid entity at the visibility the request states, `shared` or `restricted`; a request that states none, or `public`, is refused. Said in a chat, it takes that conversation as its source; made outside one, it has none. It names no decider: whoever records a decision need not have made it.
- The brain draws on decisions and insights from the same space when it answers there, as it does today for stored memory.

## Current state

- **Pickup.** `pickUpChannelActionItems` (`channel-action-items/pickup.ts`) claims a conversation's unprocessed range on a bookmark in runtime state, extracts, writes cards with ids derived from conversation and source message, records a notice, and moves the bookmark. Wake-up is `conversation:messageAdded` for a message carrying a configured `spaceId`; catch-up runs on `startupContentSettled` and daily (`trigger.ts`, `register.ts`).
- **Notice and Undo.** The notice is a record in the bookmark, posted from the web process through `spaceNoticeContract`; `undoNoticeCard` (`undo.ts`) withdraws a card through the action-item writer and records it in the bookmark's `rejected` list. Notice lines, the title ("Added to the board", "Board updated") and Undo are written for cards only (`notice.ts`).
- **Ownership.** `isBoardOwned` (`shared/action-items/src/board.ts`) reads a card's stored content to tell whether anything but the pickup wrote it. Decisions have no equivalent.
- **Decision type.** `decisionMetadataSchema` (`schemas/conversation-memory.ts`) requires `conversationId`, `channelId`, `interfaceType`, `timeRange` and `status`. Nothing writes decisions; a decision created through chat fails validation on the missing conversation fields (recorded in `docs/plans/42.md`).
- **Summary type.** Registered, read-only through its action policy, produced by nothing (`summary-entity.ts`).
- **Readers.** `ConversationMemoryRetriever` and the agent-context provider return `summary`, `decision` and `action-item`, scoped to the caller's space; the dashboard has a decisions widget and a recent-memory widget that lists summaries.
- **Shared pieces.** `memoryCodec` (`lib/memory-codec.ts`) already writes a memory's time range and people for summaries and decisions; `memoryActorReferenceSchema` and `memoryTimeRangeSchema` come from `@brains/action-items`.

## Design

### Schema

The fields a memory records about its source are defined once and used by both types:

- `conversationId`, `channelId`, `channelName`, `interfaceType`: all optional, present together when the memory came from a conversation;
- `timeRange`: optional, the span of the messages behind it;
- `status`: `active` or `superseded`;
- `supersededBy`: optional, the id of the decision or insight that replaced it.

A decision adds `decidedBy` and `mentionedBy`, as today. An insight adds `statedBy` and `mentionedBy`. The body of each is a heading and its text.

`decision` keeps its field names, so stored decisions read unchanged; the conversation fields and `timeRange` become optional. `insight` is a new entity type in `entities/conversation-memory`, defined with the same `memoryCodec` and registered as projection source material, as `decision` is.

### One pickup, three kinds

The pickup's core (bookmark, claim, wake-up, catch-up, notice, Undo) moves out of `channel-action-items/` into a shared `channel-pickup/`, with one applier per kind. The job type and the runtime-state namespace keep their stored names (`channel-action-items`, `conversation-memory.channel-action-items`): renaming them would orphan every bookmark and with it the record of what was undone.

A run still claims one range and moves one bookmark:

1. Claim `processedThrough + 1 … count`.
2. Read the claimed messages, the context window, the conversation's own open cards, and its own active decisions and insights.
3. Extract action items (the existing extractor, unchanged).
4. Extract decisions and insights (below).
5. Apply each result through its writer; skip rejected ids.
6. Record the batch's notice.
7. Move the bookmark and clear the claim.

Decisions and insights begin at each conversation's existing bookmark. A brain that already runs the pickup therefore reprocesses nothing; a space added later is read from its first message, as it is for cards today.

### Extraction

One extractor finds decisions and insights in a single call, because the two are told apart most reliably side by side: a statement becomes one or the other, never both. Action items keep their own extractor and prompt, whose thirteen eval cases stay as they are.

Input: the context window, the new messages with position and speaker, and the conversation's own active decisions and insights. Output, per item:

- `add`: kind, title, text, source message position, and who decided or stated it (a speaker from the messages);
- `supersede`: one of the shown items, the message that overturns it, and optionally the new item that replaces it.

Every item cites a message from the new range; a `supersede` names an item the model was shown. Anything else is dropped. Messages that are part of a conversation with the brain are context only, as for cards. When insight capture is off the prompt does not ask for insights.

### Writing and ownership

- An id derives from the conversation and source message: `flatId(conversation id, "decision", position, n)` and the same with `"insight"`, so a rerun writes the same entity.
- The pickup's own items are the conversation's active decisions and insights carrying those id prefixes whose content still matches what the pickup last wrote, the 30 most recent of each. The pickup records the hash of what it wrote per id in the bookmark, not in the entity: the file carries nothing a person does not read. If the bookmark is lost, no item counts as the pickup's own and none is rewritten.
- A hand-made record arrives through `system_create` and the type's create route, which sets `status` and takes the source from the caller. A create route cannot set visibility and an unstated one is `public`, so the route refuses both. The caller of a create route carries its conversation id for this.
- The pickup writes through the entity service with the brain's memory visibility, as it does cards.

### Notice and Undo

A notice item gains a kind (`action-item` when a stored notice has none). Lines, titles and Undo labels are written per kind; the ten-item limit, the pinned source messages and the posting flow are unchanged. Undo on a decision or insight deletes it through its writer unless a person has edited it, and adds its id to `rejected`.

### Readers

The retriever and the agent-context provider add `insight` to the types they return. A memory without conversation fields has no space: the retriever leaves it out, as it does an action item tracked from the Inbox, and ordinary search finds it. The recent-memory widget lists recent decisions and insights where it listed summaries. The decisions widget is unchanged.

### Summaries

Nothing writes a summary. The type stays registered and its stored entities stay readable by the retriever, the agent context and the site templates. The summary-specific eval handlers that no longer exercise a producer are removed with the phase that replaces them.

### Configuration

`summaryConfigSchema` gains `captureInsights` (default `false`). Decisions are picked up wherever cards are. The team brain turns insight capture on for the trial.

## Failure handling

- **An extraction or a write fails:** the job fails and retries; the bookmark has not moved and every write is idempotent.
- **The decision and insight extraction keeps failing:** the batch's cards are not announced either, since one bookmark covers the range. The job's failure is visible in the job queue; the fix is to the extractor, not a second bookmark.
- **Crash after writes, before the bookmark moves:** the claim expires and the next run writes the same entities and notice.
- **A person edits an item between the pickup's read and its write:** the writer writes conditionally on the version read, and the edit wins.
- **Undo on an item a person has edited:** it stays, and the notice says it was kept.

## Phases

Each phase is one capability with its tests and evals. Decisions land as one pull request, insights as a second.

Decisions:

1. **Schema and hand-made records.** `decision` with optional conversation fields and its create route. Tests pin a decision recorded in a chat (source, visibility, `status`), one made without a conversation and the refused visibilities; stored decisions read unchanged. The source fields are defined once when `insight` becomes their second user.
2. **Pickup.** The shared `channel-pickup/` core with the action-item applier moved onto it, behavior unchanged, and the decision applier with `add`. Tests for rerun idempotence, start at the existing bookmark, and rejected ids; evals below.
3. **Notice and Undo.** Kinds in the notice; Undo for a decision, kept when a person edited it.
4. **Supersede.** Own-item tracking in the bookmark, `supersede` in the extractor, `supersededBy`. Tests that an edited decision is never changed; evals for a reversal.

Insights:

5. **The type.** `insight`, its codec, registration, the readers and the recent-memory widget; the summary producer's leftover eval handlers removed.
6. **Capture.** `captureInsights`, insights in the extractor and applier, notice and Undo. The decision evals rerun against the extended prompt.
7. **Trial.** Insight capture on for the team brain for two weeks, then a review of what it captured.

## Evals

Through the conversation-memory plugin's extraction eval handler, each message with its speaker:

- a declared decision, with its decider; a proposal accepted by another speaker;
- no decision for a recommendation nobody accepted, an ownership assignment, a question, or a request to the brain;
- one statement yields a card or a decision, not both ("I'll remove the field by Friday" against "we're removing the field");
- a reversal supersedes the earlier decision and links the new one;
- an insight for a conclusion reached over several messages; none for chatter, a question left open, or a restated decision;
- an insight overturned by a later finding.

Through the pickup itself: messages stored in a space conversation, the job run, and the resulting entities checked for source, people, `status` and visibility.

## Open questions

- **Insight capture after the trial.** The review decides whether it becomes the default, stays opt-in, or is removed. The criterion is whether the captured insights are ones a team member would have saved.
- **Stored summaries on disk.** A summary is read-only through the action tools, but directory sync imports an edited summary file whose body still parses. Whether sync should refuse changes to system-maintained types is undecided.
- **`decision-record` in `team-posture-capabilities.md`.** That parked item describes decision logs with rationale. Whether it is still a separate type once decisions are picked up and hand-recordable is undecided.
