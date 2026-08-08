# Plan: Unified inbox for incoming events

## Status

**In progress.** Phases 0–3 have implementation: the schema-first `InboxSource`
contract, app-scoped finalized registry, failure-isolating live aggregation DataSource,
Admin dashboard/tool surfaces, first real source (`mail-items`), and daily notification
digest are in place. The operator UX is not complete until Phase 4 adds a dedicated CMS
Inbox workspace, reduces the Dashboard widget to a read-only summary, and routes digest
and Dashboard entry points into that workspace.

## Goal

The operator answers "what came in that needs me?" in one place. Today each producer
invents its own surface: [atproto-integration.md](./atproto-integration.md) designs an
operator-only "Candidate Inbox", [bd-priority-engine.md](./bd-priority-engine.md) blocks
stale-opportunity alerts on shared infrastructure ("scheduling, dedupe, and notification
delivery must not become business-development-specific"), and
the shipped [`@brains/email-triage`](../../plugins/email-triage/README.md) needs
somewhere for high-priority derived mail items to land. This plan is that shared surface:
one contract, one dedicated triage workspace, one compact Dashboard summary, and one
daily digest.

## What exists today (fact-check)

- **Push and the pull foundation exist; the primary browser workflow does not.**
  `notifications:send` delivers a transient message to a channel recipient.
  `@brains/plugins` exposes the finalized app-scoped inbox-source registry, while opt-in
  `@brains/unified-inbox` contributes the live `unified-inbox:inbox` aggregation
  DataSource, grouped Admin Dashboard widget, and bounded `inbox_list` tool. Email triage
  registers the first real source. The current implementation still performs mutations
  inside the Dashboard widget and has no dedicated CMS Inbox workspace; Phase 4 corrects
  that UX.
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

3. **Actions delegate to the source; confirmation and redaction remain server-owned.**
   "Handled" on a mail item calls the email-triage source's `act`, while "Add" on a
   candidate runs the atproto plan's existing confirmation-gated add. The dedicated CMS
   Inbox workspace is the primary browser mutation surface. CMS authenticates the request,
   re-checks workspace access, and passes the `CmsWorkspaceActor` to the registered
   handler; the unified-inbox adapter validates the action request and maps only
   `{ permissionLevel: actor.userPermissionLevel }` into the current `InboxActor`
   contract. `InboxOperatorService.act` re-lists the source and verifies that the exact
   item/action is still offered on every request. An unconfirmed action marked `confirm`
   returns a typed confirmation without invoking the source; the renderer displays the
   dialog and resubmits the exact request with `confirmed: true`; the confirmed request
   revalidates before execution, so a stale or withdrawn action is refused. The renderer
   owns dialog focus, repeat-submit prevention, and query invalidation after completion —
   not the execution gate. Source exceptions are logged internally and converted by the
   unified-inbox server handler to a fixed typed `Inbox action failed` outcome before the
   generic CMS route can serialize them. The Dashboard widget is read-only: it shows a
   bounded summary and a link to the workspace rather than embedding a second action
   client and route.
4. **One aggregation `DataSource`** merges all sources, ordered by urgency then
   `receivedAt`, tolerant of a failing source (its section reports an error; others
   still render — one broken plugin must not blank the inbox).
5. **Browser payloads are typed, filtered, and bounded on the server.** Extend the CMS
   workspace data-provider contract backward-compatibly with an optional opaque query
   input; the CMS GET route passes workspace query parameters through only after access
   succeeds, and each provider owns Zod validation. Unified inbox accepts `sourceId`,
   `urgency`, `offset` (default `0`), and `limit` (default `50`, maximum `100`), applies
   filters before slicing the globally ordered live projection, and returns `total`,
   `offset`, `limit`, bounded entries, and fixed source errors. The CMS query key includes
   those values; changing a filter resets offset and selection, and **Load more** appends
   the next page. Completed actions return no projection payload; the client invalidates
   and re-queries the current filters. The Dashboard uses a separate server-built DTO:
   aggregate open/high counts, source availability, and at most five entries containing
   only source label, urgency, title, and received time — never summaries, entity refs,
   action IDs, or item IDs.
6. **Consumers, phased in by their own plans:** derived mail items (email-triage Phase
   2B; its source-owned Phase 2A operator surfaces do not wait for this contract), agent
   candidates (the atproto plan's Candidate Inbox becomes an `InboxSource`
   registration plus candidate-specific merge/retention logic it already owns — that
   plan's UI slice shrinks to a source registration; update it when this contract
   lands), stale opportunities (bd heartbeat lists stale Warm items as inbox items —
   this registry plus `recurring-checks` is the shared infrastructure its Status
   section waits on). Lead management does not register the same mail arrival again;
   qualification remains a separate business view rather than a duplicate inbox item.
7. **The digest is push over the projection.** A `daily` recurring check summarizes
   counts and top high-priority titles per source via `notifications:send`, linking to
   the registered CMS Inbox workspace when available and falling back to the Dashboard
   route only when no CMS is mounted — titles only, never summaries or bodies. Its
   dedupe key is scoped to the UTC run date, so retries are idempotent without per-item
   state.
8. **Items are content-safe by contract.** `title`/`summary` must be safe for
   notification transport and browser rendering: no mail bodies, no raw addresses beyond
   what the operator needs to recognize the item. Enforced in each source's tests and in
   the Dashboard DTO's stricter field allowlist.
9. **Registration order produces one canonical destination.** During `onReady`, unified
   inbox first attempts CMS workspace registration and captures the custom-mount-aware
   URL, then registers the Dashboard summary with that URL as `managementUrl`, then
   registers the digest with the workspace URL or Dashboard fallback. If CMS is absent,
   the Dashboard remains read-only, explains that browser triage is unavailable, and
   points operators to `inbox_list`; no mutation route is restored as a fallback. The CMS
   workspace descriptor exposes an access-checked badge count through a new optional
   `badgeProvider`, so the rail can show open attention without loading the full workspace.
   Badge-provider failure is isolated and omits the badge rather than breaking navigation.

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

Without a default recipient, the CMS Inbox workspace, Dashboard summary, and
`inbox_list` still work; the recurring notification remains pending for the standard
retry path.

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
- **Phase 1 — Interim surfaces — implemented, superseded by Phase 4.** The Admin
  `Inbox` Dashboard widget renders grouped live items, urgency, source failures, and
  source-owned action buttons. The bounded Admin `inbox_list` tool supports source and
  urgency filters for chat surfaces. The action and authorization behavior is sound, but
  placing the full mutation workflow in a compact Dashboard widget is not the final UX.
  Phase 4 retains the tool and operator service, moves browser actions into CMS, and
  reduces the widget to a read-only summary.
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
  recurring registration and custom Dashboard route resolution.
- **Phase 4 — Dedicated CMS Inbox workspace — required before completion.** Register an
  Admin-only `inbox` workspace through the existing CMS workspace contract and add a
  `UnifiedInboxWorkspace` renderer. Workspace renderers are first-party CMS code, so
  this phase spans three packages:
  - `@brains/plugins`: extend the closed `CmsWorkspaceRendererName` union; add the optional
    opaque query argument to `dataProvider`; add an optional access-checked
    `badgeProvider` and serializable descriptor badge;
  - `@brains/cms`: accept workspace query parameters after authorization, include them in
    client query keys, extend the registry enum, render the Inbox workspace, wire its data
    and actions through `app-view`, and render descriptor badges in the workspace rail;
  - `@brains/unified-inbox`: own the query/action/result Zod schemas, CMS registration,
    actor adaptation, fixed-error boundary, bounded workspace snapshot, redacted
    Dashboard DTO, and ordered URL handoff to Dashboard and digest.

  The workspace is the primary triage surface:
  - a compact header shows open and high-priority counts plus per-source availability;
  - source and urgency filters are server-applied before paging; filters and selection are
    transient workspace state, and changing either filter returns to the first page;
  - pages contain at most 100 entries, expose the filtered total, and provide **Load
    more** while more entries remain;
  - desktop uses a list/detail layout; narrow screens navigate list → detail, move focus to
    the detail heading, and return focus to the originating row on Back;
  - rows show urgency, source, title, and received time; the detail view adds the
    content-safe summary, optional source-entity link, and currently offered actions;
  - the rail shows an access-checked open-attention badge without fetching workspace
    pages;
  - action submission goes through `InboxOperatorService`: confirmation is server-gated,
    the dialog traps focus and restores it to its trigger, the active action is disabled
    while pending, status/error updates use an `aria-live` region, source errors are fixed
    before reaching CMS, and completion invalidates the current query so resolved items
    disappear without returning a full projection in the action response;
  - the Dashboard widget becomes a read-only digest with the redacted five-entry DTO and
    an **Open Inbox** management link; when CMS is absent it shows the explicit no-browser-
    triage fallback instead of controls;
  - the daily digest links to the same workspace URL when available; `inbox_list` remains
    the conversational read surface;
  - remove the Dashboard mutation script and custom action route once CMS owns the browser
    action path.

  _Tests:_
  - in `@brains/plugins`/CMS server: query parameters reach a provider only after access;
    invalid queries fail closed; descriptor badges are access-checked and failure-isolated;
  - in `@brains/unified-inbox`: filter-before-page ordering, offset/limit bounds and totals;
    unconfirmed actions produce no source call; confirmed actions re-check the offered
    action; actions withdrawn between confirmation and execution are refused; CMS actors
    map to `InboxActor`; raw source exceptions never appear in action results; completed
    actions contain no projection; Dashboard DTO field allowlist and five-entry cap;
    workspace-first registration order, custom CMS mount URL, no-CMS fallback, Dashboard
    management link, and digest destination;
  - in `cms/ui-react` (following `email-triage-workspace.test.tsx`): list/detail rendering,
    server-filter query keys, filter reset, paging and **Load more**, entity links,
    confirmation flow, repeat-submit prevention, query invalidation, empty/error states,
    rail badge, keyboard operation, mobile focus transfer, dialog focus trap/restoration,
    and `aria-live` action feedback.

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
- [operator-console-pwa.md](./operator-console-pwa.md) — the installable operator shell
  that hosts the CMS workspace and its Dashboard entry point.
