# Conversation Speaker Attribution

## Status

Implemented for the first attribution pass. Conversation messages now preserve actor/source metadata through Discord and agent persistence, conversation-memory prompts are speaker-aware, summaries store participants, decision/action-item metadata stores explicit attribution when safely recoverable, and multi-speaker eval coverage is passing.

Partially implemented beyond the original first pass: canonical identity plumbing now exists (`canonicalId`, `CanonicalIdentityService`, agent enrichment, and memory retrieval by canonical id). The git-backed `canonical-identity-link` entity path was removed before adoption because raw actor-to-person links should not be treated as ordinary git-synced content.

Still deferred: auth-runtime-DB-backed canonical identity lookup, management UX/tooling for identity links, and a formal brain-instance assistant actor id.

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
- Using git-synced content as the primary store for private cross-platform identity bindings.
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

## Canonical identity storage boundary

Canonical identity has different privacy requirements than normal content. The durable content layer can describe people in a curated, non-secret way, but raw account bindings are private runtime state.

Decision:

1. **Runtime/private identity links are authoritative.**
   - Actor-to-person mappings such as `discord:<snowflake> -> person:daniel`, email addresses, OAuth subjects, passkey subjects, and other account identifiers belong in runtime storage, not git-synced `brain-data`.
   - Use the auth runtime database identity tables described in [Auth runtime database](./auth-runtime-db.md) as the source for actor enrichment and memory retrieval.
   - Do not add a separate JSON identity-link bridge unless the auth DB work is explicitly postponed again.
2. **Git-backed canonical identity entities are optional curated knowledge only.**
   - A content entity may describe a public or team-known person label such as `person:daniel`, preferred display name, or biography when the operator explicitly wants that in the brain's content corpus.
   - It must not contain raw platform ids, email addresses, OAuth subjects, passkey credential ids, or private account-link metadata.
   - It must not be required for permissions or authentication.
3. **Derived memory may store only safe canonical ids.**
   - Storing `canonicalId: person:<slug>` in summaries/decisions/action items is acceptable only when the id is an intentionally non-secret pseudonym/label.
   - Derived content should not store raw actor ids unless explicitly needed for provenance and the storage target is runtime-only.
   - If privacy mode is stricter, derived content can omit `canonicalId` and rely on the runtime identity index at retrieval time.
4. **Do not keep a git-backed identity-link entity type.**
   - The earlier `canonical-identity-link` entity path proved the shape, but it was removed before adoption.
   - If curated person/profile content is needed later, add a separate non-sensitive profile/alias entity that does not contain raw account bindings.

This split aligns with `multi-user.md`: auth users and identity bindings are runtime state; content may link to people only as curated knowledge, not as auth truth.

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

## Open questions

- Where should the actor/source schemas live: `shell/conversation-service`, `shell/plugins` contracts, or a shared package?
- What is the stable assistant actor id before there is a formal brain instance id in `AgentService`?
- Should raw actor ids appear in the LLM prompt, or only display names plus collision disambiguators?
- Should decision/action attribution fields be part of the first implementation slice, or follow after prompt attribution proves useful?

## Current remaining work

- Wire canonical identity lookup to the auth runtime database once user/identity tables exist.
- Keep git-backed person/canonical identity out of scope unless it is redesigned later as curated non-sensitive profile/alias content only.
- Add management tooling for canonical identity links that makes the storage boundary explicit.
- Replace the assistant fallback actor id with a formal brain-instance id when that service boundary exposes one.
- Consider richer attribution extraction later if we need requester/assignee attribution for delegated work where the requester and owner are different people.
