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
  isolation. `ChatInterface` is now ~1976 lines.

## Remaining within-chat steps

- **AgentResponseRenderer** — extract the delivery layer: `sendAgentResponseWithFiles`,
  `resolveArtifactDelivery`, `sendArtifactCards`, `sendSupplementalCards`,
  `sendPendingConfirmationCards`, and approval-card tracking (`approvalCardMessages`,
  `resolveApprovalCard`). It consumes `ChatCardBuilder`. Once extracted, the entry
  handlers (`routeToAgent`, `handlePromptAction`, `confirmApproval`) collapse to
  *resolve context → call agent → renderer.render(...)*, since they currently reach
  directly into the delivery internals — the root cause of the god-class tangle.
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
