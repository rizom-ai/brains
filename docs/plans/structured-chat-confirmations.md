# Plan: structured chat confirmations and cards

## Status

In progress. First slices implemented: `AgentResponse` now carries shared structured `tool-approval` cards with explicit approval IDs, tool call IDs when available, input, state, and output/error payloads. `PendingConfirmation.id` is required across the runtime types and the public zod contract. Confirmation endpoints can pass the explicit approval id through to `AgentService`, which rejects stale/mismatched ids while preserving the existing conversation-level compatibility path.

Web-chat now translates Brain `ToolApprovalCard` objects to AI SDK UI's native tool stream chunks instead of the temporary custom `data-approval-card` protocol. AI SDK v6 has `tool-input-available`, `tool-approval-request`, `tool-output-available`, `tool-output-error`, and `tool-output-denied` chunks that produce `dynamic-tool` / `tool-*` UI parts with approval state. Web-chat still keeps a legacy `data-confirmation` fallback when an old response has `pendingConfirmation` without `cards`.

Discord and chat-repl should consume the Brain `ToolApprovalCard` contract directly. They do not need AI SDK stream chunks, but they should include/pass the same approval IDs.

## Context

Brains currently has an interface-agnostic confirmation flow in
`shell/ai-service`. Destructive tools such as `system_delete` return a
`pendingConfirmation`, and interfaces decide how to ask the user to approve or
decline.

This works, but it is not aligned with the broader Chat SDK / AI SDK direction,
where tool calls, approvals, artifacts, sources, reasoning, and other rich
outputs are represented as structured message parts/cards.

The web chat now uses AI SDK UI transport and AI Elements registry components.
Discord and chat-repl do not use AI Elements visually, but they can still render
the same structured chat events as Discord embeds/buttons or terminal prompts.

## Problem

The current confirmation flow is custom and loosely coupled to conversation
state:

- web-chat still uses a custom endpoint: `POST /api/chat/confirm`, now carrying `approvalId` during the transition
- Discord/chat-repl track pending confirmations separately
- confirmations are represented as structured cards in `AgentResponse`; web-chat translates them to AI SDK native tool chunks, while Discord/chat-repl still need to consume them
- approval execution is still tied mostly to a conversation rather than an explicit tool/action id
- UI can show misleading assistant text before the confirmed action actually succeeds — fixed by the result-integrity slice

This makes web-chat, Discord, and chat-repl diverge even though they are all
rendering the same underlying agent interaction.

## Goal

Move confirmations toward a shared structured chat-card protocol that can be
rendered consistently across interfaces:

```text
shared structured chat/tool event
        ↓
web-chat renderer   → AI Elements cards/tool approvals
Discord renderer    → embeds/buttons/components
chat-repl renderer  → terminal prompts/text cards
```

## Non-goals

- Do not make Discord depend on React or AI Elements.
- Do not remove existing confirmation safety guarantees.
- Do not execute destructive tools before explicit approval.
- Do not force all interfaces to have the same visual UX.

## Desired model

Represent pending approvals as structured message/tool parts with explicit IDs
and state. The internal cross-interface contract remains a small Brain-owned
approval-card shape; web-chat translates that shape to AI SDK UI's native tool
chunks.

Internal contract example:

```ts
interface ToolApprovalCard {
  id: string;
  toolCallId: string;
  toolName: string;
  input: Record<string, unknown>;
  description: string;
  state:
    | "approval-requested"
    | "approval-responded"
    | "output-available"
    | "output-denied"
    | "output-error";
}
```

The key requirement is that approvals are attached to explicit tool/action IDs,
not just a loose conversation-level boolean.

Web-chat translation target:

```ts
writer.write({
  type: "tool-input-available",
  toolCallId,
  toolName,
  input,
  dynamic: true,
  title: description,
});

writer.write({
  type: "tool-approval-request",
  approvalId,
  toolCallId,
});
```

Resolved approvals should stream native output chunks:

```ts
writer.write({
  type: "tool-output-available",
  toolCallId,
  output,
  dynamic: true,
});
writer.write({
  type: "tool-output-error",
  toolCallId,
  errorText,
  dynamic: true,
});
writer.write({ type: "tool-output-denied", toolCallId });
```

Custom `data-approval-card` should not be the final web-chat protocol.

## Work involved

### 1. Define the shared confirmation/card contract

First slice implemented. Shared runtime/public types now define `StructuredChatCard` / `ToolApprovalCard`, and `AgentResponse.cards` carries approval card state alongside the legacy `pendingConfirmation` compatibility field.

Touched areas:

```text
shell/plugins/src/contracts/agent.ts
shell/ai-service/src/agent-types.ts
shell/ai-service/src/agent-results.ts
```

The contract includes:

- stable approval/action id
- tool call id when available
- tool name
- input/args
- human-readable description
- approval state
- output/error payload when resolved

Implemented follow-up: approval execution can now validate the explicit approval/action id in addition to the conversation id. Remaining follow-up: move Discord/chat-repl rendering and button/prompt state to consume `AgentResponse.cards` directly instead of using the legacy `pendingConfirmation` field as the primary UI signal.

### 2. Update `shell/ai-service`

Relevant files:

```text
shell/ai-service/src/agent-service.ts
shell/ai-service/src/agent-machine.ts
shell/ai-service/src/agent-results.ts
```

Responsibilities:

- preserve tool-call metadata needed to resume/execute approved actions
- expose pending confirmations as structured approval cards
- prevent misleading assistant completion text while approval is pending
- execute approved actions by explicit approval/action id — first slice implemented as optional id validation on `confirmPendingAction`
- surface success/failure as structured output/error state

### 3. Update destructive tools

Relevant example:

```text
shell/core/src/system/entity-delete-tool.ts
```

Destructive tools should keep their safety guarantees, including confirmation
tokens, but return data that can be represented as structured approval cards.

Affected flows likely include:

- entity delete
- entity update
- destructive extract/rebuild operations
- any future destructive plugin tool

### 4. Update web-chat

Relevant package:

```text
interfaces/web-chat
```

Target behavior:

- render approval requests with AI Elements `Tool`/approval-style cards backed by AI SDK native tool parts — implemented for the pending approval request path
- translate `ToolApprovalCard` to AI SDK UI chunks (`tool-input-available`, `tool-approval-request`, `tool-output-*`) instead of custom `data-approval-card` — implemented for streamed agent responses
- remove or adapt custom `/api/chat/confirm` so approval is part of the shared structured tool/card flow; until then, it may remain as a bridge that carries `approvalId`
- show approval requested/responded/running/succeeded/failed states clearly
- avoid burying failures inside raw JSON

### 5. Update Discord

Relevant package:

```text
interfaces/discord
```

Discord should not use AI Elements, but should consume the same structured
approval contract.

Target behavior:

- render approval cards as Discord embeds/buttons/components
- button custom ids should include the explicit approval/action id
- stale approvals should fail safely
- multiple pending actions should not collide
- success/failure should be shown from the structured output/error state

User-facing Discord UX can remain familiar:

```text
Bot: Confirm delete "X"?
[Approve] [Decline]
Bot: Completed / Failed: ...
```

### 6. Update chat-repl

Relevant package:

```text
interfaces/chat-repl
```

Target behavior:

- render approval cards as terminal yes/no prompts
- bind response to explicit approval/action id
- show structured success/failure output

### 7. Tests

Add or update tests for:

- agent-service pending approval card creation
- approval by explicit id
- stale/invalid approval rejection
- confirmed success result
- confirmed failure result
- no misleading completion text before approval
- web-chat approval card rendering/endpoint behavior
- Discord approval button mapping
- chat-repl yes/no approval mapping

## Migration strategy

1. Keep the current `pendingConfirmation` behavior working while introducing the structured card shape.
2. Update web-chat in two steps:
   - short bridge: render structured card first, falling back to old `pendingConfirmation`;
   - final web-chat protocol: stream AI SDK native tool chunks and render `dynamic-tool` parts directly — implemented for initial approval cards; approval submission still uses `/api/chat/confirm` as a bridge.
3. Update Discord and chat-repl to consume the Brain structured card shape directly; they do not need AI SDK chunks.
4. Remove the old loose conversation-level confirmation boolean/endpoint once all interfaces use explicit approval IDs and web-chat approval submission is no longer endpoint-only.

## Risks

- Medium/high complexity because this touches shared agent flow and multiple
  interfaces.
- Risk of weakening destructive-action safety if confirmation tokens are not
  preserved carefully.
- Risk of breaking Discord/chat-repl if the shared contract changes too
  abruptly.

## Recommendation

Do this as a dedicated branch after the web-chat AI Elements migration lands.
It is worth doing because it aligns web-chat, Discord, and chat-repl around the
same structured chat/card substrate, but it should not be hidden inside the
current UI migration.
