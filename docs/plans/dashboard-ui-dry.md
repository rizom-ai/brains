# Plan: Complete dashboard UI cleanup

## Status

**In progress.** Commit `3d564e70b` established shared SSR primitives, a generic
tab controller, generic tab/filter classes, and removed stale identity-card code. That
commit is the foundation, not the finish line.

The remaining phases below are required before this cleanup is considered complete.

## Goal

Make the server-rendered dashboard and its custom widgets easy to extend without:

- duplicating card, list, tab, filter, or empty-state markup;
- placing entity-owned widget CSS in `@brains/dashboard`;
- adding one-off scripts for behavior that is generic across widgets;
- embedding the same static dashboard CSS and JavaScript into every HTML response;
- concentrating the complete dashboard composition in one large source file.

Preserve progressive enhancement, semantic HTML, accessibility, current visual design,
and backward compatibility for registered widgets.

## Non-goals

- Introducing HTMX, Alpine, or client-side Preact hydration.
- Redesigning the approved dashboard visual language.
- Turning the dashboard into a SPA.
- Adding live polling, mutations, or partial-response endpoints.
- Reworking the specialized proximity-map interaction into declarative behavior.
- Implementing PWA caching or service-worker behavior.

## Current findings

After Phase 1:

- `plugins/dashboard/src/dashboard-page.tsx` is now a 10-line render entry; document,
  tabs, overview, system cards, console strip, and widget panels have focused modules.
- Dashboard-local CSS is split by ownership into foundation, overview, system, widget
  primitives, and compatibility sheets (about 37 KB total); combined with the shared
  console theme, the emitted base stylesheet is about 51 KB before response compression.
- SWOT, agent-network, and proximity-map styles now live in their owning entity packages
  and are emitted only for visible widgets.
- The widget contract carries deduplicated package-owned `clientStyles` and
  `clientScript` assets.
- Recent-memory, agent-network, and built-in list widgets now share typed tab, filter,
  list, status, metadata, and empty-state primitives.
- Generic owner-scoped filtering removed the agent-network script; proximity-map
  inspection is now the only custom widget script.
- The base dashboard CSS and console scripts still add about 58 KB of repeated inline
  source to every rendered page and cannot be cached independently.
- The committed tab test verifies script contents; the nested/hash behavior is not yet
  exercised by a checked-in DOM test.
- Lint is currently blocked on `main` by the ESLint/TypeScript parser error involving
  `typescript-estree` and `Extension.Cjs`. This is not caused by the dashboard changes,
  but final validation must not silently omit it.

## Architecture decisions

### Keep progressive server rendering

Preact continues to render complete HTML on the server. JavaScript enhances local
interaction only. No framework dependency is justified for the remaining tabs, filters,
climate control, palette, or visualization behavior.

### Make widget ownership explicit

`@brains/dashboard` owns:

- the dashboard document and layout;
- generic console widget primitives;
- generic tabs and filter behavior;
- built-in dashboard card styles.

The package registering a custom widget owns:

- its component and data schema;
- widget-specific styles;
- specialized client behavior.

The registry remains the boundary through which those assets reach the dashboard.

### Preserve compatibility while improving the contract

Keep `clientScript` working. Add style/asset support without forcing existing widgets to
migrate immediately. Existing legacy CSS aliases remain in a clearly marked compatibility
section until all supported external consumers have a migration window.

### Prefer typed components over copied data attributes

The generic behavior controller remains data-attribute driven internally, but widget
authors should normally use exported Preact components that emit the correct classes,
IDs, roles, ARIA relationships, initial active state, and data attributes.

## Completed foundation

- [x] Extract `CardHeader`, `KeyValueList`, and `EmptyState` SSR primitives.
- [x] Replace repeated dashboard card headers and key/value rows.
- [x] Add one owner-aware controller for nested and hash-backed tab sets.
- [x] Migrate dashboard, recent-memory, and agent-network tabs to the generic controller.
- [x] Remove the dedicated recent-memory script.
- [x] Reduce agent-network client behavior to row filtering only.
- [x] Consolidate duplicate tab/filter CSS under generic classes.
- [x] Retain legacy class aliases for compatibility.
- [x] Remove the unused identity card and its conflicting global selectors.
- [x] Add typechecks, package tests, and an initial script-contract test.

## Remaining implementation phases

### Phase 1 — Widget asset ownership

**Status: complete.**

1. Extend the widget registration contract with package-owned styles. Start with
   `clientStyles?: string` for backward compatibility with `clientScript`.
2. Carry styles through registration-message validation, `DashboardWidgetRegistry`,
   widget resolution, and `DashboardRenderInput`.
3. Deduplicate identical style strings just as scripts are deduplicated.
4. Inject resolved widget styles after dashboard primitives so package styles can compose
   from `--console-*` tokens without redefining the palette.
5. Move these selectors to their owning packages:
   - SWOT → `@brains/assessment`;
   - agent-network → `@brains/agent-discovery`;
   - proximity map → `@brains/agent-discovery`.
6. Move associated container, responsive, reduced-motion, and keyframe rules with each
   widget; do not leave split ownership across files.
7. Add a dashboard test asserting that the base sheet contains no `.swot`,
   `.agent-network-*`, or `.proximity-*` selectors.
8. Test asset ordering, deduplication, visibility filtering, and rendering with no custom
   styles.

**Gate:** Removing any custom entity package removes its CSS from dashboard output without
editing `@brains/dashboard`.

### Phase 2 — Typed widget UI and generic filters

**Status: complete.**

1. Promote the useful primitives from internal `render/ui.tsx` into a documented widget UI
   surface exported by `@brains/dashboard`.
2. Add typed components for:
   - tab root, tab list, tab trigger, and tab panel;
   - filter group and filter trigger;
   - list, list row, metadata line, tags, status pill, and empty state.
3. Extend `WidgetComponentProps` with stable widget identity (`pluginId`, `widgetId`, or a
   derived instance ID) so generated tab/panel IDs cannot collide if more than one widget
   instance is rendered.
4. Migrate recent-memory and agent-network to those components.
5. Add generic owner-scoped filter behavior using declarative filter values on controls
   and rows.
6. Migrate agent-network skill filtering and delete its remaining client script.
7. Leave `proximityMapScript` package-owned because pointer/focus geometry and secure
   tooltip construction are genuinely specialized.
8. Document the public widget UI contract and no-JS initial-state behavior.

**Gate:** Custom widgets need no handwritten JavaScript for tabs or list filtering and do
not hand-assemble ARIA relationships.

### Phase 3 — Dashboard source decomposition

**Status: complete.**

1. Reduce `dashboard-page.tsx` to the document render entry point.
2. Move tab grouping, digest construction, and tab-bar rendering into a dashboard-tabs
   module.
3. Move overview composition and its cards into an overview module.
4. Move semantic-index, content-sync, job-queue, endpoint, interaction, and runtime cards
   into a system module/directory.
5. Move the console strip and document shell into focused render modules.
6. Consolidate date/time and status formatting in a small render-format module.
7. Split CSS by ownership:
   - foundation/layout;
   - generic widget primitives;
   - overview;
   - built-in system cards;
   - compatibility aliases.
8. Co-locate each component's responsive/container rules with its stylesheet instead of
   splitting related rules between `components.css` and `responsive.css`.
9. Do not introduce a generic polymorphic `Card` solely to remove semantic `<article>`,
   `<aside>`, and `<section>` wrappers; those differences are intentional.

**Gate:** The page entry is orchestration-only, each stylesheet has one ownership reason,
and changing a built-in card does not require navigating a thousand-line module.

### Phase 4 — Cacheable client assets

1. Serve the static dashboard stylesheet and generic dashboard behavior from versioned or
   content-hashed same-origin routes.
2. Emit `<link rel="stylesheet">` and `<script src>` references instead of repeating the
   static base CSS and scripts in each HTML document.
3. Keep instance-specific `themeCSS` separate; do not accidentally cache one brain's
   dynamic theme as a global asset.
4. Define whether registered widget assets are emitted as content-hashed routes or as one
   deduplicated dynamic bundle. Prefer content hashes so identical assets share browser
   cache entries.
5. Preserve deterministic ordering: console theme, dashboard primitives, then widget
   styles.
6. Add immutable cache headers only to content-addressed assets; the HTML route remains
   dynamic.
7. Coordinate the URL/versioning contract with the separate operator-console PWA plan,
   but do not add service-worker caching here.

**Gate:** Repeated dashboard navigations reuse static CSS/JS from browser cache, while
brain-specific theme and installed-widget output remain correct.

### Phase 5 — Behavior, accessibility, and runtime verification

1. Add `happy-dom` as an explicit dashboard test dependency or expose a shared DOM-test
   helper through an approved test package.
2. Replace the script-content-only tab test with behavior tests covering:
   - initial default activation;
   - hash activation and history updates;
   - nested roots not changing their parent;
   - hidden panel state;
   - `aria-selected`, optional state attributes, and active classes;
   - unknown hashes and empty tab sets.
3. Add equivalent behavior tests for generic filters, including nested widgets and rows
   with multiple tags.
4. Verify keyboard tab semantics and focus behavior. Add arrow/Home/End handling if the
   UI continues to claim the ARIA tab pattern.
5. Start the full Rover test app with its prescribed `bun start:full` script and exercise:
   - top-level dashboard tabs;
   - recent-memory tabs;
   - agent kind and skill filters;
   - proximity pointer, keyboard, and touch behavior;
   - visitor and operator compositions.
6. Verify desktop, tablet, phone, reduced-motion, and both console climates.
7. Verify the top-level no-JS fallback still exposes every dashboard section and document
   the intended no-JS behavior of nested widget views.
8. Run targeted and full affected-package tests, typechecks, formatting, and lint.
9. Resolve the repo-wide lint parser mismatch in a separate focused commit if still
   present; do not bypass or suppress lint.

**Gate:** Checked-in DOM tests and a running full dashboard verify the same behavior; all
available checks pass without bypasses.

## Validation matrix

| Area            | Required checks                                                         |
| --------------- | ----------------------------------------------------------------------- |
| Widget registry | Registration schema, storage, style/script dedupe, visibility filtering |
| SSR output      | Semantic card markup, unique IDs, style order, no-JS sections           |
| Generic tabs    | Hash, nested ownership, ARIA, hidden state, keyboard behavior           |
| Generic filters | Active state, multi-value rows, nested ownership, empty results         |
| CSS ownership   | No entity-specific selectors in dashboard base CSS                      |
| Asset delivery  | Hashed URLs, content types, cache headers, deterministic output         |
| Responsive UI   | 360 px, 640 px, 900 px, wide desktop, container-query cards             |
| Accessibility   | Tab roles, labels/controls, focus, reduced motion                       |
| Compatibility   | Existing `clientScript` and legacy class aliases remain functional      |

## Risks and mitigations

- **Style order changes visuals:** lock ordering in render tests and compare a running full
  dashboard in both climates.
- **Asset ownership creates missing styles:** migrate one widget package at a time and add
  registration/render coverage before deleting dashboard selectors.
- **Generic primitives become too rigid:** keep low-level data-attribute behavior public
  and allow custom markup when a widget has genuinely different semantics.
- **Hard-coded IDs collide:** derive IDs from widget identity supplied by the renderer.
- **No-JS behavior regresses:** render meaningful initial content and keep the top-level
  all-sections fallback.
- **External assets become stale:** use content hashes and immutable caching rather than
  stable URLs with long cache lifetimes.
- **Compatibility aliases become permanent clutter:** mark them deprecated, isolate them,
  and define their removal window rather than mixing them into primary rules indefinitely.

## Definition of done

The cleanup is complete when:

- dashboard base CSS contains only dashboard-owned and generic widget rules;
- custom widget packages register and own their styles and specialized behavior;
- common widget markup comes from typed exported primitives;
- tabs and filters use one tested generic behavior layer;
- only the proximity visualization needs a custom widget script;
- `dashboard-page.tsx` is an orchestration entry rather than the implementation monolith;
- static dashboard CSS/JS is cacheable and no longer duplicated in every HTML response;
- nested tabs, filtering, accessibility, responsive layouts, and no-JS behavior have
  checked-in tests plus full-app verification;
- typecheck, tests, formatting, and lint pass without bypasses.
