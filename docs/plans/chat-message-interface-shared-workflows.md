# Chat MessageInterface Shared Workflows

## Status

In progress. The first extraction pass is implemented in `feat/chat-message-interface-shared-workflows`: confirmation routing/tracking, response render planning, tool/progress status display, upload continuity, artifact access decisions, and structured-card fallback formatting now live under `shell/plugins/src/message-interface/`. Remaining work is mostly Slack adapter integration and any follow-up cleanup discovered while building Slack.

## Goal

Extract transport-generic workflows from `@brains/chat` into shared `MessageInterfacePlugin` utilities so Discord and Slack can share confirmation handling, response rendering, tool status updates, upload continuity, and artifact access behavior.

## Non-goals

- Do not move Discord-specific routing, mention, subscription, or thread policy into shared code.
- Do not add service-level natural-language shortcuts for referential follow-ups such as “save it”.
- Do not build Slack-specific behavior into shared message-interface helpers.
- Do not change upload intent semantics beyond preserving existing tested behavior.

## Current problem

`interfaces/chat/src/chat-interface.ts` uses `MessageInterfacePlugin`, but it still owns a lot of transport-generic orchestration:

- pending approval restoration and confirmation parsing;
- agent response/card ordering;
- tool status send/edit lifecycle;
- recent upload restore and prior-upload selection;
- artifact visibility decisions and denied-card suppression.

If Slack is implemented now, those workflows would either be duplicated or partially reimplemented. That risks diverging behavior between Discord and Slack and makes future upload/approval fixes harder.

## Design principle

Shared code should decide **what** needs to happen. Transport code should decide **how it is rendered or delivered**.

For example:

- shared confirmation workflow decides whether a message confirms, cancels, needs an approval id, or is not a confirmation;
- Discord/Slack render buttons, cards, ephemeral notices, and message edits in their own adapter code.

## Phase 1 — Confirmation workflow

Move generic confirmation orchestration into `shell/plugins/src/message-interface/`.

Shared responsibilities:

- load pending approval ids from stored conversation messages;
- parse confirm/cancel replies with optional approval ids;
- reject explicit but unknown approval ids;
- require ids when multiple approvals are pending;
- produce transport-neutral confirmation routing results.

Transport responsibilities:

- render approval buttons/cards;
- map button actions to confirmation inputs;
- send notice messages;
- call `agent.confirmPendingAction` with platform metadata.

Suggested shared type:

```ts
export type ConfirmationRouteResult =
  | { kind: "not-confirmation" }
  | { kind: "confirm"; approvalId: string; confirmed: boolean }
  | { kind: "notice"; message: string };
```

Tests:

- single pending approval + `yes` confirms;
- single pending approval + `no` cancels;
- multiple pending approvals require an id;
- explicit unknown approval id returns a notice;
- stored approval cards restore pending ids.

## Phase 2 — Agent response render planning

Introduce a shared response render planner that turns an `AgentResponse` into transport-neutral render parts.

Shared responsibilities:

- main response text;
- approval-card suppression when pending confirmations exist;
- supplemental card ordering;
- artifact-card grouping;
- remaining approval help;
- confirmation result summaries.

Transport responsibilities:

- convert render parts into Discord/Slack cards/messages;
- chunk text by platform limits;
- decide whether cards become attachments, blocks, embeds, or fallback text.

Suggested shared type:

```ts
export interface MessageRenderPlan {
  main: MessageInterfaceOutput;
  supplementalCards: StructuredChatCard[];
  artifactCards: StructuredChatCard[];
  pendingConfirmations: PendingConfirmation[];
  deniedCardIds: Set<string>;
}
```

Tests:

- pending confirmations suppress duplicate approval summary cards;
- attachment cards remain separate from the main response;
- denied artifacts are included as suppressed summaries only;
- confirmation results include success, declined, and error variants.

## Phase 3 — Tool status lifecycle

Move tool-status state transitions into shared message-interface helpers.

Shared responsibilities:

- derive status key from conversation/tool identity;
- decide send vs edit for running/completed/failed/awaiting-approval updates;
- format transport-neutral status title/body/fallback.

Transport responsibilities:

- store platform message ids for status messages;
- send or edit actual messages;
- translate status payloads into Discord/Slack UI.

Tests:

- running creates a status message;
- completed edits an existing status message;
- completed sends a new status if no tracked message exists;
- failed includes an error message;
- awaiting approval maps to approval status text.

## Phase 4 — Upload continuity and restore

Move recent-upload continuity into shared message-interface helpers while keeping platform upload ingestion local.

Shared responsibilities:

- remember recent uploaded attachments per conversation;
- restore prior upload ids from stored conversation metadata;
- select referenced prior attachments by filename/ordinal/recency;
- skip unavailable upload records;
- avoid exposing prior uploads to public users.

Transport responsibilities:

- fetch raw platform attachment bytes;
- enforce platform size limits;
- choose upload store scope/ref kind;
- build platform upload metadata.

Tests:

- same-turn uploads pass through;
- filename selection wins over recency wording;
- latest/first selection works;
- stale uploads are skipped;
- public users cannot restore prior uploads.

## Phase 5 — Artifact access decisions

Move artifact access-control decisions into a shared helper.

Shared responsibilities:

- resolve attachment cards to entity refs;
- apply permission visibility scope;
- distinguish inaccessible artifacts from genuinely missing artifacts;
- produce denied-card ids for link suppression.

Transport responsibilities:

- convert visible artifacts into native files if desired;
- enforce platform file-size limits;
- render links/cards/fallback text.

Tests:

- anchor/trusted can resolve visible artifacts;
- public callers get denied-card suppression for restricted artifacts;
- missing/unresolvable artifacts are not falsely suppressed;
- oversized native files are skipped by transport policy.

## Phase 6 — Slim `@brains/chat`

After shared extraction, `interfaces/chat` should keep only Chat SDK and Discord adapter concerns:

- adapter construction;
- Discord webhook routes;
- Discord upload route;
- Discord mention/subscription/thread policy;
- Discord card/button conversion;
- Discord-specific file upload limits;
- platform allowlists and DM rules.

Everything else should call shared message-interface helpers.

## Phase 7 — Slack adapter

Implement Slack against the slimmed shape:

- Slack adapter config and lifecycle;
- Slack event/action routing;
- Slack upload ingestion;
- Slack message/block rendering;
- Slack approval button handling;
- Slack artifact delivery limits.

Slack should reuse shared helpers for:

- confirmation routing;
- response render planning;
- tool status lifecycle;
- upload continuity;
- artifact access decisions.

## Acceptance criteria

- Existing Discord `interfaces/chat` tests pass.
- Existing `shell/plugins` message-interface tests pass.
- Rover focused upload/chat evals remain green.
- Slack adapter does not duplicate confirmation, upload continuity, artifact access, or tool status orchestration.
- No service-level natural-language referent shortcuts are added.

## Validation

Use the lightest checks after each phase:

```bash
bun test shell/plugins/test/message-interface interfaces/chat/test
bun run --filter @brains/plugins typecheck
bun run --filter @brains/chat typecheck
bun run --filter @brains/chat lint
```

Before merging Slack-specific work, run focused Rover chat/upload evals and then the full relevant model eval suite.

## Risks

- Shared helpers may accidentally encode Discord assumptions. Keep transport inputs and outputs explicit.
- Moving approval state can break restored approvals. Preserve stored card metadata compatibility.
- Upload continuity touches persistence and runtime upload stores. Keep ref kinds/scope transport-provided.
- Artifact access must not leak restricted URLs in fallback text.
