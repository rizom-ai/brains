# Conversation Memory Plugin

`@brains/conversation-memory` reads and evaluates durable team memory entities.

## Model

The package owns four conversation-derived entity types:

- `summary` — narrative memory, one markdown entity per conversation
- `decision` — first-class decisions with provenance and status
- `insight` — what a conversation learned or concluded, with provenance and status
- `action-item` — first-class follow-up work with provenance and lifecycle status

In a chat space the brain is configured for, the channel pickup turns new messages into action items and decisions: a job per conversation, woken by each stored message, reads the messages past a bookmark in runtime state and writes what it finds under ids derived from the source message. A later message that overturns a decision the pickup wrote and nobody has edited marks it `superseded` and names the decision that replaced it. What a batch added is announced in the space in one notice, each line with an Undo; an Undo takes back a card the board has not touched or a decision nobody has edited, and the pickup never writes it again. A decision can also be recorded by hand through `system_create`, at `shared` or `restricted` visibility. Nothing writes summaries; stored ones remain available to retrieval, agent context, dashboards, templates and datasources.

## Summary schema

Each summary entry contains:

- `title`
- `summary`
- `timeRange.start` / `timeRange.end`
- `sourceMessageCount`
- `keyPoints`

Decisions and action items are extracted from the same conversation pass but stored as separate entities, not embedded in summary entries.

## Memory retrieval

`ConversationMemoryRetriever` is the explicit retrieval contract for using conversation memory as context. It accepts a query plus either a conversation id or an interface/channel pair, scopes results to that same conversation space by default, and returns ranked memory with conversation, space, timestamp, and score provenance. Cross-space retrieval is opt-in with `includeOtherSpaces`.

The plugin registers an agent-context provider so relevant same-space summaries, decisions, and action items can be injected into the agent turn with provenance. Eval handlers expose both layers:

- `retrieveMemory` tests the retrieval contract directly.
- `buildAgentContext` tests the injected agent-context payload.

## Validation

```bash
bun run typecheck
bun test
bun run lint
```
