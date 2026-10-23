# Plan: Action items from team channels

## Status

Proposed. Nothing turns a team channel's conversation into action items today: the automatic conversation-memory producer was removed with the scheduler-only projection runtime (`173b53092f`, 2026-08-04), and `entities/conversation-memory/README.md` records that automatic conversation-to-entity projection is disabled. The roadmap's collective posture expects the team brain to produce action items from conversation; this plan delivers that for action items in configured chat spaces.

## Behavior

In a chat space the brain is configured for (`spaces`, for example `discord:<channel id>`):

- The brain picks up action items from the conversation as people talk. No one has to mention it or ask for a card.
- When it adds cards, it says so in the channel: it reacts to each message it acted on (📌) and posts one short note listing what it added, each with its owner, with an **Undo** button per card. There is no approval step before a card is created.
- A card it made itself may still be revised or withdrawn when later messages change it (another owner, "already done", "never mind"). A card the board has touched (moved, noted, edited) is never changed by the pickup.
- Undo deletes the card and is remembered: the pickup never recreates it.
- Cards carry the brain's memory visibility (`shared` for the team bundle), never `public`.
- An explicit request to the brain ("add an action item for …") creates a valid card through the same writer.

Decisions and summaries are not part of this plan.

## Current state

- **Capture.** `chat-turn-controller.ts` stores every message in a configured space, mentioned or not, in one conversation per space (`getChatConversationId(platform, spaceThreadId)`), with the author's resolved principal in the message metadata. Linked Discord identities resolve to the brain's people.
- **No producer.** `SummaryProjector.projectConversation` is called only from eval handlers. It re-reads a whole conversation, replaces its non-board action items and writes silently. A channel's conversation never ends, so that shape would re-read the full history on every run.
- **Extraction.** `SummaryExtractor` returns action items as plain strings attached to summary entries, without the message they came from, an owner, or knowledge of cards already made.
- **Digest.** `ConversationService` broadcasts `conversation:digest` every `digestTriggerInterval` messages. Nothing subscribes to it.
- **Explicit requests.** An agent can only create an action item through `system_create`, which sets neither `capturedAt` nor `status`, so validation rejects it; an entity created without a visibility is `public`.
- **Board ownership.** `isBoardOwned` (via `projectedBodyHash`) already tells a card the board changed from one only the producer wrote.
- **Processes.** The message bus is per process. The Discord gateway runs as the chat interface's daemon in the web process; jobs run in the worker. The web process can `observe` what any process raises. No plugin can post into a Discord channel: the channel registry marks Discord as manual delivery and only the chat interface holds the connection.
- **Building blocks.** Job deduplication `skip` matches only a pending job, so a message arriving while a job runs queues one more. Runtime state offers `compareAndSet`. Recurring checks run daily or weekly. `startupContentSettled` fires once startup content is in place.

## Design

The conversation database is the only source of truth. Events only wake work up; a durable bookmark per space decides what is processed.

### Bookmark

Per space conversation, runtime state (`conversation-memory` namespace, key `action-items:<conversation id>`) holds `processedThrough` (the last message position handled) and an optional `claim` (`through`, job id, claimed at). Only a run holding the claim writes; the bookmark moves forward only after the batch's cards and notice record are written.

### Wake-up

Each message the chat interface stores for a space carries the space it belongs to (`spaceId` in its metadata, e.g. `discord:<channel id>`); a space conversation's own channel id is the chat SDK's composite id (`discord:<guild>:<channel>`), which selectors do not match. A `conversation:messageAdded` event whose message carries a configured `spaceId` enqueues `channel-action-items` with `deduplication: "skip"` and key `channel-action-items:<conversation id>`. A channel therefore has at most one pending job, and a message that arrives during a run queues the next one. The unused digest broadcast and its configuration are removed.

### Catch-up

On `startupContentSettled` and in a daily recurring check, the plugin compares each conversation's message count with its `processedThrough` and enqueues the job for every conversation behind whose latest message carries a configured `spaceId`. A lost wake-up delays a batch; it never loses one.

### The job

1. Read the bookmark. If another run's claim is younger than the claim timeout, stop: that run, or the job queued behind it, covers the messages. Otherwise claim `processedThrough + 1 … count` with `compareAndSet`.
2. Read the claimed messages and the preceding context window (a fixed number of earlier messages) from the conversation database, and the cards this space's pickup made that the board does not own.
3. Extract (below).
4. Apply the result through the action-item writer: create new cards, update or withdraw own cards, skip rejected ones.
5. Record the notice for this batch (pending) in runtime state, keyed by conversation and claimed range.
6. Move the bookmark to the claimed end and clear the claim with `compareAndSet`.

Every write is idempotent, so a rerun of the same range after a crash repeats work without duplicating it.

### Extraction

A dedicated action-item extractor replaces the summary extractor for this path. Input: the context window, the new messages (with position and author), and the space's own open cards. Output, per item:

- `add`: title, text, source message position, owner (a participant from the messages, or none);
- `update`: card id and the changed owner or text;
- `withdraw`: card id and the message that withdrew it.

An item cites a message from the new range or, for `update` and `withdraw`, an own card; anything else is dropped.

### Cards

- The writer is shared by the pickup and explicit requests, and always sets `origin`, `capturedAt`, `status: open`, `requestedBy` (the author of the source message), `assignedTo` (the owner, when one is named and resolves to a brain member) and the brain's memory visibility.
- A picked-up card's id derives from the conversation and its source message (`flatId(conversation id, "message", position, n)`), so a rerun upserts the same card.
- `projectedBodyHash` is stored as today, so a board edit makes the card board-owned and out of reach for later updates and withdrawals.
- Explicit requests go through the action board's `action_item_create` tool, which uses the same writer. Its `assignee` is required: `nobody` unless the request names someone, a member's name, or `me` when the caller takes it on; a name that is not a member is refused. `action-item` refuses `system_create` (`actionPolicy.create: never`), which cannot write a whole card.

### Notice

The worker cannot reach Discord, so the notice is a durable record plus a hint:

- The job writes the pending notice record and raises `channel-action-items:notice`. The chat interface observes it in the web process and posts the note into the space, reacting 📌 to each source message; on success it marks the record posted with the provider message id.
- On start the chat interface posts every notice record still pending, so a lost hint or a failed post is retried.
- The chat interface gets a generic space-notice capability for this: post a short text with per-item actions into a configured space, idempotent by record key.

### Undo

The Undo button carries the card id. The chat interface routes the click to the conversation-memory plugin in the web process, which deletes the card unless the board owns it (then it answers that the card has moved on the board), records `rejected:<card id>` in runtime state, and edits the note to show the card was removed. The pickup never recreates a rejected card.

## Failure handling

- **Extraction or a write fails:** the job fails and retries; the bookmark has not moved, so the batch is processed again.
- **Crash after writes, before the bookmark moves:** the claim expires; the next run reprocesses the range and upserts the same cards and notice record.
- **Posting fails:** the cards exist; the notice record stays pending and is posted on retry or start.
- **Two runs for one channel:** the claim lets only one write; the other stops.
- **A space is removed from the configuration:** no new wake-ups; its bookmark stays and resumes if the space returns.

## Phases

Each phase is one capability with its tests and evals, and lands on its own.

1. **Writer.** One action-item writer (`createActionItem`, with a board or conversation origin) behind the board and a new `action_item_create` tool; `action-item` refuses `system_create`. Tests pin the stored card's origin, `capturedAt`, `status`, `requestedBy`, assignee and visibility; agent evals check the tool is chosen with the right assignee for a self-assigned and an unassigned request.
2. **Pickup without a notice.** Bookmark, claim, wake-up, catch-up, the extractor's `add` items and card creation. Tests for the bookmark, claim takeover, rerun idempotence and catch-up; evals that a channel conversation yields the expected cards with owners, and none for chatter.
3. **Notice.** Space-notice capability in the chat interface, the pending-record flow and the 📌 reactions. Tests for posting once per batch and retry on start.
4. **Undo.** Routed action, delete, rejection record, edited note. Tests that a rejected card is never recreated and a board-owned card is kept.
5. **Revision.** `update` and `withdraw` against own cards, never board-owned ones. Evals for an owner change and a withdrawn item.
6. **Cleanup.** Remove the digest broadcast and its configuration, and the unused whole-conversation projector with its evals and its space eligibility check, which builds `<platform>:<composite channel id>` and so never matches a Discord space.

## Evals

The existing conversation-memory evals call `SummaryProjector` directly and pass while nothing in production runs it. The evals for this plan run through the pickup itself: messages stored in a space conversation, the job run, and the resulting cards checked for title, owner, `requestedBy`, `capturedAt`, `status` and visibility; plus negative cases (no cards for chatter or questions) and the revision cases.

The extractor's evals run through the conversation-memory plugin's `extractChannelActionItems` eval handler, with each message's speaker in its input; agent evals, whose caller is the brain's own agent, cover only tool choice and arguments.
