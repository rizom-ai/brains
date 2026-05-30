# Conversation Memory

## Status

Phases 1–4 shipped: scoped projection from stored conversations; `summary` /
`decision` / `action-item` derived entities with provenance; a
`ConversationMemoryRetriever` with same-space ranking; and same-space
agent-context injection with provenance and fail-closed visibility.

Remaining work is product hardening — making injected memory **observable and
trustworthy** — without expanding the data model. Two active workstreams below.

## Operating rules (settled, implemented)

The rules the shipped system runs on; kept as context for the remaining work.

- One Relay brain = one team. Start with Relay.
- Shared team conversation locations are top-level `spaces` in instance
  `brain.yaml`, alongside `anchors` and `trusted`. Entries are canonical
  selectors (`discord:123`, `discord:project-*`).
- Missing/empty `spaces` disables automatic summaries — never guess, never fall
  back to all conversations. Surface that no spaces are configured in logs.
- Relay v1 does not summarize conversations outside `spaces`, even on an
  in-conversation request. Operators opt a space in via `brain.yaml`.
- Summary triggering: a 90-second delayed coalesced projection that rereads
  stored messages and the existing summary, then the AI decides
  `skip` / `update` / `append`. Explicit rebuild bypasses the delay but not the
  `spaces` boundary.
- Summaries are narrative-only; decisions and action items are separate derived
  entities, not embedded lifecycle fields.
- Memory visibility is per-preset and fail-closed: Relay → `shared` (the team is
  the audience), personal/Rover → `restricted`; unconfigured falls closed to
  `restricted`, never `public`.
- Same-space memory is high-priority context; retrieval carries source
  conversation/space/time provenance and goes through one explicit contract
  (`agent:context:request`), not blanket prompt injection.

## Active workstream: hardening

### 1. Future-use evals against full agent behavior

Retrieval is currently covered only by the deterministic `buildAgentContext`
eval handler — it proves the retriever returns the right items, not that the
agent _uses_ them well. Initial Relay full-agent regression coverage now
exercises same-space use, relevance, conflict handling, provenance, and
cross-space isolation. Keep expanding evals that exercise the full agent turn:

- a later conversation retrieves and uses relevant same-space summary context;
- unrelated or old summary is not injected or relied on;
- conflicting memory is ignored (the injection prompt instructs this — verify it
  holds in practice);
- provenance survives into how the agent references the memory;
- cross-space isolation: an other-space conversation gets no same-space context.

Run these against real agent behavior, not just the retriever, so they catch
regressions in the injection prompt, ranking, and visibility scoping together.

### 2. Per-turn memory auditability

Before adding operator UI or controls, make injected memory observable in
structured logs. For each agent turn, log whether conversation memory was
considered, what was injected, and why each item was eligible.

Include:

- conversation id, interface, channel, and resolved same-space id;
- caller permission level and visibility scope;
- injected item ids, entity types, source conversations, scores, and updated
  timestamps;
- no-memory reasons where possible, such as no channel context, no same-space
  memory, or visibility-filtered memory.

This should answer “what memory did Relay use in this response?” without
expanding policy or adding UI.

## Explicitly deferred (do not bundle in)

- **Rolling space-level memory** — memory spanning multiple conversations in a
  space. When built it is a **new `space-memory` entity type**, not another
  `summary` scope (keeps `summary` from becoming a kitchen sink, consistent with
  the `decision` / `action-item` split). Not now.
