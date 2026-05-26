# Plan: structured chat confirmations and cards

## Status

In progress. First slices implemented: `AgentResponse` now carries shared structured `tool-approval` cards with explicit approval IDs, tool call IDs when available, input, state, and output/error payloads. `PendingConfirmation.id` is required across the runtime types and the public zod contract. Confirmation endpoints can pass the explicit approval id through to `AgentService`, which rejects stale/mismatched ids while preserving the existing conversation-level compatibility path.

Web-chat now translates Brain `ToolApprovalCard` objects to AI SDK UI's native tool stream chunks instead of the temporary custom `data-approval-card` protocol. AI SDK v6 has `tool-input-available`, `tool-approval-request`, `tool-output-available`, `tool-output-error`, and `tool-output-denied` chunks that produce `dynamic-tool` / `tool-*` UI parts with approval state. Web-chat still keeps a legacy `data-confirmation` fallback when an old response has `pendingConfirmation` without `cards`.

Discord and chat-repl should consume the Brain `ToolApprovalCard` contract directly. They do not need AI SDK stream chunks, but they should include/pass the same approval IDs.

## Layered summary

What changes per layer, and where each layer is today:

| Layer                           | Today                                               | Bridge state                                    | Final state                                                                |
| ------------------------------- | --------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------- |
| Brain agent emits               | `pendingConfirmation` + `cards: ToolApprovalCard[]` | same                                            | same (Brain stays interface-agnostic)                                      |
| Web-chat wire format            | custom `data-approval-card` part                    | custom part + native `tool-*` parts in parallel | `tool-input-available` + `tool-approval-request` + `tool-output-*` only    |
| Web-chat submission             | `POST /api/chat/confirm` with `approvalId`          | same                                            | `tool-approval-response` part on the next user turn (no side-channel POST) |
| Discord / chat-repl wire format | `response.text`                                     | `response.cards` for state, text for fallback   | `response.cards` is the primary signal                                     |

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
- show approval requested/responded/running/succeeded/failed states clearly
- avoid burying failures inside raw JSON

#### Submission mechanism change

The biggest architectural shift in this slice is **how the client tells the server "approved/declined"**, not just how the server renders the request.

| Aspect             | Today / bridge                                                       | Native AI SDK                                                                                |
| ------------------ | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Wire               | `POST /api/chat/confirm` with `{ id, approvalId, confirmed }`        | `tool-approval-response` content part on the next user message                               |
| Server entrypoint  | `WebChatInterface.handleConfirm` → `agent.confirmPendingAction(...)` | regular `/api/chat` POST; AgentService reads the approval-response part out of the next turn |
| Transport coupling | side-channel REST endpoint                                           | rides the existing AI SDK transport                                                          |

Migration order: keep `POST /api/chat/confirm` working as the bridge submission path. Add native `tool-approval-response` handling as a second supported path. Remove the endpoint once all clients (web-chat builds, any embed/iframe consumers) are on the native path. Do not delete the endpoint in the same slice that adds native handling — leave a bake window.

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

Shared across modes:

- agent-service pending approval card creation
- approval by explicit id
- stale/invalid approval rejection
- confirmed success result
- confirmed failure result
- no misleading completion text before approval

Web-chat — bridge mode (while `POST /api/chat/confirm` lives):

- `handleConfirm` rejects mismatched `approvalId`
- `data-approval-card` part renders Tool UI with `approval-requested` state
- `formatConfirmationResult` prefers card state over legacy text

Web-chat — native mode (once `tool-approval-response` lands):

- agent emits a `tool-approval-request` chunk with the same approval id as the Brain card
- a synthetic next-turn message with a `tool-approval-response` part triggers `executeConfirmedAction`
- denied responses produce `tool-output-denied`, not just declined-as-text

Per-interface:

- Discord approval button custom-ids carry the explicit approval id; stale buttons fail safely
- chat-repl yes/no prompt binds to the explicit approval id

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
- Dual UI rendering paths during the web-chat bridge period: custom
  `data-approval-card` rendering and native `tool-*` part rendering can drift,
  e.g. different "approved" badge styling or different decline-reason handling.
  Mitigate by routing both paths through one shared formatter.
- Approval-id drift between Brain `ToolApprovalCard.id` and the AI SDK
  `approval.id` it gets translated to. They are meant to be the same string,
  but nothing currently enforces it at the translation seam — a test that
  round-trips one through the other should be part of the native-mode slice.

## Recommendation

Next slice: web-chat native `tool-approval-response` submission. Land it
alongside the existing `POST /api/chat/confirm` so both paths coexist for one
release; remove the endpoint only after the native path is exercised in
production. After that, Discord card consumption is the highest-value
follow-up because it removes the largest remaining string-rendered confirmation
surface; chat-repl can ride the same Brain-card contract opportunistically.
