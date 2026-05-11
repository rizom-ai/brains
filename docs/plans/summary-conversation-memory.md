# Conversation Memory

## Status

Partial. `@brains/conversation-memory` now has scoped projection from stored conversations, summary/decision/action-item entities, dashboard widgets, and `ConversationMemoryRetriever`. Remaining work: tighten broader future-use evals and settle the open policy questions below.

## Settled decisions

- Start with Relay.
- One Relay brain represents one team.
- Shared team conversation locations are top-level `spaces` in instance `brain.yaml`, alongside `anchors` and `trusted`.
- `spaces` entries are canonical selectors, e.g. `discord:123` or `discord:project-*`.
- Missing or empty `spaces` disables automatic summaries; do not guess.
- Relay v1 does not summarize conversations outside `spaces`.
- Summary triggering uses a 90-second delayed coalesced projection, not a message-count threshold.
- The delayed projection rereads stored messages and existing summary before acting.
- AI decides `skip` / `update` / `append`.
- Keep summaries narrative-only.
- Store decisions and action items as separate derived entity types with provenance and status.

## Thesis

`@brains/conversation-memory` should provide durable memory for team conversations.

It should answer:

- What happened in this team conversation?
- What context should a teammate or future assistant understand later?
- Which conversations/spaces are summarized, stale, skipped, or unsummarized?

Decisions and action items are separate derived entities, not embedded lifecycle fields inside summaries.

## Current state

Today, the package projects conversation memory from stored messages:

- one `summary` entity per conversation for narrative memory
- zero or more `decision` entities for explicit decisions
- zero or more `action-item` entities for concrete follow-up work

Each entity has conversation/channel/space provenance, source time ranges, source message counts, and projection version.

This is a good foundation, but it is still mostly passive. It makes stored conversations readable, but it does not yet define memory policy, retrieval semantics, space coverage, or dashboard behavior.

## Directional decision: active memory, not just passive entity

Recommendation: make `summary` active enough to decide what team conversations become durable prose memory, without turning it into a kitchen-sink memory entity.

Stages:

1. **Scoped durable summaries** — summarize only configured team `spaces`.
2. **AI projection decisions** — decide `skip` / `update` / `append` from stored messages plus existing summary.
3. **Memory dashboard** — show coverage, stale spaces, skipped conversations, and recent summaries.
4. **Separate memory entities** — `decision` / `action-item` are first-class derived entities.
5. **Context retrieval** — expose relevant summaries and memory entities intentionally, not via blanket prompt injection.

## Relay-first policy: where does team memory live?

Start with Relay. For Relay, one brain represents one team.

A team is a stable group doing shared work. The important boundary is not interface type, and not whether a channel looks "persistent". The boundary is: **where does this team converse?**

Use the same instance-level convention as `anchors` and `trusted`: top-level canonical selectors in `brain.yaml`.

```yaml
anchors:
  - discord:123456789

trusted:
  - discord:456789123

spaces:
  - discord:987654321
  - discord:project-*
  - mcp:weekly-sync
```

`spaces` means: shared conversation spaces for this brain/team. Conversations in these spaces may become durable team memory. Entries support the same wildcard style used elsewhere for selectors, so operators can list exact spaces or patterns.

### Definitions

- **Conversation**: one stored conversation id with messages.
- **Space**: a configured shared conversation location, written as `<interfaceType>:<channelId>`.
- **Space selector**: an exact space id or wildcard pattern, e.g. `discord:987654321` or `discord:project-*`.
- **Relay team boundary**: the Relay brain instance itself. One Relay brain = one team.
- **Team conversation**: a stored conversation whose canonical space id matches a configured `spaces` entry.

### Recommended Relay default policy

For Relay, automatic summaries should consider only conversations in configured `spaces`.

If `spaces` is missing or empty, automatic summaries are disabled. The system should not guess or fall back to all conversations. It should surface that no shared spaces are configured, first through logs and later through the dashboard.

For Relay v1, conversations outside `spaces` should not be summarized, even by an in-conversation request. If a space should become team memory, the brain operator must explicitly add that space to `brain.yaml`. This makes the memory boundary visible and avoids surprising channel participants.

### Configuration shape

Add top-level instance config, not summary-plugin-local config and not hardcoded Relay model defaults:

```ts
spaces: string[]; // exact selectors and wildcard patterns
```

`spaces` is deployment-specific, like `anchors`. It belongs in each instance's `brain.yaml` because channel/room ids differ per deployed team.

This parallels existing selectors:

```ts
anchors: string[];
trusted: string[];
spaces: string[];
```

The summary projection can compute the conversation space id from stored conversation metadata and match it against `spaces` selectors:

```ts
const spaceId = `${conversation.interfaceType}:${conversation.channelId}`;
```

### Eligibility result

Projection should compute an explicit eligibility result for observability:

```ts
{
  eligible: boolean;
  reason:
    | "configured-space"
    | "no-spaces-configured"
    | "space-not-configured"
    | "system-only"
    | "ai-skip";
}
```

Store enough of this in metadata or logs to explain dashboard coverage.

## When do spaces get summaries?

There are different moments with different goals.

### 1. Delayed coalesced projection

Purpose: summarize useful team memory shortly after work happens, without relying on brittle message-count thresholds and without firing while people are still typing.

When a message arrives in a configured `space`:

- if no projection is already scheduled for that conversation, schedule one for `settleDelaySeconds` later
- default `settleDelaySeconds`: 90
- additional messages before the scheduled job runs do not create more jobs and do not push the job out forever
- when the job runs, it rereads stored messages and the existing summary

The AI then decides:

```ts
action: "skip" | "update" | "append";
reason: string;
```

- `skip`: no durable team memory worth writing
- `update`: the latest messages continue/refine the current summary entry
- `append`: the latest messages introduce a new decision/topic/context entry

This keeps the good part of the old digest path — AI decides whether to update or create a new entry — but removes digest events as source of truth and adds an explicit skip path.

Explicit rebuild commands bypass the delay, but not the `spaces` boundary.

### 2. Backfill / initial sync

Purpose: populate memory when existing content is imported or a brain starts with stored conversations.

On initial sync:

- list conversations
- apply space eligibility policy
- project missing or stale summaries
- skip already-current summaries by source hash and projection version

### 3. Explicit rebuild/extract

Purpose: operator control.

`system_extract` or equivalent should support:

- rebuild one configured-space conversation
- rebuild one configured space
- rebuild all eligible conversations

For Relay v1, explicit rebuild does not bypass `spaces`.

### 4. Rolling space memory

Purpose: provide space-level memory across multiple conversations.

Do not attempt this in the first follow-up commit, but plan for it.

Potential trigger:

- after N summarized conversations in a space
- daily/periodic projection
- when space summary is stale relative to latest conversation summary

This should produce a space memory artifact separate from per-conversation summaries, e.g. a derived `space-memory` or a scoped summary entity.

## Schema decision

A summary remains one derived prose-memory entity per conversation. Summary entries contain narrative summary, time range, source message count, and key points.

Decisions and action items are separate derived entity types:

- `decision`: explicit accepted decisions, with provenance and status
- `action-item`: explicit follow-up work, with provenance and lifecycle status

This avoids making `summary` a kitchen sink.

## Retrieval and context use

Summaries should be searchable as normal entities, but future agent behavior needs a more precise retrieval contract.

Proposed behavior:

- Same-space memory is high-priority context.
- Retrieval includes source conversation/space/time provenance.
- `summary`, `decision`, and `action-item` entities are retrieved through one explicit contract.

Avoid automatic blanket prompt injection. Prefer an explicit memory retrieval step that can be evaluated.

## Dashboard direction

The dashboard should not be a generic “Summaries” list long-term.

It should be a **Conversation Memory** view showing:

- summary coverage: summarized vs unsummarized eligible conversations
- stale summaries: conversations with new messages not yet summarized
- recent summarized conversations
- active spaces with memory
- excluded/skipped spaces when useful for debugging

The small committed `ListWidget` is acceptable as a placeholder, but the real widget should be built after the schema/policy decisions are clearer.

## Evals needed

Current evals test summary generation. Add memory-behavior evals:

1. **Space eligibility**
   - conversation in configured `spaces` is eligible
   - conversation outside configured `spaces` is not automatic team memory
   - empty `spaces` config does not silently summarize everything
   - system-only conversation does not summarize
   - short low-signal conversation is skipped
   - short but decision-heavy conversation is summarized after settle

2. **Projection decisions**
   - AI skips low-signal conversations
   - AI updates the current entry for continuation/refinement
   - AI appends a new entry for a new topic/context shift
   - existing summary is considered during skip/update/append decisions

3. **Future-use behavior**
   - later conversation can retrieve relevant same-space summary context
   - unrelated old summary is not injected/used
   - summary provenance is preserved when used as context

4. **Dashboard data**
   - coverage counts are correct
   - stale summaries are detected
   - skipped conversations are explainable

## Implementation plan

### Phase 1 — policy and observability

- Add top-level `spaces` instance config support.
- Add a Relay-oriented eligibility helper with unit tests.
- Replace message-count projection triggering with a 90-second delayed coalesced projection per conversation.
- Add AI projection decision: `skip` / `update` / `append`, using stored messages plus existing summary.
- Apply space eligibility to delayed projection and rebuild-all.
- Add metadata/logging for skipped conversations.
- Add eval/test cases for space eligibility and AI skip/update/append decisions.

### Phase 2 — dashboard

- Replace placeholder `Summaries` list with a purpose-built `Conversation Memory` widget.
- Use summary metadata and eligibility state rather than parsing display markdown.

### Phase 3 — decision/action entities

- Add separate derived entity types only when needed: `decision` and `action-item`.
- Give them their own schema, provenance, lifecycle, and evals.
- Do not embed this lifecycle inside `summary`.

### Phase 4 — context retrieval

- Add explicit memory retrieval contract. ✅ `ConversationMemoryRetriever`
- Rank by space, recency, and relevance. ✅ same-space first, search score, then updated time
- Add future-use evals before enabling automatic behavior broadly. In progress: unit/eval-handler coverage exists; broader behavior evals still needed before prompt injection.

## Open questions

1. Should space-level rolling memory be a new entity type or another `summary` scope?
2. Should skipped conversations be logs only at first, or dashboard-computed state?
3. Should summaries be private/system memory only, or visible as normal site/content entities by default?
