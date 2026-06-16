# Plan: Discord Chat SDK / Web Chat Feature Parity

## Status

Active plan for the `@brains/chat` Discord implementation.

Scope is intentionally narrow: bring Discord via Chat SDK to parity with the important `interfaces/web-chat` operator workflows. Do not add multi-provider planning here.

This document tracks **remaining reviewer-actionable work only**. Completed automated parity slices have been removed from the task list so reviewers can focus on what still blocks replacement of `@brains/discord`.

## Working rule

Prefer **shared pure helpers in `shell/plugins/src/message-interface/`** plus interface-specific rendering/transport code.

Shared candidates should be escalated when they are independent of Discord threads, browser sessions, routes, or UI components. Keep Discord-specific posting, editing, routing, gateway, and permission-context behavior in `interfaces/chat`.

## Remaining work

### 1. DB-backed Chat SDK state adapter

Discord thread continuation depends on Chat SDK operational state. Today `@brains/chat` still uses `createMemoryState()`, so subscribed-thread state is lost on process restart. That means a user may need to mention the bot again after restart before unmentioned thread follow-ups route correctly.

This is not web-chat state. Web-chat sessions, messages, approvals, uploads, and artifacts are already Brains-owned durable state. This adapter is for Chat SDK operational state only.

Required implementation:

- Add a dedicated DB-backed Chat SDK `StateAdapter`; do **not** store this state in conversation/message metadata.
- Store adapter state in proper operational tables, not Redis and not local files.
- Preserve Chat SDK memory adapter semantics for:
  - subscriptions: `subscribe`, `unsubscribe`, `isSubscribed`
  - locks: `acquireLock`, `extendLock`, `releaseLock`, `forceReleaseLock`
  - cache values: `get`, `set`, `setIfNotExists`, `delete`
  - lists: `appendToList`, `getList`, TTL, `maxLength`
  - queues: `enqueue`, `dequeue`, `queueDepth`, `maxSize`
- Wire `ChatInterface` to use the DB adapter when the shell/runtime provides it; keep memory state as fallback only when no persistent adapter is available.

Suggested schema shape:

```sql
chat_state_values (
  namespace text not null,
  key text not null,
  value_json text not null,
  expires_at integer,
  primary key (namespace, key)
);

chat_state_locks (
  namespace text not null,
  thread_id text not null,
  token text not null,
  expires_at integer not null,
  primary key (namespace, thread_id)
);

chat_state_queues (
  namespace text not null,
  thread_id text not null,
  position integer not null,
  entry_json text not null,
  expires_at integer,
  primary key (namespace, thread_id, position)
);
```

Subscriptions can be stored either as dedicated rows in `chat_state_values` or as a small dedicated table. Prefer the simplest version that keeps adapter semantics clear.

Acceptance criteria:

- Subscribed Discord threads continue routing unmentioned follow-up messages after process restart.
- Adapter state is scoped by namespace so future Chat SDK uses do not collide.
- Expired locks/cache/list/queue records are ignored and safely pruned or overwritten.
- Lock token semantics match Chat SDK memory state behavior.
- Queue trim/dequeue order matches Chat SDK memory state behavior.
- Tests cover adapter recreation to simulate restart.

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
