# Conversation Speaker Attribution

## Status

Implemented for the first attribution pass. Conversation messages now preserve actor/source metadata through Discord and agent persistence, conversation-memory prompts are speaker-aware, summaries store participants, decision/action-item metadata stores explicit attribution when safely recoverable, and multi-speaker eval coverage is passing.

Still deferred: cross-interface canonical identity linking and a formal brain-instance assistant actor id.

## Problem

Conversation memory currently sees messages mostly as role-labeled text:

```text
[time] user: ...
[time] assistant: ...
[time] system: ...
```

For Discord, the interface has the real author id and usually a display name, but normal chat drops that context before the message is persisted. As a result, summaries, decisions, and action items can only say "the user" unless the speaker name appears in message content.

This is not enough for team memory. Relay needs to preserve who said, decided, asked, or owns something without forcing the model to infer identity from prose.

## Goals

- Preserve stable speaker attribution for conversation messages.
- Keep display names available for readable summaries.
- Use stable ids for provenance and deduplication, not for normal user-facing prose.
- Let conversation-memory prompts distinguish multiple humans in the same space.
- Preserve backward compatibility for old messages with no speaker metadata.
- Avoid leaking raw Discord ids unless explicitly needed for debugging/provenance.

## Non-goals

- Full multi-user auth/session redesign.
- Cross-platform identity resolution beyond stable per-interface actor ids.
- A people/contact entity system.
- Retroactively attributing old messages that lack metadata.

## Proposed model

Add a small, explicit message attribution shape stored in conversation message metadata.

```ts
interface ConversationMessageActor {
  actorId: string; // stable namespaced id, e.g. "discord:123456789" or "brain:relay"
  canonicalId?: string; // optional future linked identity, e.g. "person:daniel"
  interfaceType: string; // "discord", "mcp", "cli", "agent", etc.
  role: "user" | "assistant" | "system";
  displayName?: string; // preferred readable name at the time of message
  username?: string; // platform username/handle fallback
  isBot?: boolean;
}

interface ConversationMessageSource {
  messageId?: string; // platform message id, e.g. Discord message id
  channelId?: string;
  channelName?: string;
  threadId?: string;
  metadata?: Record<string, unknown>; // interface-specific provenance, e.g. Discord guild id/name
}

interface ConversationMessageMetadata {
  actor?: ConversationMessageActor;
  source?: ConversationMessageSource;
}
```

Use `actor.actorId` as the stable per-interface identity and `actor.displayName ?? actor.username ?? actor.actorId` as the summary label. `canonicalId` is optional and should only be set when an identity-linking layer knows multiple interface actors represent the same human.

## Identity layering

Speaker identity has two layers:

1. **Actor identity**: required, stable within one interface namespace.
   - `discord:123456789`
   - `mcp:daniel`
   - `cli:local`
   - `brain:relay`
2. **Canonical person identity**: optional, cross-interface, and only present after explicit identity linking.
   - `person:daniel`
   - linked actors could include `discord:123456789`, `mcp:daniel`, and `github:daniel`

The first implementation should not try to infer cross-interface identity. It should persist actor ids now and leave room for `canonicalId` later. This keeps attribution reliable while allowing future memory retrieval to merge activity from the same person across Discord, MCP, CLI, or other interfaces.

## Data flow

### Discord interface

Discord already has:

- `discordMessage.author.id`
- `discordMessage.author.username`
- `discordMessage.author.globalName`
- guild member display names/nicknames when available
- `discordMessage.id`
- channel/thread/guild ids

Pass these through `AgentService.chat()` in `ChatContext`.

Preferred user display label:

1. guild member display name / nickname when available
2. `author.globalName`
3. `author.username`
4. `author.id`

Stable actor id:

```ts
`discord:${discordMessage.author.id}`;
```

### Agent service

Extend `ChatContext` with optional actor/source metadata. When saving the incoming user message, persist that metadata.

Assistant responses should also get actor metadata. Use a brain/bot actor, for example:

```ts
actorId: `brain:${brainIdOrName}`
role: "assistant"
displayName: brain display name or "Assistant"
```

If no brain id is available in this layer, use a stable local fallback now and improve later.

### Conversation service

Do not make attribution required at the database level. Existing rows remain valid.

Add Zod helpers for parsing message metadata so consumers do not read ad hoc JSON. Invalid or missing metadata should parse to an empty object rather than breaking summaries.

### Conversation memory

Update prompt formatting from role-only to speaker-aware labels.

Examples:

```text
1. [2026-05-06T10:00:00.000Z] Mira (discord:123..., user): Let's keep Relay focused on team memory.
2. [2026-05-06T10:02:00.000Z] Daniel (discord:456..., user): I can update the eval fixtures.
3. [2026-05-06T10:03:00.000Z] Relay (assistant): Captured.
```

For normal prompts, include raw ids only when useful to disambiguate duplicate display names. A safer default is:

```text
Mira [user]: ...
Daniel [user]: ...
Relay [assistant]: ...
```

with stable ids available in metadata/provenance.

Extraction instructions should say:

- Preserve named speakers when a decision/action is explicitly attributed.
- Do not infer owners from proximity alone.
- Prefer display names in prose.
- Use stable actor ids in structured metadata when fields exist.

## Entity implications

### Summary

Add optional participant metadata:

```ts
participants?: Array<{
  actorId: string;
  displayName?: string;
  roles: Array<"user" | "assistant" | "system">;
}>;
```

Summaries can remain narrative-only, but the metadata should show which speakers contributed to the source conversation.

### Decision

Consider optional attribution fields:

```ts
decidedBy?: Array<{ actorId: string; displayName?: string }>;
mentionedBy?: Array<{ actorId: string; displayName?: string }>;
```

Only populate `decidedBy` when the conversation explicitly attributes the decision or the speaker personally makes the decision.

### Action item

Consider optional owner/requester fields:

```ts
assignedTo?: Array<{ actorId?: string; displayName: string }>;
requestedBy?: Array<{ actorId: string; displayName?: string }>;
```

Only populate `assignedTo` when explicit. Do not convert every first-person statement into an owner unless it is clearly an action commitment.

## Implementation slices

### Slice 1: Contracts and persistence

- Add actor/source types and Zod schemas in the conversation-service or a shared plugin contract.
- Extend `ChatContext` with optional actor/source fields.
- Save user message metadata in `AgentService.processMessage()`.
- Save assistant message metadata.
- Add unit tests for metadata persistence.

### Slice 2: Discord attribution

- Build actor/source metadata in `DiscordInterface.routeToAgent()`.
- Pass Discord author id, display label, message id, channel/thread/guild ids.
- Add tests for Discord context construction if the existing Discord test harness supports it; otherwise extract a small pure helper and test that.

### Slice 3: Summary prompt attribution

- Add a metadata parser/formatter for conversation messages.
- Update `entities/conversation-memory/src/lib/summary-prompt.ts` to use speaker labels.
- Test:
  - named Discord users appear in prompt labels
  - duplicate/unknown users fall back safely
  - old metadata-less messages still format as `user` / `assistant`

### Slice 4: Derived memory attribution

Implemented:

- Added participant metadata to summaries.
- Added optional `decidedBy` / `mentionedBy` metadata to decisions.
- Added optional `assignedTo` / `requestedBy` metadata to action items.
- Added tests that explicit speaker-owned decisions/actions survive projection.

### Slice 5: Evals

Add or update conversation-memory evals with a Discord-like multi-speaker transcript:

- Mira makes a decision.
- Daniel accepts an action item.
- Assistant suggests something that is not accepted.

Expected behavior:

- summary mentions Mira/Daniel correctly
- decision is attributed to Mira only when explicit
- action item owner is Daniel only when explicit
- assistant recommendation is not recorded as a decision

## Open questions

- Where should the actor/source schemas live: `shell/conversation-service`, `shell/plugins` contracts, or a shared package?
- What is the stable assistant actor id before there is a formal brain instance id in `AgentService`?
- Should raw actor ids appear in the LLM prompt, or only display names plus collision disambiguators?
- Should decision/action attribution fields be part of the first implementation slice, or follow after prompt attribution proves useful?

## Current remaining work

Tracked in `conversation-identity-followup.md`:

- Add cross-interface `canonicalId` identity linking only after an explicit identity layer exists.
- Replace the assistant fallback actor id with a formal brain-instance id when that service boundary exposes one.
- Consider richer attribution extraction later if we need requester/assignee attribution for delegated work where the requester and owner are different people.
