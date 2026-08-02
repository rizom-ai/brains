# Plan: Unified inbox for incoming events

## Status

**Proposed.** A single operator surface for everything that arrived and awaits a human
decision — hot leads, agent candidates, stale-opportunity alerts — aggregated from
source-owned state, never duplicating it.

## Goal

The operator answers "what came in that needs me?" in one place. Today each producer
invents its own surface: [atproto-integration.md](./atproto-integration.md) designs an
operator-only "Candidate Inbox", [bd-priority-engine.md](./bd-priority-engine.md) blocks
stale-opportunity alerts on shared infrastructure ("scheduling, dedupe, and notification
delivery must not become business-development-specific"), and
[email-triage.md](./email-triage.md) needs somewhere for hot leads to land. This plan is
that shared surface: one contract, one dashboard widget, one digest.

## What exists today (fact-check)

- **Push exists, pull does not.** `notifications:send` delivers a transient message to a
  channel recipient and resolves transports via the channel registry
  (`plugins/notifications/src/index.ts`). Nothing durable lists what still needs
  attention.
- The registry-of-contributions pattern is established: channel descriptors/providers
  (`shell/plugins/src/channel-registry.ts`), widget registry
  (`plugins/dashboard/src/widget-registry.ts`).
- Read-model precedent: the bd-priority-engine ranking is a `DataSource` computed on
  demand from stored fields, deliberately avoiding a persisted projection that can go
  stale. The same reasoning applies here.
- `shell/recurring-checks` supports `daily | weekly` cadences — sufficient for a digest.
- Dashboard widget templates: `entities/wishlist` `ListWidget`, the `agent-discovery`
  widget.

## Core decisions

1. **The inbox is a projection, not a store.** Sources own their state; the inbox
   aggregates it live. The alternative — a materialized `inbox-item` entity every
   producer writes — is rejected because it creates dual state (a lead's `status` and
   its inbox item's status drifting) and makes every producer responsible for cleanup.
   With a projection, an item disappears the moment its source state changes, by
   construction.
2. **Sources register an `InboxSource` contract** (app-scoped registry in
   `@brains/plugins`, same lifecycle as channel descriptors — finalized before use):

   ```ts
   interface InboxSource {
     sourceId: string; // "leads", "agent-candidates", ...
     displayName: string;
     list(): Promise<InboxItem[]>; // current attention items only
     act(itemId: string, actionId: string): Promise<void>;
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

3. **Actions delegate to the source.** "Ignore" on a lead item calls the lead source's
   `act`, which sets `status=ignored`; "Add" on a candidate runs the atproto plan's
   existing confirmation-gated add. The inbox dispatches and re-lists; it contains no
   business logic and no state of its own. Actions marked `confirm` go through the
   standard confirmation flow.
4. **One aggregation `DataSource`** merges all sources, ordered by urgency then
   `receivedAt`, tolerant of a failing source (its section reports an error; others
   still render — one broken plugin must not blank the inbox).
5. **Consumers, phased in by their own plans:** leads (email-triage Phase 3), agent
   candidates (the atproto plan's Candidate Inbox becomes an `InboxSource` registration
   plus candidate-specific merge/retention logic it already owns — that plan's UI slice
   shrinks to a source registration; update it when this contract lands), stale
   opportunities (bd heartbeat lists stale Warm items as inbox items — this registry
   plus `recurring-checks` is the shared infrastructure its Status section waits on).
6. **The digest is push over the projection.** A `daily` recurring check summarizes
   counts and top items per source via `notifications:send`, linking to the dashboard —
   titles only, never bodies. Cadence-based, so it needs no per-item dedupe state.
7. **Items are content-safe by contract.** `title`/`summary` must be safe for
   notification transport and dashboard rendering: no mail bodies, no raw addresses
   beyond what the operator needs to recognize the item. Enforced in each source's
   tests.

## Phased delivery (thin vertical slices, TDD)

Tests are written first inside each phase.

- **Phase 0 — Walking skeleton: contract + registry + projection.** `InboxSource`/
  `InboxItem` schemas, app-scoped registry, aggregation DataSource; proven with a
  synthetic in-test source. _Tests:_ duplicate `sourceId` rejected; ordering
  (urgency, then recency); failing source isolated; empty state.
- **Phase 1 — Surfaces.** Dashboard `Inbox` widget (model on the wishlist/
  agent-discovery widgets) rendering grouped items with action buttons, and an
  `inbox_list` tool for chat surfaces. _Tests:_ dataProvider shape; action dispatch
  reaches the owning source; `confirm` actions require confirmation.
- **Phase 2 — First real source: leads.** Register the lead source (items = leads in
  `status=new`, urgency `high` for `fit=hot`; actions: ignore, and promote once
  available). Gated on email-triage Phase 3. _Acceptance:_ a hot lead appears in the
  widget; "ignore" flips the lead's status and the item disappears on re-list.
- **Phase 3 — Digest.** Daily recurring check → `notifications:send` summary with
  per-source counts and top `high`-urgency titles; silent when the inbox is empty.
  _Tests:_ digest content redaction; empty inbox sends nothing.

## Out of scope

- **Not a notification center.** Transient delivery stays in `@brains/notifications`;
  the inbox lists only items whose source still considers them open.
- **Not a task manager.** Items are source-owned facts, not free-form todos; there is
  no "create inbox item" API.
- **Not a message reader.** Reading a full inquiry happens on the underlying entity
  (via `entityRef`), not in the inbox.

## Related plans

- [email-triage.md](./email-triage.md) — first real source (hot leads).
- [atproto-integration.md](./atproto-integration.md) — Candidate Inbox becomes a source
  registration when this lands; update that plan then.
- [bd-priority-engine.md](./bd-priority-engine.md) — stale-opportunity heartbeat
  registers here instead of growing bespoke alert delivery.
- [operator-console-pwa.md](./operator-console-pwa.md) — the dashboard this widget
  ships in.
