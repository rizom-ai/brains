# Plan: structured chat confirmations and cards

## Status

In progress. First slices implemented: `AgentResponse` now carries shared structured `tool-approval` cards with explicit approval IDs, tool call IDs when available, input, state, and output/error payloads. `PendingConfirmation.id` is required across the runtime types and the public zod contract. Confirmation endpoints can pass the explicit approval id through to `AgentService`, which rejects stale/mismatched ids while preserving the existing conversation-level compatibility path. Web-chat emits a dedicated `data-approval-card` stream (with a legacy `data-confirmation` fallback) and `formatConfirmationResult` prefers the card's `state` and `output` over the legacy `toolResults`/`Result:` text parsing.

Discord and chat-repl still consume only `response.text`. They now correctly render the `Failed:`/`Completed:` distinction but do not yet read the structured cards.

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
- confirmations are only partially represented as structured chat/tool card events
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
and state, for example:

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

The exact shape should follow AI SDK / Chat SDK conventions where possible.
The key requirement is that approvals are attached to explicit tool/action IDs,
not just a loose conversation-level boolean.

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

Implemented follow-up: approval execution can now validate the explicit approval/action id in addition to the conversation id. Remaining follow-up: move more interface rendering and button/prompt state to consume `AgentResponse.cards` directly instead of using the legacy `pendingConfirmation` field as the primary UI signal.

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

- render approval requests with AI Elements `Tool`/approval-style cards
- remove or adapt custom `/api/chat/confirm` so approval is part of the shared
  structured tool/card flow
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

1. Keep the current `pendingConfirmation` behavior working while introducing the
   structured card shape.
2. Update web-chat to render the structured card first, falling back to old
   `pendingConfirmation` only during transition.
3. Update Discord and chat-repl to consume the structured shape.
4. Remove the old loose conversation-level confirmation boolean/endpoint once
   all interfaces use explicit approval IDs.

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
