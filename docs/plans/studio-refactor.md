# Plan: Studio interface refactor

## Status

**Accepted; Phases 0 and 1 are complete, and Phase 2 is next.** The
second-iteration desktop and phone mockups are the implementation baseline.
This is the implementation successor to
[`studio-ux-research.md`](./studio-ux-research.md). It changes Studio's visual
and interaction grammar only. Chat's operator-surface migration is independent
and belongs to [`studio-chat-integration.md`](./studio-chat-integration.md).

## Shipped baseline

Studio already owns the operator shell, entity library and editor, Overview,
Account presentation, and fixed rendering of source-owned declarative
workspaces. Administration is one tabbed workspace sourced by `plugins/admin`;
auth-service remains authoritative for account and administration operations.
Dashboard is the anonymous public brain card. Those decisions are shipped and
are not reopened here.

The remaining problem is coherence. The library, declarative workspaces,
Account, editor, and Overview share a shell but not one page-head, collection,
action, or phone grammar. The evidence and first mockups are recorded in
[`studio-ux-research.md`](./studio-ux-research.md) and
[`../studio-consolidation-mockups.html`](../studio-consolidation-mockups.html).

## Goal

Give every Studio surface one host-owned responsive grammar while preserving
source ownership, capability admission, URL state, editor behavior, and the
closed renderer boundary.

The result should provide:

- one compact page head with host-derived access, status, totals, attention,
  description, and an optional primary action;
- query controls and pagination co-located with the collection they control;
- semantic table-to-list reflow on narrow screens without guessing from column
  labels or values;
- one explicit primary-action rule: title-row placement on desktop and a pinned
  action bar on phones;
- a two-bar phone chrome budget with visible horizontal overflow affordances;
- the existing editor's Details / Write / Preview and pipeline behavior intact.

## Boundaries

- No Chat package, conversation, streaming, upload, or route migration. The
  generic fixed-workspace frame created here may be consumed later by Chat.
- No Dashboard redesign; Dashboard remains the public card.
- No auth or authorization ownership moves. Access labels are derived from the
  host-enforced admission requirement — active session plus permission floor —
  never accepted as source-authored security prose.
- No arbitrary browser renderers from workspace providers.
- No heuristic mobile semantics. Unannotated tables retain their safe scrolling
  presentation until their source declares a compact representation.
- No editor workflow rewrite. This plan changes composition and responsive
  placement, not drafts, conflicts, repository sync, uploads, or publishing.

## Decisions to accept

### One page-head model

Introduce one internal `StudioPageHead` model and renderer with:

- kicker;
- host-derived access requirement;
- title;
- bounded metadata, attention, status, and totals chips;
- at most one line of description;
- at most one explicit primary action.

Declarative views map their existing title, kicker, description, status, and
leading totals into that model. The library, Account, Overview, and editor use
adapters owned by Studio. The admitted browser receives a bounded,
host-derived access requirement so an active-session Account can say “signed
in” while Trusted and Admin workspaces show their actual floor. The chip cannot
drift from server admission.

Density is the only visual parameter. Desktop may show the kicker and title
rows separately; the phone form compresses the same semantics rather than
inventing a second head component.

### Collection-owned query controls

Extend table collection rendering so server-backed query controls and
pagination belong to the table they affect. The existing standalone query
block remains valid while built-in workspaces migrate; new built-ins should not
place a pager or paired filter at an unrelated screen edge.

### Explicit compact row semantics

Add an optional compact representation to table rows using the existing list
vocabulary: title, metadata, badges, count, and tone. The table keeps ownership
of its row link and actions. At narrow width the host reflows only rows carrying
that representation; it never infers title, provenance, or state from column
position or labels.

### Explicit primary action

Add one optional top-level primary action to an operator view. Existing action
blocks remain in-flow and are never silently hoisted. The host renders the
primary action in the title row on desktop and in the phone action bar, keeping
confirmation, disclosure, pending, error, and ephemeral result state attached
to the same control instance.

These are additive published operator-contract changes. They require runtime
schema coverage, export-ledger review, packed authoring evidence, and a
changeset before visual implementation depends on them.

## Phases

### Phase 0 — Accept the grammar

- Mock the editor, Overview, and one fixed client workspace under the proposed
  head and phone chrome.
- Inventory every Studio surface, table, query control, and candidate primary
  action. Resolve surfaces with zero or multiple primary candidates explicitly.
- Record acceptance or rejection of each research decision in
  `studio-ux-research.md`.

Exit condition: desktop and phone frames are accepted, and every protocol
addition has a named consumer.

### Phase 1 — Add semantics without visual churn

- Tests first for the permission-floor descriptor, collection-owned query
  controls, compact table rows, and singular primary action.
- Extend boundary schemas and runtime types additively; reject malformed compact
  rows and multiple primary actions before rendering.
- Update the authoring ledger, frozen fixtures, packed consumer, and changeset.
- Add normalization tests that map current declarative views into the new head
  model without changing rendered behavior.

Exit condition: all required semantics cross the package boundary, but existing
visual baselines remain stable.

### Phase 2 — One desktop grammar

- Implement `StudioPageHead` and adapt declarative workspaces, the library,
  Account, Overview, and editor.
- Remove the declarative totals region and debug-looking status corner only
  after their information appears in the shared head.
- Move Audit and other server-backed controls into their collection line; give
  collection blocks the full main-column measure.
- Keep workspace source callbacks and auth-service calls unchanged.

Exit condition: all desktop Studio surfaces use one head and collection grammar
with no capability or URL-state regression.

### Phase 3 — Semantic phone reflow

- Reflow annotated table rows into list cards at the accepted breakpoint.
- Migrate People and Audit first, then inventory every remaining table; an
  unannotated table must remain usable and visibly scrollable.
- Collapse the console strip into the phone top bar and make the workspace rail
  horizontally scrollable with a visible fade and keyboard/touch affordance.
- Enforce the two-bar budget with safe-area insets and content-start visual
  assertions rather than one hard-coded pixel height.

Exit condition: 390px baselines contain no clipped table cells or unreachable
workspace chips, and keyboard navigation still reaches every row and control.

### Phase 4 — Primary actions and fixed surfaces

- Move each declared primary action into the desktop head and phone action bar.
- Preserve disclosure forms, prepared confirmations, sensitive ephemeral
  results, disabled states, and editor pipeline feedback.
- Adapt Account and editor-specific actions through the shared rule without
  making either surface declarative.
- Verify the generic fixed-workspace frame needed by future first-party client
  workspaces; do not integrate Chat in this phase.

Exit condition: every surface follows the same action rule, and no action was
chosen by renderer heuristics.

## Validation

- Contract and runtime-schema tests for every additive field.
- Packed external-authoring evidence and export-ledger checks.
- Desktop, tablet, and 390px visual baselines for Library, Overview, Account,
  editor, People, Invitations, and Audit.
- Keyboard, focus, disclosure, confirmation, and ephemeral-result behavior.
- Route-query tests proving filters, pagination, selected detail, refresh, and
  history remain aligned.
- Permission tests proving denied workspace providers are still filtered before
  callbacks and the displayed access requirement equals server admission.

## Risks

- A visual-only table heuristic can silently promote the wrong fact or expose a
  value as a badge. Compact row semantics are source-declared and fail closed.
- Hoisting arbitrary action blocks can separate a form from its result or make
  two actions appear primary. The top-level singular action prevents that.
- Serializing source-authored access text can disagree with server admission.
  The host derives the chip from active-session and permission-floor policy.
- A universal head can flatten important editor or Account state. Adapters keep
  domain state explicit, and the missing mockups block implementation until the
  hierarchy is accepted.
- Phone chrome can pass one viewport while failing safe-area or text-zoom cases.
  Validation covers safe-area insets, keyboard focus, and enlarged text in
  addition to fixed screenshots.
