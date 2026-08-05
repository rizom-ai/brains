# Plan: Unified inbox for incoming events

## Status

**Phases 0–3 implemented.** The schema-first `InboxSource` contract, app-scoped
finalized registry, failure-isolating live aggregation DataSource, Admin dashboard/tool
surfaces, first real source (`mail-items`), and daily notification digest are in place.

## Goal

The operator answers "what came in that needs me?" in one place. Today each producer
invents its own surface: [atproto-integration.md](./atproto-integration.md) designs an
operator-only "Candidate Inbox", [bd-priority-engine.md](./bd-priority-engine.md) blocks
stale-opportunity alerts on shared infrastructure ("scheduling, dedupe, and notification
delivery must not become business-development-specific"), and
the shipped [`@brains/email-triage`](../../plugins/email-triage/README.md) needs
somewhere for high-priority derived mail items to land. This plan is that shared surface: one contract, one dashboard widget, one
digest.

## What exists today (fact-check)

- **Push exists, and the pull foundation now exists.** `notifications:send` delivers a
  transient message to a channel recipient. `@brains/plugins` now exposes the finalized
  app-scoped inbox-source registry, while opt-in `@brains/unified-inbox` contributes the
  live `unified-inbox:inbox` aggregation DataSource, grouped Admin dashboard widget,
  and bounded `inbox_list` tool. Email triage registers the first real source.
- The registry follows the established contribution lifecycle used by channel
  descriptors/providers (`shell/plugins/src/channel-registry.ts`).
- Read-model precedent: the bd-priority-engine ranking is a `DataSource` computed on
  demand from stored fields, deliberately avoiding a persisted projection that can go
  stale. The same reasoning applies here.
- The daily digest is registered through `shell/recurring-checks` and delivered through
  `notifications:send` to the notifications plugin's configured default recipient. It is
  silent when no item is open.
- Dashboard widget templates: `entities/wishlist` `ListWidget`, the `agent-discovery`
  widget.

## Core decisions

1. **The inbox is a projection, not a store.** Sources own their state; the inbox
   aggregates it live. The alternative — a materialized `inbox-item` entity every
   producer writes — is rejected because it creates dual state (a source entity's
   `status` and its inbox item's status drifting) and makes every producer responsible
   for cleanup.
   With a projection, an item disappears the moment its source state changes, by
   construction.
2. **Sources register an `InboxSource` contract** (app-scoped registry in
   `@brains/plugins`, same lifecycle as channel descriptors — finalized before use):

   ```ts
   interface InboxSource {
     sourceId: string; // "mail-items", "agent-candidates", ...
     displayName: string;
     list(): Promise<InboxItem[]>; // current attention items only
     act(
       itemId: string,
       actionId: string,
       actor: { permissionLevel: UserPermissionLevel },
     ): Promise<void>;
   }

   interface InboxItem {
     id: string; // stable within the source
     title: string; // content-safe: no message bodies
     summary?: string;
     receivedAt: string; // ISO
     urgency: "high" | "normal";
     entityRef?: { entityType: string; entityId: string };
     actions: { id: string; label: string; confirm?: boolean }[];
   }
   ```

   Any plugin type may register a source — attention is not interface-specific.

3. **Actions delegate to the source and carry the actor.** "Handled" on a mail item
   calls the email-triage source's `act`, while "Add" on a candidate runs the atproto
   plan's existing confirmation-gated add. The inbox dispatches and re-lists; it
   contains no business logic and no state of its own. Dashboard mutations require
   same-origin JSON, an authenticated Admin, and explicit confirmation for actions
   marked `confirm`. Every dispatch passes the caller's
   `UserPermissionLevel` (mirroring tool handlers' `context.userPermissionLevel`), so a
   source enforces its own authorization instead of trusting the surface — "admin-only"
   is a property of today's dashboard consumer, not of this contract. Sources mutating
   restricted entities must reject non-admin actors.
4. **One aggregation `DataSource`** merges all sources, ordered by urgency then
   `receivedAt`, tolerant of a failing source (its section reports an error; others
   still render — one broken plugin must not blank the inbox).
5. **Consumers, phased in by their own plans:** derived mail items (email-triage Phase
   2B; its source-owned Phase 2A operator surfaces do not wait for this contract), agent
   candidates (the atproto plan's Candidate Inbox becomes an `InboxSource`
   registration plus candidate-specific merge/retention logic it already owns — that
   plan's UI slice shrinks to a source registration; update it when this contract
   lands), stale opportunities (bd heartbeat lists stale Warm items as inbox items —
   this registry plus `recurring-checks` is the shared infrastructure its Status
   section waits on). Lead management does not register the same mail arrival again;
   qualification remains a separate business view rather than a duplicate inbox item.
6. **The digest is push over the projection.** A `daily` recurring check summarizes
   counts and top high-priority titles per source via `notifications:send`, linking to
   the configured dashboard route — titles only, never summaries or bodies. Its dedupe
   key is scoped to the UTC run date, so retries are idempotent without per-item state.
7. **Items are content-safe by contract.** `title`/`summary` must be safe for
   notification transport and dashboard rendering: no mail bodies, no raw addresses
   beyond what the operator needs to recognize the item. Enforced in each source's
   tests.

## Configuration

The capability remains opt-in. Daily delivery uses the core notifications capability's
existing default recipient:

```yaml
add: [unified-inbox]

plugins:
  notifications:
    defaultRecipient:
      type: email
      address: operator@example.com
```

Without a default recipient, the dashboard and `inbox_list` still work; the recurring
notification remains pending for the standard retry path.

A dedicated synthetic-only pilot lives at
`packages/brain-cli/test-apps/unified-inbox`. It keeps email triage and unified inbox
opt-in, leaves IMAP host/port/cadence explicit, reads only mailbox credentials from the
local environment, and starts through `bun start:unified-inbox` from
`packages/brain-cli`. Its README documents the isolated mailbox and optional digest
delivery setup; no secrets or real mailbox fixtures are committed.

## Phased delivery (thin vertical slices, TDD)

Tests are written first inside each phase.

- **Phase 0 — Walking skeleton: contract + registry + projection — implemented.** `InboxSource`/
  `InboxItem` schemas, app-scoped registry, aggregation DataSource; proven with a
  synthetic in-test source. _Tests:_ duplicate `sourceId` rejected; ordering
  (urgency, then recency); failing source isolated; empty state.
- **Phase 1 — Surfaces — implemented.** The Admin `Inbox` dashboard widget renders
  grouped live items, urgency, source failures, and source-owned action buttons. The
  bounded Admin `inbox_list` tool supports source and urgency filters for chat surfaces.
  Dashboard actions use a same-origin JSON endpoint, re-resolve the Admin principal,
  verify the action is still offered, require explicit confirmation when marked, pass
  the caller permission to the source, and re-list after mutation. _Tests:_ dataProvider
  and rendered control shape; empty state; filtered tool output; action dispatch and
  actor propagation; source-owned authorization; explicit confirmation; CSRF/auth
  policy; fixed-error privacy.
- **Phase 2 — First real source: email triage — implemented.** The mail-item source
  lists items in `status=new`, maps `priority=high` to high urgency, and delegates mark
  reviewed, mark handled, and archive actions to email triage's typed Phase 2A status
  operation. _Tests:_ source mapping and empty state; Admin enforcement; all action
  transitions; source-content redaction; handled items disappear on re-list and from
  the shared widget projection.
- **Phase 3 — Digest — implemented.** A daily recurring check returns one
  `notifications:send` alert with bounded per-source counts, top `high`-urgency titles,
  fixed source-unavailable counts, and the mounted dashboard URL. It is silent when the
  inbox is empty and uses a UTC-date dedupe key for retry-safe daily delivery. _Tests:_
  title-only content policy; summary/action/ID redaction; empty inbox sends nothing;
  recurring registration and custom dashboard route resolution.

## Out of scope

- **Not a notification center.** Transient delivery stays in `@brains/notifications`;
  the inbox lists only items whose source still considers them open.
- **Not a task manager.** Items are source-owned facts, not free-form todos; there is
  no "create inbox item" API.
- **Not a message reader.** The inbox may link to a derived source entity via
  `entityRef`; original email remains in the mailbox and is never rendered by this
  surface.

## Related plans

- [`@brains/email-triage`](../../plugins/email-triage/README.md) — shipped; first real
  source (derived mail attention).
- [lead-management.md](./lead-management.md) — business qualification view; does not
  duplicate mail items in this inbox.
- [atproto-integration.md](./atproto-integration.md) — its Candidate Inbox is specified
  as an `InboxSource` registration over source-owned candidate state.
- [bd-priority-engine.md](./bd-priority-engine.md) — stale-opportunity heartbeat
  registers here instead of growing bespoke alert delivery.
- [operator-console-pwa.md](./operator-console-pwa.md) — the dashboard this widget
  ships in.
