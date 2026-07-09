# Plan: Dashboard tabbed console

## Status

In progress on `work/dashboard-tabbed-console`. All four phases are in place and gates are
green (branch merged up to main 2026-07-08). The console chrome, Overview, and System tab
now match the approved mockups: single frame, mockup strip (brandmark/⌘K/session chip),
fixed Overview composition (vitals with sub-lines and status dots, identity capsule,
digest cards with "open →" doors, time|glyph|what ledger), System split into Semantic
index / Content sync (with write-pipeline mini) / Job queue table with status pills.
Remaining visual gap: the Publishing tab's pipeline widget still renders as filter tabs,
not the mockup's three-lane board (renderer lives in `widget-card.tsx`). Design settled
2026-07-07 (mockups approved direction; see below). The current
dashboard (`plugins/dashboard`) renders everything on one page — identity column, entity
summary, primary/secondary widget stack, sidebar with interactions/endpoints/runtime — and
has grown unwieldy as more plugins register widgets. This plan restructures it into a
tabbed operator console.

## Design mockups

Interactive mockups live at [`docs/dashboard-tabs-mockups.html`](../dashboard-tabs-mockups.html)
(open in a browser). Three screens — Overview, Publishing tab, System tab — in the
dashboard's dark instrument character (Fraunces + IBM Plex + JetBrains Mono, pulse mark).

## Decisions

1. **Operator-first.** The tabbed layout is designed for the signed-in operator, where the
   unwieldiness lives. The public (logged-out) view is a follow-on derivative — likely the
   Overview's public-visible subset on a single page — and is not designed here.

2. **Tabs are derived from widget groups, not configured.** Each widget declares a
   `group: string`. The dashboard renders **Overview** plus one tab per non-empty group,
   ordered by a fixed group-order list with unknown groups appended. No tab registry, no
   empty tabs: a tab exists exactly when a widget claims its group.

3. **Group ids anticipate the bundle vocabulary without depending on it.** Bundles
   (`brain-model-unification.md`) are not implemented yet, so tabs cannot map to installed
   bundles today. Instead the initial group ids are chosen to match the planned bundle names
   where the correspondence is obvious — `site`, `publishing`, `team` — plus two
   dashboard-native groups that are not bundles: `knowledge` (capture: notes/links/topics/
   wishlist) and `network` (agents/skills/a2a/atproto discovery), and `system` for infra.
   When bundles ship, plugin widgets already carry converged ids; if a bundle cut disagrees
   with a group cut, renaming a widget's `group` string is the entire migration.

4. **One console.** The top strip is shared chrome across operator surfaces — pulse
   brandmark, surface nav (Dashboard / Chat / CMS), ⌘K, session chip — so the three read as
   one console. The strip ships here as part of the dashboard and is extracted for reuse by
   the CMS editor (`first-party-cms-editor.md` — its mockups already show the same strip)
   and web-chat when they adopt it; this plan only requires the dashboard to render it with
   working links.

5. **Overview answers "anything need me?"** It is a fixed composition, not a widget dump:
   a vitals row (entities, interactions, semantic-index readiness, last write/commit), the
   identity capsule (one line), one **digest card per group** (3–4 headline figures, the
   card is the door to its tab), and the activity ledger (recent entity events). Widgets do
   not render on Overview; groups contribute digest lines instead (see Architecture).

6. **Badges count operator work, not volume.** A tab shows a solid badge for items awaiting
   a decision (reviews, approvals, discovered agents pending) and a muted badge for plain
   counts. Widgets report the "needs operator" number; the tab sums its group.

7. **Still server-rendered Preact.** Same SSR + tiny-inline-script model as today. Tabs are
   progressive enhancement over anchor targets (`#publishing` scrolls/activates; no JS still
   shows all sections stacked). No SPA, no client framework change — the repo's
   Preact-for-server-surfaces split stays intact.

## Architecture

### Widget schema (extends `plugins/dashboard/src/widget-schema.ts`)

- `group: string` — required for plugin widgets; the tab this widget lives in.
- `needsOperator?: number` — count of items awaiting a decision (feeds the tab badge).
- `digest?: Array<{ label: string; value: string; tone?: "plain" | "good" | "warn" }>` —
  up to four lines contributed to the group's Overview digest card.
- `section: primary | secondary | sidebar` is kept but reinterpreted **within the tab**
  (primary/secondary = main column order, sidebar = narrow column).
- **Back-compat:** widgets without `group` map to `system` (sidebar section) or `knowledge`
  (primary/secondary) during migration; a debug log names them until all registrations are
  explicit.

### Initial group map for today's widgets

| Group        | Today's widgets/cards                                                           |
| ------------ | ------------------------------------------------------------------------------- |
| (overview)   | vitals row, identity capsule, digests, activity ledger (built-in, fixed)        |
| `knowledge`  | entity summary breakdown, topics, wishlist                                      |
| `publishing` | content-pipeline "Publication Pipeline", newsletter, social/atproto outbound    |
| `site`       | site build status, analytics, OG/dashboard-root                                 |
| `network`    | agent-discovery agents + skills, a2a activity, assessment (SWOT)                |
| `system`     | runtime card, endpoints card, job queue, directory-sync status, index readiness |

New Overview/System data (vitals, ledger, job table, sync status, index gauge) comes from
services the dashboard datasource already reaches or that expose status APIs
(`entityService` counts + `isIndexReady`, job-queue status, directory-sync status); each is
a small datasource addition, listed per phase.

### Rendering

- `dashboard-page.tsx` renders: console strip → masthead → tab bar (derived) → one
  `<section data-tab>` per tab → colophon. The inline tab script toggles `is-active` and
  syncs `location.hash`; the active tab survives reload.
- Visibility filtering is unchanged (`PermissionService.hasPermission` per widget); a tab
  whose widgets are all filtered out for the viewer is not rendered.

## Non-goals

- The public/visitor layout (follow-on; derives from Overview once the operator console
  settles).
- Adopting the console strip inside web-chat and the CMS editor (their plans/pull).
- Client-side interactivity beyond tab switching (no live updates/polling in this pass).
- Mapping tabs to _installed bundles_ — revisit in `brain-model-unification.md` Phase 1+,
  where the expected change is only supplying group ids from bundle composition.

## Phases (thin vertical, tests first)

### Phase 1 — Tab skeleton over existing widgets

- Widget schema gains `group` (+ back-compat mapping); tab bar derived from groups;
  sections render per tab; hash-based activation script; console strip with surface links.
- Tests: tab set derives from registered groups (no empty tabs); ungrouped widget maps to
  its fallback with a log; per-viewer visibility can remove a whole tab; no-JS output
  contains all sections stacked.

### Phase 2 — Overview composition

- Vitals row (entity counts, interactions, `isIndexReady`, last directory-sync write);
  identity capsule; digest cards fed by widgets' `digest` lines; activity ledger from
  recent entity events.
- Tests: digest lines flow from widget registration to the group card; vitals degrade
  gracefully when a source is unavailable (placeholder, not a crash).

### Phase 3 — Operator badges + System tab data

- `needsOperator` summing per tab; solid vs muted badge rendering; System tab gains job
  queue table, sync status with the mini write-pipeline, index gauge.
- Tests: badge math; badge hidden at zero; job/sync/index datasource fields present.

### Phase 4 — Existing widget migration

- All current registrations (`content-pipeline`, `topics`, `wishlist`, `assessment`,
  `agent-discovery` agents + skills) declare explicit `group`/`digest`/`needsOperator`;
  remove the back-compat fallback; update the widget-registration docs.
- Tests: registry rejects group-less widgets once the fallback is removed.

## Verification

1. Signed in, the dashboard shows Overview + one tab per non-empty group, nothing else.
2. A brain without publishing plugins shows no Publishing tab; registering one publishing
   widget makes the tab (and its digest card) appear with no dashboard change.
3. Overview answers at a glance: vitals, per-group digests with doors, activity ledger.
4. Tab badges equal the sum of their widgets' `needsOperator`; zero renders no badge.
5. With JS disabled, all tab sections render stacked; with JS, hash deep-links work.
6. Widget visibility filtering still holds per viewer; fully-filtered tabs disappear.
7. Console strip links to Chat and CMS; session chip reflects the operator session.
8. Per-package gates pass: `bun run --filter @brains/dashboard typecheck | lint | test`.

## Related

- [`docs/dashboard-tabs-mockups.html`](../dashboard-tabs-mockups.html) — approved mockups.
- [`console-unification.md`](./console-unification.md) — follow-on: extracts the token
  sheet (`@brains/console-theme`) from the console implemented here, spreads the strip to
  chat/CMS, and wires the strip's ⌘K to a cross-surface jump. Mockups:
  [`docs/console-unification-mockups.html`](../console-unification-mockups.html).
- [`brain-model-unification.md`](./brain-model-unification.md) — bundle vocabulary the
  group ids converge toward.
- [`first-party-cms-editor.md`](./first-party-cms-editor.md) — sibling console surface;
  shares the console strip.
- `plugins/dashboard` — widget registry, datasource, SSR page being restructured.
