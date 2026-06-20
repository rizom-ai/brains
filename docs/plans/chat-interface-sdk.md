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
- Discord Chat SDK input handling uses SDK queue concurrency so messages arriving while a turn is running are not silently dropped. Earlier queued messages are preserved as shared coalesced-input context/metadata for the latest queued turn.

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

### 1. Participant-aware subscribed-thread policy

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

## Related future plans

- [Message feedback events](./message-feedback.md)
- [Brain web Chat SDK adapter strategy](./brain-web-chat-sdk-adapter.md)
- [Chat interface structured forms and modals](./chat-interface-forms-modals.md)

## Non-goals

- Implementing message feedback, Brain web adapter migration, or structured forms/modals in this plan.
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
