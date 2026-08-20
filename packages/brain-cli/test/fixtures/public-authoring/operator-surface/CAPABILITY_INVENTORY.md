# Current operator-surface capability inventory

## Purpose

This is the Phase 4 completeness baseline for the
[stable authoring ledger](../../../../../../docs/public-release/AUTHORING_API_0.2.md).
It inventories every first-party Dashboard widget and CMS workspace present
when the completeness revision was accepted, including the later bounded
`card` and primary/aside `columns` composition extension.

A public semantic protocol is complete only when every entry below has running
conformance evidence through the same definition and normalization path used by
an external package. No private renderer, component, script, stylesheet,
renderer name, raw internal URL, or opaque command counts as public contract
evidence.

“Equivalent” means preserving information, available operations, caller and
permission behavior, interaction state, accessibility meaning, and responsive
intent. Exact markup, CSS, animation, decorative geometry, and private route
spelling are host implementation details.

## Accepted boundaries applied to the inventory

- Dashboard widgets and CMS workspaces remain independent declarations.
- Dashboard and CMS own markup, browser behavior, routes, and internal links.
- Authors return closed, typed semantic views; they do not return UI code or a
  generic DOM tree.
- Shared primitives use typed Dashboard and CMS profiles.
- Definitions are immutable. Data, view results, query options, and
  caller-filtered typed catalogs may vary at runtime.
- Dashboard may be anonymous. CMS is authenticated.
- Workspace actions are typed, workspace-scoped capabilities.
- Account secrets are absent from all operator callback contexts.
- An absent host performs no observable work.

Existing raw scripts and URLs identify user outcomes that the host must retain;
they do not justify carrying those implementation mechanisms into the public
contract.

## Phase 4 slice assignment

| Slice                                                          | Surfaces                                                                                                                                                                                 |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4b — Walking skeleton                                          | Public reading fixture's Dashboard widget and CMS workspace                                                                                                                              |
| 4c — Collections, composition, and host launches               | Skills; SWOT; Agent Network; Open Action Items; Conversation Memory Coverage; Recent Decisions; Recent Conversation Memory; Topics; Top Wishes; Publication Pipeline; Site Health; Inbox |
| 4d — Spatial presentation                                      | Agent Proximity; Knowledge Map                                                                                                                                                           |
| 4e — Operational CMS foundations                               | Directory Sync; Site                                                                                                                                                                     |
| 4f — Server state, dynamic catalogs, and prepared confirmation | Unified Inbox; Publishing                                                                                                                                                                |
| 4g — Closeout                                                  | All converted surfaces and removal of private renderer paths                                                                                                                             |

The reading fixture in 4b is not a built-in inventory entry. It is the smallest
existing public Dashboard/CMS pair and therefore the walking-skeleton proof
before built-ins from several plugin families are converted.

## Dashboard inventory

### 1. Agent Network

Implementation source:

- `entities/agent-discovery/src/lib/agent-dashboard.ts`

The former Dashboard component, stylesheet, and script were removed in 4g.

Required semantics:

- two top-level views with counts: agents and skills;
- nested agent-kind tabs for all, person, team, and organization;
- local skill filtering by dynamically supplied tags and counts;
- list rows with stable IDs, descriptions, multiple tags, status, and source;
- conditional admin-only “invite person” launch for eligible external peers;
- empty states and keyboard-operable tabs/filters.

The current session-storage script and `/admin` path become a typed host-owned
launch intent. They are not author script or route fields.

### 2. Agent Proximity

Dashboard implementation sources:

- `entities/agent-discovery/src/lib/agent-dashboard.ts`
- `entities/agent-discovery/src/lib/proximity-map-schema.ts`

The React map and script remain only for the independent public site template; Dashboard no longer registers either.

Required semantics:

- a radial relationship map centered on identity or a centroid fallback;
- typed nodes with kind, status, tags, normalized distance, and bearing;
- clusters with membership and internal links;
- second-order sightings linked to one or more introducing nodes;
- distance strata, legend, active/pending/archive distinctions, and counts;
- hover, focus, click, and touch selection with bounded text-only detail;
- selection emphasis that preserves related nodes and dims unrelated content;
- an accessible map label and keyboard-focusable data points;
- a deterministic responsive layout.

The organic SVG paths, spores, shimmer, exact coordinates, and animation are
host rendering choices. Distance, bearing, membership, and relationships are
semantic data.

### 3. Skills

Source: `entities/agent-discovery/src/lib/skill-dashboard.ts`

Required semantics:

- bounded list with stable IDs and labels;
- deterministic empty state.

### 4. SWOT

Implementation source: `entities/assessment/src/plugin.ts`. The former Dashboard component and stylesheet were removed in 4g.

Required semantics:

- explicit generating state;
- a labeled two-by-two matrix of strengths, weaknesses, opportunities, and
  threats;
- ordered items with title and optional detail in each cell;
- distinct semantic tone per cell;
- accessible matrix/grid labeling and responsive collapse behavior.

### 5. Open Action Items

Source: `entities/conversation-memory/src/lib/widgets/action-items.ts`

Required semantics:

- stable list rows with title, optional description, multiple metadata values,
  and status;
- uncapped open-item digest and attention count while display rows remain
  bounded;
- status-first, recency-second ordering.

### 6. Conversation Memory Coverage

Source: `entities/conversation-memory/src/lib/widgets/coverage.ts`

Required semantics:

- stable list rows with count and status annotations;
- disabled, active, current, stale, pending, and fractional coverage states;
- deterministic ordering and bounded recent detail.

### 7. Recent Decisions

Source: `entities/conversation-memory/src/lib/widgets/decisions.ts`

Required semantics:

- stable list rows with optional description, multiple metadata values, and
  active/superseded state;
- state-first, recency-second ordering.

### 8. Recent Conversation Memory

Implementation sources:

- `entities/conversation-memory/src/lib/widgets/recent-memory.ts`
- `entities/conversation-memory/src/lib/widgets/recent-memory-register.ts`

The former Dashboard component was removed in 4g.

Required semantics:

- local tabs for all recent entries and one recent entry per channel;
- tab counts;
- stable list rows with title, key point, channel, time range, and message
  count;
- keyboard-operable tabs and deterministic empty states.

### 9. Topics

Source: `entities/topics/src/lib/dashboard-widget.ts`

Required semantics:

- recency-ordered bounded list with stable IDs, title, and optional summary;
- latest-topic digest and deterministic empty state.

### 10. Knowledge Map

Sources:

- `entities/topics/src/lib/knowledge-map-data.ts`
- `entities/topics/src/widgets/knowledge-map.tsx`

Required semantics:

- a deterministic normalized two-dimensional semantic projection;
- typed points with stable ID, entity definition/reference, label, category,
  coordinates, and optional zone membership;
- labeled topic zones with coordinates and member IDs;
- visible distinctions for published, skill, high-signal, and background
  points;
- zone relationships derived from shared membership;
- a legend and bounded non-colliding labels;
- a complete accessible text description of the projection;
- responsive host layout without exposing SVG or CSS.

The current blob paths, glow, mist, label-placement algorithm, and exact SVG are
host implementation. Coordinates, categories, zones, and membership are
semantic.

### 11. Top Wishes

Source: `entities/wishlist/src/index.ts`

Required semantics:

- demand-ordered list with stable IDs, title, count, priority, and status;
- top-wish digest and deterministic empty state.

### 12. Publication Pipeline

Sources:

- `plugins/content-pipeline/src/lib/dashboard-widget.ts`
- `plugins/dashboard/src/render/widget-card.tsx`

Required semantics:

- queued, generating, needs-attention, and published statistics;
- bounded publication failures with title and bounded error text;
- digest and attention count;
- a host-owned launch to the installed publishing surface when available.

The widget does not reference or own the Publishing workspace. The host launch
is optional navigation metadata resolved outside both declarations.

### 13. Site Health

Source: `plugins/site-builder/src/lib/dashboard-widget.ts`

Required semantics:

- preview and production environment state with bounded details;
- active, cancelled, failed, current, not-built, and unavailable states;
- failure notices;
- safe external preview/live links;
- digest and failure attention count;
- optional host-owned launch to the installed Site workspace.

### 14. Inbox

Sources:

- `plugins/unified-inbox/src/dashboard-widget.ts`
- `plugins/unified-inbox/src/schemas.ts`

Required semantics:

- open, high-priority, available-source, and unavailable-source statistics;
- bounded recent item list with source, received time, and urgency;
- unavailable-source notice and clear empty state;
- digest and high-priority attention count;
- optional host-owned launch to the installed Inbox surface.

## CMS workspace inventory

### 1. Directory Sync

Implementation sources:

- `plugins/directory-sync/src/lib/cms-workspace.ts`
- `plugins/cms/ui-react/src/declarative-workspace.tsx`

Required semantics:

- health header and last-settled status;
- file, entity-type, branch, issue, and remote-delta statistics;
- a directional Entity DB → directory → optional Git flow;
- typed Sync Now action with disabled/busy state;
- active-run progress and state;
- recent ordered runs with outcome, source, metrics, and completion time;
- issue notices with optional paths;
- automation and source facts;
- entity-type coverage meters;
- responsive primary/aside grouping and accessible labels.

### 2. Site

Implementation sources:

- `plugins/site-builder/src/lib/site-workspace.ts`
- `plugins/cms/ui-react/src/declarative-workspace.tsx`

Required semantics:

- paired preview and production environment cards;
- environment state, URL, last success, warnings, active work, and failure;
- typed preview and production build actions with disabled/busy state;
- host-owned static production confirmation;
- recent ordered builds with outcome and result;
- automation facts and bounded registered-route list;
- safe external site links and host-owned entity navigation for site metadata;
- responsive grouping and accessible action/status feedback.

### 3. Publishing

Sources:

- `plugins/content-pipeline/src/lib/cms-workspace.ts`
- `plugins/cms/ui-react/src/declarative-workspace.tsx`
- `plugins/content-pipeline/src/provider-registry.ts`

Required semantics:

- caller-filtered dynamic entity coverage from publish-provider registrations;
- queued, generating, needs-attention, and published statistics;
- an ordered, destination-scoped queue with typed entity links;
- caller-visible reorder positions mapped safely to absolute queue positions;
- conditional reorder/remove row actions with busy state;
- generating-job list with entity targets and status;
- failure list with entity targets, bounded errors, and retry actions;
- queue, remove, reorder, retry, and publish action definitions;
- provider-prepared publication confirmation with bounded preview, content-hash
  binding, token, expiry, caller/action/input binding, and replay protection;
- typed host-owned navigation to dynamically covered entity editors.

Provider registrations must carry typed entity definitions rather than only
entity-type strings before they can satisfy the public catalog contract.

### 4. Unified Inbox

Sources:

- `plugins/unified-inbox/src/operator-cms.ts`
- `plugins/unified-inbox/src/operator-service.ts`
- `plugins/unified-inbox/src/schemas.ts`
- `plugins/cms/ui-react/src/declarative-workspace.tsx`
- `shell/plugins/src/inbox-registry.ts`
- `shell/plugins/src/inbox-follow-up-registry.ts`

Required semantics:

- summary counts and per-source availability;
- typed canonical query state for source, urgency, dynamic source facets,
  offset, limit, and selected detail;
- server-side filtering and bounded previous/next paging that preserves the
  open selection and its source-owned controls;
- caller-visible source errors without internal error disclosure;
- a keyboard-accessible server-driven master/detail presentation with bounded
  host-rendered plain text;
- item title, summary, contact, thread ordinal, source, urgency, received time,
  and typed entity reference;
- caller-filtered dynamic action definitions supplied by source packages;
- conditional action availability and busy/error/success feedback;
- host-owned prepared confirmation for source actions requiring confirmation;
- caller-filtered typed follow-up launches supplied by destination packages;
- canonical URL updates and responsive single-pane fallback.

Inbox source registrations retain provider-local IDs and resolved follow-up
metadata behind the server boundary. The public workspace lifts offered actions
into immutable typed capabilities and emits only host-owned detail, entity,
Chat, and note-capture launch intents; private resolved hrefs and handoff state
are never serialized.

## Semantic capability families demonstrated

The inventory demonstrates the following families. Names here describe needs;
they are not frozen public type names.

1. **Content:** headings, descriptions, stats, key/value facts, notices, lists,
   tables, empty states, and bounded status feedback.
2. **Annotations:** tone, state, count, tags, multiple metadata values, badges,
   time, progress, and disabled/busy state.
3. **Composition:** ordered groups, bounded cards, primary/aside columns, tabs,
   and split master/detail presentation. The host owns responsive layout, and
   unsupported nested containers are rejected rather than dropped.
4. **Local interaction:** tab selection, declared local filters, item selection,
   keyboard focus, touch/hover detail, legends, and related-item emphasis.
5. **Server interaction:** typed canonical query state, dynamic facets,
   filtering, sorting, paging, append/reset, selection, and deep links.
6. **Relational presentation:** matrices, directional flows, coverage meters,
   normalized Cartesian maps, radial maps, nodes, links, zones, clusters,
   membership, sightings, legends, and bounded semantic detail.
7. **Capabilities:** static and caller-filtered typed entity/action catalogs,
   conditional row/item actions, reordering, static confirmation, prepared
   confirmation, and typed output.
8. **Navigation:** safe external links, typed entity targets, and host-owned
   launch intents with validated state. No author route is part of the view.
9. **Security/lifecycle:** caller admission, narrow authorization, CSRF,
   secret-redacted settings, cancellation, cleanup, worker exclusion, and
   absent-host no-op behavior.
10. **Accessibility:** semantic labels, keyboard operation, deterministic focus,
    text alternatives for spatial views, live status feedback, and responsive
    reading order.

## Completion evidence

Phase 4 closes every demonstrated gap above:

- distinct typed Dashboard and CMS profiles normalize the complete closed
  primitive vocabulary;
- Dashboard tabs, filters, matrices, spatial interaction, launches, and
  accessibility are host-owned;
- CMS query state, paging, catalogs, grouping, cards, primary/aside columns,
  flow, meters, progress, bounded plain-text detail, actions, launches, and
  responsive rendering are host-owned;
- prepared confirmation is caller-, action-, input-, revision-, expiry-, and
  one-use-bound;
- permission floors, narrow-only policy, caller-scoped entities, redacted
  settings, cancellation, cleanup, worker exclusion, and absent-host no-op
  behavior are runtime-enforced;
- all 14 Dashboard and four CMS registrations use the public definition,
  binding, validation, normalization, permission, and host-rendering paths; and
- Dashboard accepts only `DeclarativeOperatorWidget`, CMS accepts only
  `DeclarativeOperatorWorkspace`, and the former private components, assets,
  mutations, snapshot types, tests, and renderer dispatch were removed.

Representative checked evidence:

- `shell/plugins/test/dashboard-widget-runtime.test.ts`;
- `shell/plugins/test/cms-workspace-runtime.test.ts`;
- `plugins/dashboard/test/widget-ui.test.tsx`;
- `plugins/dashboard/test/ui-script.test.ts`;
- `plugins/cms/test/declarative-workspace.test.ts`;
- `plugins/cms/ui-react/src/declarative-workspace.test.tsx`;
- `entities/agent-discovery/test/plugin.test.ts`;
- `entities/topics/test/lib/knowledge-map-widget.test.tsx`;
- `plugins/site-builder/test/unit/plugin.test.ts`;
- `plugins/unified-inbox/test/dashboard-widget.test.ts`;
- `plugins/unified-inbox/test/operator-cms.test.ts`;
- `plugins/directory-sync/test/cms-workspace.test.ts`;
- `plugins/content-pipeline/test/cms-workspace.test.ts`; and
- `packages/brain-cli/test/public-authoring-phase6-packed.test.ts`.

The React spatial renderers still used by public site templates are independent
site presentation, not Dashboard registrations or operator-authoring escape
hatches.
