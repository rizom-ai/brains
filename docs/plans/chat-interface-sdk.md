# Plan: Discord Chat SDK / Web Chat Feature Parity

## Status

Active plan for the `@brains/chat` Discord implementation.

Scope is intentionally narrow: bring Discord via Chat SDK to parity with the important `interfaces/web-chat` operator workflows. Do not add multi-provider planning here.

This document tracks **remaining reviewer-actionable work only**. Completed automated parity slices have been removed from the task list so reviewers can focus on what still blocks replacement of `@brains/discord`.

## Working rule

Prefer **shared pure helpers in `shell/plugins/src/message-interface/`** plus interface-specific rendering/transport code.

Shared candidates should be escalated when they are independent of Discord threads, browser sessions, routes, or UI components. Keep Discord-specific posting, editing, routing, gateway, and permission-context behavior in `interfaces/chat`.

## Remaining work

### 1. Persist Discord thread subscriptions

Discord thread continuation depends on Chat SDK operational state. Today `@brains/chat` uses `createMemoryState()` at both `createChatApp` branches (`interfaces/chat/src/chat-interface.ts`), so subscribed-thread state is lost on process restart — a user may need to mention the bot again after restart before unmentioned thread follow-ups route correctly.

Only **subscriptions** need to survive restart. The Chat SDK documents `subscribe(threadId)` as persistent; locks are held by live in-flight handlers (a restart should clear them, not restore stale ones), and cache/queues are transient. So the fix is narrow: persist subscriptions, keep the in-memory adapter semantics for everything else.

This is not web-chat state, and it is not the operator/admin tier. It is **ephemeral operational state** owned by the [Runtime state store](./runtime-state-store.md); chat is that store's first consumer. The store (shell-owned, namespaced, local libSQL) is built in its own worktree and merged in; this plan does not design a chat-specific database.

Required implementation:

- Back `subscribe` / `unsubscribe` / `isSubscribed` with a namespaced subscriptions table in the runtime state store.
- Keep `acquireLock`/`extendLock`/`releaseLock`/`forceReleaseLock`, `get`/`set`/`setIfNotExists`/`delete`, `appendToList`/`getList`, and `enqueue`/`dequeue`/`queueDepth` on the SDK memory adapter.
- Implement the adapter's `connect()` / `disconnect()` against the store the runtime provides.
- Wire both `createChatApp` branches to use the store-backed adapter when the runtime provides one, falling back to `createMemoryState()` when it does not.
- Do **not** store this state in conversation/message metadata.

Acceptance criteria:

- Subscribed Discord threads continue routing unmentioned follow-up messages after process restart.
- Locks/cache/queues remain in-memory; a restart does not resurrect stale locks.
- Subscription rows are namespaced so other runtime-store consumers do not collide.
- Tests cover store recreation to simulate restart.
- Revisit persisting queues only if live validation shows queued-inbound-message loss across restart actually matters.

Depends on the [Runtime state store](./runtime-state-store.md) landing (built in its own worktree, chat-first).

### 2. Live Discord trial

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
- Webhook route handling.
- Restart continuation for channel, DM, and subscribed-thread conversations.

Acceptance criteria:

- Live validation passes, or each blocker is documented with a rollback path.
- Rover can safely choose `@brains/chat` as its Discord implementation, or defer for a specific documented reason.

Validation record template:

```md
Date:
Rover instance/config:
Discord environment: channel / thread / DM / webhook
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
- [ ] Webhook route
- [ ] Restart continuation: channel
- [ ] Restart continuation: DM
- [ ] Restart continuation: subscribed thread

Blockers / rollback path:
```

### 3. Public/external generated artifact access policy

Trusted/anchor Discord users can receive generated image/PDF artifacts as native Discord files when the artifact resolves to a visible stored entity. Remaining policy work is only for cases where native Discord delivery is not appropriate or possible.

Required decision:

- Keep fallback links only, or add signed/authenticated routes for public/external generated artifact access.

Acceptance criteria:

- Non-operator/public users cannot fetch protected artifacts.
- Fallback links do not expose restricted artifacts outside the intended permission scope.
- The final policy is documented before `@brains/chat` replaces `@brains/discord`.

### 4. Rover migration decision

After DB-backed Chat SDK state and live validation are complete, decide whether Rover can switch Discord implementation from `@brains/discord` to `@brains/chat`.

Acceptance criteria:

- Rover docs/config explain the migration path and rollback path.
- Eval mode continues to disable live chat interfaces.
- Any remaining blocker is documented with owner and follow-up.

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
- Generated artifact fallback policy is documented.
- Rover can safely switch to `@brains/chat`, or the remaining blocker is explicit and tracked.
