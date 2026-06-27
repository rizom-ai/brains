# Chat response-rendering decomposition

## Status

In progress. `ChatInterface` (`interfaces/chat/src/chat-interface.ts`) was a
~2350-line god-class mixing three layers: presentation, delivery, and plugin
plumbing/routing. Decomposing incrementally, each step staying green against the
100 existing chat tests.

Done:

- **ToolStatusMessenger** — extracted the tool-status card lifecycle.
- **ChatCardBuilder** (`chat-cards.ts`) — extracted the pure presentation layer:
  all `CardElement` building from response data, URL display resolution, and the
  shared action-id constants. Injected with `getDisplayBaseUrl` and
  `registerPromptAction` so it holds no interface state and is testable in
  isolation.
- **ArtifactDeliveryResolver** (`artifact-delivery.ts`) — extracted artifact
  delivery policy (which generated artifacts to deliver as native files vs deny by
  permission level), duplicated across both render paths. Injected with
  `getContext`/`getDisplayBaseUrl`/`logger`. `ChatInterface` is now ~1889 lines.

## Correction to the original "AgentResponseRenderer" plan

Reading the code disproved the idea of one `AgentResponseRenderer` collaborator:
the delivery layer calls **protected base-class methods** (`sendMessageWithId`,
`trackAgentResponseForJob`) and spans six concerns (agent, artifact policy, thread
posting, Discord specifics, approval state, job tracking). A single renderer would
need ~10 injected deps — feature envy, a new smell. The honest cut is to peel off
the **cohesive sub-units** and leave the orchestration (`renderAgentResponse` /
`confirmApproval` / `sendAgentResponseWithFiles`) in the class — coordination using
base protected methods is the plugin's legitimate role.

## Remaining within-chat steps

- **ApprovalCardTracker** — `approvalCardMessages` map + `getApprovalCardKey` +
  `resolveApprovalCard` + `sendPendingConfirmationCards`. Cohesive approval-card
  bookkeeping; needs `cardBuilder` + `threadRegistry` + `clearDiscordMessageComponents`.
- **Discord glue** — extract the Discord-specific cluster (upload store, thread
  subscription, routing, gateway loop, config builders, `clearDiscordMessageComponents`).
  Largest and most entangled; do last.

## Follow-on: shared `ResponsePlan` (cross-interface, lifts logic UP)

The platform-agnostic response logic is **already** in `@brains/plugins`
(`response-render-plan`, `artifact-access`): `buildAgentResponseTextParts`,
`getDeliverableArtifactCards`, `getSupplementalCards`, `getResponseJobIds`,
`resolveMessageArtifactAccess` (the last confirmed shared with web-chat). But these
are **fragments** that each interface calls separately and interleaves with its own
presentation.

The deeper structural fix: consolidate them into a single
`buildResponsePlan(response, access) -> ResponsePlan` — an ordered, typed list of
render directives (text, then these artifact cards, then supplemental, then pending
confirmations) — that **both** chat and web-chat consume, each rendering the plan in
its own mechanism (Discord `CardElement`s vs web streaming/SSE). That fully lifts
sequencing/selection up to the base and leaves each interface with only presentation.

This is a larger cross-package change (touches `@brains/plugins` + `interfaces/chat`
+ `interfaces/web-chat`). The within-chat `AgentResponseRenderer` extraction is its
prerequisite: once chat's delivery consumes a clean plan-shaped input, the shared
`ResponsePlan` boundary becomes mechanical to lift.

## Why not lift the whole pipeline to MessageInterfacePlugin

Chat posts discrete `CardElement` messages; web-chat **streams** to a web UI
(`stream-writer`, `chat-stream`, SSE). The presentation mechanisms genuinely differ,
so `CardElement` construction must stay in chat. Only the agnostic plan (above) goes
up — and most of it already has.
