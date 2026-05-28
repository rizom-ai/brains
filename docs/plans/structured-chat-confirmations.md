# Plan: structured chat confirmations and cards

## Status

In progress. First slices implemented: `AgentResponse` now carries shared structured `tool-approval` cards with explicit approval IDs, tool call IDs when available, input, state, and output/error payloads. `PendingConfirmation.id` is required across the runtime types and the public zod contract. Confirmation endpoints can pass the explicit approval id through to `AgentService`, which rejects stale/mismatched ids while preserving the existing conversation-level compatibility path.

Web-chat now translates Brain `ToolApprovalCard` objects to AI SDK UI's native tool stream chunks instead of the temporary custom `data-approval-card` protocol. AI SDK v6 has `tool-input-available`, `tool-approval-request`, `tool-output-available`, `tool-output-error`, and `tool-output-denied` chunks that produce `dynamic-tool` / `tool-*` UI parts with approval state. Web-chat approval submission now uses native AI SDK `approval-responded` parts through `/api/chat`; the legacy `/api/chat/confirm` side-channel and `data-confirmation` fallback have been removed.

Discord now consumes the Brain `ToolApprovalCard` contract directly for embeds/buttons and explicit approval IDs, including multiple pending approval cards in the same conversation. Chat-repl now consumes the same card contract for terminal prompts, including indexed `yes 1` / `no 1` responses when multiple approvals are pending. Evaluation runners also preserve and submit approval IDs, including remote MCP HTTP confirmations. Neither interface needs AI SDK stream chunks.

## Layered summary

What changes per layer, and where each layer is today:

| Layer                 | Today                                                             | Bridge state | Final state                                                             |
| --------------------- | ----------------------------------------------------------------- | ------------ | ----------------------------------------------------------------------- |
| Brain agent emits     | `pendingConfirmation` + `cards: ToolApprovalCard[]`               | same         | same (Brain stays interface-agnostic)                                   |
| Web-chat wire format  | AI SDK native `tool-*` chunks                                     | same         | `tool-input-available` + `tool-approval-request` + `tool-output-*` only |
| Web-chat submission   | AI SDK `approval-responded` dynamic-tool part through `/api/chat` | same         | `/api/chat` only; no side-channel POST                                  |
| Discord wire format   | `response.cards` rendered as embeds/buttons, text fallback        | same         | `response.cards` is the primary signal                                  |
| Chat-repl wire format | `response.cards` for approval id, text fallback                   | same         | `response.cards` is the primary signal                                  |

Translation between Brain cards and AI SDK chunks lives in **web-chat**, not in the agent. The agent keeps emitting Brain `ToolApprovalCard` so Discord and chat-repl never have to learn the SDK wire format. If translation later moves into the agent, Brain becomes SDK-coupled — currently rejected.

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

Web-chat, Discord, and chat-repl render the same underlying agent interaction in three different shapes — see the Layered Summary above for the per-layer state. The shared concern across all three is that approval execution is still tied to a conversation rather than an explicit tool/action id, which is what makes them diverge in the first place. (Misleading assistant text before a confirmed action succeeded was a related symptom; it's already fixed by the result-integrity slice.)

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
  summary: string; // short title; identical pre and post approval
  preview?: string; // optional pre-approval detail; dropped post-approval
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

### State lifecycle notes

- `approval-responded` is an SDK-defined intermediate state ("user has decided, action not yet executed"). Brain's `executeConfirmedAction` currently jumps `approval-requested` → `output-*` directly and never produces `approval-responded`. **Decision:** keep it that way for now — the executing-an-approval window is short and the existing "Confirmation required." → "Completed/Failed" transition reads fine. Revisit only if a destructive tool grows long enough latency that users need an intermediate "executing your approval…" state.
- `approval.reason` (an SDK-side optional free-text field on `approval-responded`/`output-denied`) is **not** carried on Brain's `ToolApprovalCard`. **Known omission:** if/when interfaces want to capture user-supplied decline reasons ("no, wrong note"), add a `reason?: string` slot to the card and propagate it through `confirmPendingAction`. Until then, declines are reasonless.

### Web-chat translation target

Two wire-level distinctions matter when mapping Brain cards to AI SDK UI:

- **The stream chunk** the writer emits is _flat_: `{ type: "tool-approval-request", approvalId, toolCallId }`.
- **The resulting `UIToolInvocation` UI part** the renderer sees is _nested_: `{ state: "approval-requested", approval: { id, ... } }`.

This is why `ConfirmationPart` reads both `data.id` and `data.approval?.id` — the same approval ID lives at different paths depending on which shape you're looking at.

Pending approval — writer chunks:

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

Resolved approvals — writer chunks:

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

Implemented follow-up: approval execution now tracks all pending approval/action ids for a conversation and executes the matching id, instead of overwriting earlier pending actions. Discord now renders approval cards as embeds/buttons and passes explicit approval ids for both button clicks and text yes/no fallback. Chat-repl now binds terminal yes/no responses to explicit approval ids from `AgentResponse.cards`.

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
- execute approved actions by explicit approval/action id — implemented, including multiple simultaneous pending approvals per conversation
- surface success/failure as structured output/error state
- summarize confirmed results without repeating destructive preview text or raw success JSON

### 3. Update destructive tools

Relevant example:

```text
shell/core/src/system/entity-delete-tool.ts
```

Destructive tools should keep their safety guarantees, including confirmation
tokens, but return data that can be represented as structured approval cards.
Affected flows likely include:

- entity delete (`shell/core/src/system/entity-delete-tool.ts`)
- entity update (`shell/core/src/system/entity-update-tool.ts`)
- destructive extract/rebuild operations (`shell/core/src/system/entity-extract-tool.ts`)
- any future destructive plugin tool

### 4. Update web-chat

Relevant package:

```text
interfaces/web-chat
```

Target behavior:

- render approval requests with AI Elements `Tool`/approval-style cards backed by AI SDK native tool parts — implemented for the pending approval request path
- translate `ToolApprovalCard` to AI SDK UI chunks (`tool-input-available`, `tool-approval-request`, `tool-output-*`) instead of custom `data-approval-card` — implemented for streamed agent responses
- show approval requested/responded/running/succeeded/failed states clearly
- avoid burying failures inside raw JSON
- post-approval native tool output renders a summarized status instead of raw success JSON

#### Submission mechanism change

The biggest architectural shift in this slice is **how the client tells the server "approved/declined"**, not just how the server renders the request.

| Aspect             | Native AI SDK                                                                                               |
| ------------------ | ----------------------------------------------------------------------------------------------------------- |
| Wire               | `approval-responded` dynamic-tool UI part on the next `/api/chat` request                                   |
| Server entrypoint  | regular `/api/chat` POST; WebChatInterface reads the approval response out of the incoming UI message parts |
| Transport coupling | rides the existing AI SDK transport                                                                         |

Current migration state: native approval-response handling is implemented and is the only web-chat approval submission path via `addToolApprovalResponse` + `lastAssistantMessageIsCompleteWithApprovalResponses`.

### 5. Update Discord

Relevant package:

```text
interfaces/discord
```

Discord should not use AI Elements, but should consume the same structured
approval contract.

Implemented behavior:

- renders approval cards as Discord embeds/buttons/components
- button custom ids include the explicit approval/action id
- stale approvals fail safely
- text yes/no fallback passes the explicit approval/action id

Implemented follow-up behavior:

- multiple simultaneous pending actions do not collide; Discord stores every pending approval id and button custom ids select the exact action
- success/failure is shown from the structured output/error state

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

Implemented behavior:

- render approval cards as terminal yes/no prompts
- bind response to explicit approval/action id
- support multiple pending approvals with indexed `yes 1` / `no 1` responses
- show structured success/failure output

### 7. Tests

Shared across modes:

- agent-service pending approval card creation
- approval by explicit id
- stale/invalid approval rejection
- confirmed success result
- confirmed failure result
- no misleading completion text before approval
- post-approval results omit preview content and raw success JSON

Web-chat — native mode:

- agent emits a `tool-approval-request` chunk with the same approval id as the Brain card
- a synthetic next-turn message with an `approval-responded` dynamic-tool part triggers `executeConfirmedAction`
- denied responses produce `tool-output-denied`, not just declined-as-text

Per-interface:

- Discord approval button custom-ids carry the explicit approval id; stale buttons fail safely — implemented
- chat-repl yes/no prompt binds to the explicit approval id — implemented
- evaluation confirmation turns pass explicit approval ids, either from the prior single pending action or from `turn.approvalId` — implemented

## Migration strategy

1. Keep the current `pendingConfirmation` behavior working while introducing the structured card shape.
2. Update web-chat in two steps:
   - short bridge: render structured card first, falling back to old `pendingConfirmation`;
   - final web-chat protocol: stream AI SDK native tool chunks and render `dynamic-tool` parts directly — implemented for approval requests and approval-response submission; `/api/chat/confirm` has been removed.
3. Update Discord and chat-repl to consume the Brain structured card shape directly; they do not need AI SDK chunks. Discord and chat-repl approval-id binding are implemented.
4. Remove the old loose conversation-level confirmation boolean/endpoint once all interfaces use explicit approval IDs and web-chat approval submission is no longer endpoint-only.

## Risks

- Medium/high complexity because this touches shared agent flow and multiple
  interfaces.
- Risk of weakening destructive-action safety if confirmation tokens are not
  preserved carefully.
- Risk of breaking Discord/chat-repl if the shared contract changes too
  abruptly.
- Approval-id drift between Brain `ToolApprovalCard.id` and the AI SDK
  `approval.id` it gets translated to. They are meant to be the same string,
  but nothing currently enforces it at the translation seam — a test that
  round-trips one through the other should be part of the native-mode slice.

## Recommendation

Next slice: remove remaining loose conversation-level confirmation compatibility once downstream callers no longer depend on `pendingConfirmation` without an explicit approval id.
