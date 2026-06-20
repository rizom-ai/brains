# Plan: Discord Chat SDK / Web Chat Feature Parity

## Status

Active plan for the `@brains/chat` Discord implementation.

Initial scope is Discord parity with important `interfaces/web-chat` operator workflows. Enhancement design should now assume additional Chat SDK providers such as Slack and WhatsApp are expected follow-ups, so transport-neutral semantics belong in shared message-interface code before adapter-specific rendering.

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

Decision: enable Chat SDK `queue` concurrency for the Discord Chat app. The SDK concurrency strategy is global per `Chat` instance, not per handler, but lock scope remains per thread/channel. Silent drop is worse than queued delivery.

- Discord/chat implementation:
  - Configure SDK queueing globally for the Discord Chat app.
  - Preserve the current routing gates: DMs, mentions, allowlisted channels, and bot-owned subscribed-thread checks still decide whether a dequeued message routes.
  - When multiple messages arrive while a turn is running, process the latest queued message and preserve earlier queued messages as skipped context.
  - Do not post a visible coalescing notice by default; avoid extra Discord noise unless later UX evidence says users need it.
- Base/shared escalation:
  - Add shared helpers for formatting coalesced/skipped user input and for attaching transport-neutral metadata such as `supersededMessageIds` / `supersededMessageCount`.
  - Add shared tests in `shell/plugins` for the coalesced-input formatting/metadata, independent of Discord.
- Web-chat backport:
  - No immediate backport. Backport only if web-chat introduces overlapping request handling, cancellation, or client-side send coalescing. In that case, use the same shared helper/metadata and render a browser-appropriate notice.

### 2. Message feedback from reactions / UI feedback controls

Decision: capture feedback as normalized transport-neutral events first. Do not mutate conversation message metadata in this slice. Persistence/aggregation can be added later once a feedback sink is selected.

- Discord/chat implementation:
  - Use Chat SDK reaction events to capture thumbs-up/thumbs-down or equivalent reactions on assistant messages.
  - Map positive reactions such as 👍/✅ to `positive` and negative reactions such as 👎/❌ to `negative`.
  - Preserve `added` versus removed reactions so removals can neutralize prior feedback downstream.
  - Include actor/source attribution and the referenced assistant message id when available.
  - Ignore bot/self reactions.
  - Do not turn reactions into chat turns unless explicitly configured later.
- Base/shared escalation:
  - Add a transport-neutral message-feedback event shape/helper in `MessageInterfacePlugin` or shared message-interface helpers.
  - Normalize feedback values such as `positive` and `negative` while preserving actor/source attribution and raw transport metadata.
  - Emit/callback normalized feedback events; do not require a durable store in the base class.
- Web-chat backport:
  - Add equivalent thumbs-up/thumbs-down controls for assistant messages.
  - Send feedback to the backend using the same normalized feedback shape/helper.
  - Render feedback as UI state only; do not require conversation metadata mutation in this slice.

### 3. Participant-aware subscribed-thread policy

Decision: do not silently unsubscribe and do not keep auto-replying forever. In bot-owned subscribed Discord threads, auto-route while the thread is effectively 1:1. Once multiple non-bot humans are detected, switch that subscribed thread to mention-required mode and post one short notice.

Chat SDK exposes `thread.getParticipants()`, which can detect when a subscribed bot-created thread becomes a broader human discussion.

- Discord/chat implementation:
  - Detect multiple non-bot participants in bot-owned subscribed threads.
  - When detected, stop auto-routing unmentioned messages in that thread.
  - Continue routing explicit mentions in that same thread.
  - Post a one-time notice such as: “I’ll stop auto-replying now that more people joined. Mention me if you need me.”
  - Persist enough subscription policy state to avoid repeating the notice after restart.
  - Do not let explicit mentions in arbitrary existing threads bypass the existing ownership/subscription gate.
- Base/shared escalation:
  - Keep participant discovery and Discord subscription mutation in `interfaces/chat`.
  - Extract only a transport-neutral policy decision helper if another message interface later needs the same “auto-route versus mention-required” semantics.
- Web-chat backport:
  - Not applicable for single-operator browser sessions unless shared/multi-operator web-chat sessions are added later.

### 4. Explicit command entrypoints

Decision: defer slash commands until there is a concrete command use case. Mention and DM routing remain the primary Discord chat UX.

Chat SDK supports slash-command handlers, but Discord slash commands require product decisions around command registration and interaction delivery.

- Discord/chat implementation:
  - Do not add `/rover ask` just to mirror chat; it duplicates mention/DM behavior.
  - If added later, prefer specific commands such as `/rover help` or `/rover status` over general chat entrypoints.
- Base/shared escalation:
  - Reuse existing message/action attribution helpers for command-triggered turns if commands are introduced.
  - Extract command payload normalization only if another interface needs explicit commands.
- Web-chat backport:
  - Backport only as browser command shortcuts or prompt actions if there is a matching operator UX.

### 5. Private notices / DM fallback

Decision: keep this as a narrow, config-gated enhancement. Use it only for sensitive or noisy user-specific details; do not make all notices private.

Chat SDK exposes `postEphemeral`, but Discord has no native ephemeral channel messages in this adapter path and falls back to DM when allowed.

- Discord/chat implementation:
  - Add a conservative config option such as `privateNotices: "off" | "dm-details"` if this enhancement is implemented.
  - For public channels, keep a short public notice so the thread explains why Rover did not act.
  - Send details by DM only for cases such as upload rejection details, permission/access denials, or user-specific approval/action errors.
  - Handle DM failure gracefully without retry spam.
- Base/shared escalation:
  - Add a shared notice visibility semantic such as `public`, `private`, or `private-preferred` only if more than one interface needs it.
- Web-chat backport:
  - Usually not applicable because web-chat is already operator-private; use normal notices unless multi-user web-chat appears.

### 6. Structured forms / modals

Discord itself supports modals and Chat SDK core has modal abstractions, but the current `@chat-adapter/discord` package does not implement `openModal`. Treat Discord modals as requiring adapter support or an explicit decision to extend the adapter.

- Discord/chat implementation:
  - Do not hand-roll Discord modal payloads inside `interfaces/chat` unless there is a concrete UX that justifies bypassing the adapter.
  - If adapter support is added, candidate forms include save-upload metadata, create-note fields, publish metadata, feedback reasons, disambiguation, and editable approval/tool arguments.
- Base/shared escalation:
  - If forms are introduced, define transport-neutral form schemas, submission metadata, and validation helpers in shared message-interface code.
- Web-chat backport:
  - Backport any transport-neutral form schema as browser-native forms/dialogs in web-chat rather than Discord-shaped modals.

### 7. Brain web Chat SDK adapter strategy

Decision: do not replace `interfaces/web-chat` with the official `@chat-adapter/web` as-is. The official adapter is text-first and does not handle current Brain web-chat features such as upload refs, approval responses, structured cards/data parts, artifact routes, session management, or conversation-service history. Because Slack and WhatsApp are expected future providers, design a Brain-specific web adapter path so browser chat can eventually share Chat SDK semantics without losing Brain web-chat features.

- Web-chat implementation direction:
  - Keep current `interfaces/web-chat` routes/UI until a Brain-specific adapter preserves feature parity.
  - Use `@chat-adapter/web` as a reference for AI SDK `useChat` stream protocol integration, not as a direct replacement.
  - A future Brain web adapter must preserve operator auth, sessions, uploads, approvals/actions, structured Brain data parts, generated artifact routes, active progress streaming, and Brain conversation-service history.
- Base/shared escalation:
  - Queueing/skipped-input, feedback, forms, approval/action semantics, and notice visibility should be modeled in shared message-interface helpers/classes before being rendered in Discord, Slack, WhatsApp, or web-chat.
  - Avoid Discord-shaped semantics in shared code; store transport-neutral event/input/output shapes.
- Provider strategy:
  - Add future Slack/WhatsApp adapters under `interfaces/chat` where practical so they share the same `MessageInterfacePlugin` semantics and Chat SDK handler model.
  - Keep provider-specific rendering, permission context extraction, native file delivery, webhook/gateway setup, and platform limits in adapter-specific code.

## Non-goals

- Replacing the browser web chat UI with the official `@chat-adapter/web` package as-is.
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
