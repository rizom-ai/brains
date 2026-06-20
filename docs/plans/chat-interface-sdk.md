# Plan: Discord Chat SDK / Web Chat Feature Parity

## Status

Active plan for the `@brains/chat` Discord implementation.

Scope is intentionally narrow: bring Discord via Chat SDK to parity with the important `interfaces/web-chat` operator workflows. Do not add multi-provider planning here.

This document tracks **remaining reviewer-actionable work only**. Completed automated parity slices have been removed from the task list so reviewers can focus on what still blocks replacement of `@brains/discord`.

## Working rule

Prefer **shared pure helpers in `shell/plugins/src/message-interface/`** plus interface-specific rendering/transport code.

Shared candidates should be escalated when they are independent of Discord threads, browser sessions, routes, or UI components. Keep Discord-specific posting, editing, routing, gateway, and permission-context behavior in `interfaces/chat`.

## Completed automated slices

- Discord thread subscriptions are backed by the shell runtime state store via `interfaces/chat/src/subscription-state.ts`. Only `subscribe` / `unsubscribe` / `isSubscribed` are durable; Chat SDK locks/cache/lists/queues remain delegated to memory state so restarts do not resurrect transient operational state.
- Public/external generated artifact policy is documented in `interfaces/chat/README.md`: keep fallback links only, do not add signed or Discord-authenticated artifact routes in this slice, post native files only for trusted/anchor callers when the artifact entity is visible, and suppress fallback link/metadata for any resolved artifact that exists outside the caller's visibility scope.

## Remaining work

### 1. Live Discord trial

Run an end-to-end Rover trial with `@brains/chat` replacing `@brains/discord`.

Trial setup:

- Start Rover with an instance config that removes `discord` and adds `chat`.
- Keep eval mode disabling both `discord` and `chat`.
- Use a Discord permission rule such as `discord:* -> trusted` for upload/reuse checks, then repeat selected public-user checks without that rule.
- Use a channel allowlist for at least one pass so mention, URL capture, and subscription gating are all exercised.
- Include a restart between subscribed-thread messages to validate DB-backed Chat SDK state.

Required smoke checks:

- Mention routing.
- DM routing.
- Thread subscription and unmentioned follow-up routing after restart.
- Behavior when thread subscription is unavailable.
- Text/image/PDF uploads.
- Upload follow-up by filename and recency.
- Public-user upload rejection/reuse denial.
- Confirmation approve/cancel.
- Multiple/chained/bad-id/retry approval flows.
- Long-running progress/completion/failure updates.
- Generated image/PDF native Discord file delivery for trusted/anchor users.
- Generated artifact link fallback.
- Restart continuation for channel, DM, and subscribed-thread conversations.

HTTP Discord webhook/interactions endpoint validation is conditional, not a required smoke check. Gateway mode is the current live Discord use case; only test the webhook route when a deployment explicitly configures Discord Interactions Endpoint URL or a shared gateway forwarder.

Acceptance criteria:

- Live validation passes, or each blocker is documented with a rollback path.
- Rover can safely choose `@brains/chat` as its Discord implementation, or defer for a specific documented reason.

Validation record template:

```md
Date:
Rover instance/config:
Discord environment: channel / thread / DM
Operator permission rule used: yes/no
Result: pass / blocked / deferred

Checks:

- [ ] Mention routing
- [ ] DM routing
- [ ] Thread subscription
- [ ] Subscribed-thread follow-up after restart
- [ ] Thread subscription unavailable behavior
- [ ] Text/image/PDF uploads
- [ ] Upload follow-up by filename and recency
- [ ] Public-user upload rejection/reuse denial
- [ ] Confirmation approve/cancel
- [ ] Multiple/chained/bad-id/retry approval flows
- [ ] Long-running progress/completion/failure updates
- [ ] Generated native Discord artifact files
- [ ] Generated artifact link fallback
- [ ] Restart continuation: channel
- [ ] Restart continuation: DM
- [ ] Restart continuation: subscribed thread

Blockers / rollback path:
```

### 2. Rover migration decision

After DB-backed Chat SDK state and live validation are complete, decide whether Rover can switch Discord implementation from `@brains/discord` to `@brains/chat`.

Acceptance criteria:

- Rover docs/config explain the migration path and rollback path.
- Eval mode continues to disable live chat interfaces.
- Any remaining blocker is documented with owner and follow-up.

## Enhancement backlog

These items are enhancements, not parity blockers. For each item, move transport-neutral semantics into `MessageInterfacePlugin` or shared helpers under `shell/plugins/src/message-interface/` when possible, and keep only transport rendering, Discord SDK plumbing, and browser UI details in interface packages.

### 1. Queued/conflated input handling

Chat SDK exposes per-thread concurrency strategies such as `queue` and provides `MessageContext.skipped` for messages that arrived while a prior handler was running.

- Discord/chat implementation:
  - Add configurable queue/conflation behavior for Discord threads/DMs.
  - When skipped messages exist, route the latest message with a clear model-visible summary of the skipped user messages rather than silently dropping them.
  - Consider a user-visible notice when intermediate messages were superseded.
- Base/shared escalation:
  - Add shared helpers for formatting coalesced/skipped user input and for attaching transport-neutral metadata such as `supersededMessageIds` / `supersededMessageCount`.
  - Add shared tests in `shell/plugins` for the coalesced-input formatting/metadata, independent of Discord.
- Web-chat backport:
  - Backport only if web-chat introduces overlapping request handling, cancellation, or client-side send coalescing. In that case, use the same shared helper/metadata and render a browser-appropriate notice.

### 2. Message feedback from reactions / UI feedback controls

Chat SDK exposes reaction events. Discord can use reactions on bot messages as lightweight feedback.

- Discord/chat implementation:
  - Capture thumbs-up/thumbs-down or equivalent reactions on assistant messages.
  - Persist or emit a feedback event with actor/source attribution and the referenced assistant message id.
  - Avoid turning reactions into chat turns unless explicitly configured.
- Base/shared escalation:
  - Add a transport-neutral message-feedback contract/helper in `MessageInterfacePlugin` or shared message-interface helpers.
  - Normalize feedback values such as `positive`, `negative`, and optional freeform reason while preserving actor/source attribution.
- Web-chat backport:
  - Add equivalent thumbs-up/thumbs-down controls for assistant messages in the web-chat UI and route them through the same feedback helper/contract.

### 3. Participant-aware thread subscription policy

Chat SDK exposes `thread.getParticipants()`, which can detect when a subscribed bot-created thread becomes a broader human discussion.

- Discord/chat implementation:
  - Optionally auto-unsubscribe, pause, or ask whether to stay active when a subscribed thread has multiple non-bot participants.
  - Keep this policy configurable because some teams may want Rover to remain active in group threads.
- Base/shared escalation:
  - Extract only the transport-neutral policy decision shape, for example `stay-active`, `pause`, `unsubscribe`, or `ask`, if another message interface needs it.
  - Keep participant discovery and subscription mutations in `interfaces/chat`.
- Web-chat backport:
  - Not applicable for single-operator browser sessions unless shared/multi-operator web-chat sessions are added later.

### 4. Explicit command entrypoints

Chat SDK supports slash-command handlers, but Discord slash commands require product decisions around command registration and interaction delivery.

- Discord/chat implementation:
  - Candidate commands: `/rover ask`, `/rover help`, `/rover status`, or scoped action shortcuts.
  - Keep mention/DM routing as the default chat UX unless explicit commands are requested.
- Base/shared escalation:
  - Reuse existing message/action attribution helpers for command-triggered turns.
  - Extract command payload normalization only if another interface needs explicit commands.
- Web-chat backport:
  - Backport only as browser command shortcuts or prompt actions if there is a matching operator UX.

### 5. Private notices / DM fallback

Chat SDK exposes `postEphemeral`, but Discord has no native ephemeral channel messages in this adapter path and falls back to DM when allowed.

- Discord/chat implementation:
  - Consider DM fallback for sensitive permission denials, upload rejection details, or approval errors in public channels.
  - Keep public-channel behavior explicit so users know why the bot did not act.
- Base/shared escalation:
  - Add a shared notice visibility semantic such as `public`, `private`, or `private-preferred` only if more than one interface needs it.
- Web-chat backport:
  - Usually not applicable because web-chat is already operator-private; use normal notices unless multi-user web-chat appears.

### 6. Structured forms / modals

The core Chat SDK has modal abstractions, but the current `@chat-adapter/discord` package does not appear to implement Discord modal opening. Treat Discord modals as blocked by adapter support unless that changes.

- Discord/chat implementation:
  - Do not hand-roll Discord modal payloads inside `interfaces/chat` unless there is a concrete UX that justifies bypassing the adapter.
  - If adapter support appears, candidate forms include save-upload metadata, create-note fields, publish metadata, and editable approval/tool arguments.
- Base/shared escalation:
  - If forms are introduced, define transport-neutral form schemas, submission metadata, and validation helpers in shared message-interface code.
- Web-chat backport:
  - Backport any transport-neutral form schema as browser-native forms/dialogs in web-chat rather than Discord-shaped modals.

## Non-goals

- Adding other chat providers.
- Replacing the browser web chat UI.
- Building a shared hosted Discord bot gateway.
- Recreating browser-only UI affordances such as session sidebars inside Discord.

## Validation commands

Use the smallest relevant set for each slice:

- `cd shell/plugins && bun run typecheck && bun run lint`
- `cd interfaces/chat && bun run typecheck && bun test && bun run lint`
- `cd interfaces/web-chat && bun run typecheck && bun test <focused-test> && bun run lint`
- Conversation/runtime state adapter tests in the package where the adapter is implemented.

Run broader checks when shared contracts, migrations, or package exports change.

## Completion criteria

This plan is complete when:

- DB-backed Chat SDK state preserves subscribed Discord thread routing after restart.
- Live Discord validation passes.
- Rover can safely switch to `@brains/chat`, or the remaining blocker is explicit and tracked.
