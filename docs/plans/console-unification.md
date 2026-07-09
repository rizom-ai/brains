# Plan: Console unification (tokens, strip, cross-surface jump)

## Status

Proposed. Mockups at [`docs/console-unification-mockups.html`](../console-unification-mockups.html)
(2026-07-09). **Baseline is the two in-flight worktrees, not main:**
`work/dashboard-tabbed-console` already implements the console strip inside the dashboard
(`ConsoleStrip` in `plugins/dashboard/src/dashboard-page.tsx` — brandmark, hardcoded
Dashboard/Chat/CMS links, inert ⌘K button, Operator/Visitor session chip), and
`work/cms-editor` shipped the first-party editor with its own appbar (brandmark, crumb,
session chip — no surface nav, no ⌘K). This plan starts once those worktrees land in main;
everything below takes their implemented state as given.

## Context

The visual identity has converged (Fraunces + IBM Plex, pulse mark,
vermilion/verdigris/amber) but the substrate is now duplicated **four times**, and the
surfaces still don't link to each other:

1. `plugins/dashboard/src/render/styles/tokens.ts` — `--dashboard-*` (the implemented strip
   is styled from these).
2. `interfaces/web-chat/src/chat-page.css` — `--chat-*` with a hand-maintained fallback
   chain (`--dashboard-*` → `--color-*` → hex literal). No strip at all.
3. `plugins/cms/src/editor-shell.ts` — inline `--paper/--ink/--vermilion…` set in the HTML
   shell.
4. `plugins/cms/ui-react/src/App.tsx` — the same paper set again in an embedded CSS string.

Drift is already real: the CMS editor uses IBM Plex Mono and `#c44a1d` vermilion; the
dashboard uses JetBrains Mono and `#e06a35`. The dashboard strip's surface links are
hardcoded; its ⌘K button does nothing yet; chat and the CMS give the operator no way back
to the other surfaces.

## Goal

1. One semantic token sheet (`--console-*`) with two climates — **instrument** (dark) and
   **paper** (light) — replacing all four palette copies.
2. The console strip (pulse brandmark · Dashboard/Chat/CMS nav · ⌘K · session chip) worn by
   all three surfaces: kept on the dashboard (restyled from the sheet), added to chat,
   retrofitted onto the CMS editor in place of its appbar.
3. A cross-surface ⌘K jump palette — entities open in the CMS, groups open dashboard tabs,
   conversations resume in chat — giving the strip's existing ⌘K affordance a destination.

## Non-goals

- Public site themes (`@brains/theme-base` / `theme-default` / `theme-rizom`) and site UI
  packages (`@rizom/ui`, `@brains/ui-library`) — untouched.
- A cross-framework component library, or changing the Preact-for-SSR / React-for-SPA split.
- Re-planning the tabbed dashboard or the CMS editor — both are built; this plan unifies
  what they wear.
- Live cross-surface state (presence, notifications). The strip is chrome, not a socket.

## Decisions

1. **New shared package `shared/console-theme` (`@brains/console-theme`).** It exports one
   CSS artifact: the token sheet (both climates) plus the strip's and palette's styles.
   Site themes are the wrong home — different consumers, different lifecycle. Consumption
   fits every surface without new tooling: the dashboard interpolates it into its SSR
   `<style>` string (the `DASHBOARD_STYLES` mechanism), web-chat text-imports it (it already
   does `import ... from "./chat-page.css" with { type: "text" }`), and the CMS editor uses
   it in place of the shell/App inline copies.

2. **Semantic tokens, climate-resolved values.** The sheet defines `--console-bg / -panel /
-panel-2 / -line / -line-soft / -text / -text-60 / -text-40 / -accent / -accent-dim /
-ok / -ok-dim / -warn / -warn-dim / -glow`, plus `--console-display / -ui / -mono`, under
   `[data-climate="instrument"]` and `[data-climate="paper"]` scopes. Instrument values come
   from the implemented dashboard console, paper values from the implemented CMS editor —
   extraction, not invention. Mono consolidates on **JetBrains Mono**: the CMS editor's
   IBM Plex Mono (shell font link + `--mono`) is swapped in its retrofit phase.

3. **Climate is the light/dark story, not a fourth concept.** Dashboard and chat default to
   `instrument`, the CMS editor to `paper`. An explicit user toggle persists to
   `localStorage` (`console.climate`) and applies console-wide, so the surfaces agree once
   the operator has expressed a preference.

4. **Surfaces rename, no alias layer.** The four copies are deleted and usages renamed to
   `--console-*` in the same change — single repo, no external consumers of the old names.

5. **The strip stays shared CSS + per-framework markup.** The dashboard's `ConsoleStrip`
   (Preact) is the reference implementation; chat and the CMS render the equivalent ~30
   lines in React. This is a deliberate exception to extract-at-two for the _markup_: the
   copies sit on opposite sides of the Preact/React boundary, and unifying them would
   require exactly the cross-framework component layer this repo avoids. The CSS — where
   the real overlap lives — is extracted into the sheet, and the dashboard's strip styles
   move out of `components.css` into it.

6. **Surface nav derives from registered routes.** The webserver exposes the route registry
   (`getWebRoutes()` → `RegisteredWebRoute[]` in `interfaces/webserver`); the strip renders
   one link per operator surface actually registered (`/`, `/chat`, `/cms`) instead of the
   current hardcoded three — a brain without the CMS plugin shows no CMS link, mirroring
   tabs-from-groups. Brandmark stays constant (`Brain · Console`); the CMS keeps its crumb
   as a second bar below the strip (where its appbar's crumb already sits visually).

7. **Session chip keeps the implemented semantics, styled from the sheet.** The dashboard's
   chip already handles both states (Operator/Sign out, Visitor/Sign in via
   `operatorAccess`); chat adopts the same, folding its session-footer identity indicator
   into the chip. The CMS is operator-only and never renders the visitor state.

8. **The ⌘K jump is one endpoint, two palette renderings.** A guarded
   `GET /api/console/jump?q=` registered by the dashboard plugin (it already has datasource
   access to the entity service and knows the tab groups) returns grouped results: entities
   (door: edit in CMS), dashboard tabs (door: `/#<group>`), and static actions. UI follows
   the strip decision: a small vanilla-JS palette inline on the SSR dashboard (progressive
   enhancement, consistent with its no-SPA rule — this wires the strip's currently-inert
   ⌘K button), and a `cmdk` palette in chat and the CMS (both already carry `cmdk`), each
   appending its local group (conversations in chat, types/entities in the CMS).

## Architecture

```
shared/console-theme/
  src/console.css      ← token sheet (both climates) + strip + palette styles
  src/index.ts         ← exports the CSS as a string for SSR/text-import consumers
  test/console-theme.test.ts
```

Consumers (all changes against the landed worktree state):

- `plugins/dashboard` — `render/styles/tokens.ts` deleted; `DASHBOARD_STYLES` interpolates
  the sheet; strip CSS moves from `components.css` into the sheet; `ConsoleStrip` gains
  route-derived links and `data-climate` wiring.
- `interfaces/web-chat` — `chat-page.css` drops its token definitions and fallback chains;
  the React shell renders the strip above the sessions/thread layout.
- `plugins/cms` — `editor-shell.ts` inline tokens and the `App.tsx` CSS-string tokens are
  replaced by the sheet; the appbar becomes the strip (surface nav + ⌘K added, crumb moves
  to its own bar); font link swaps IBM Plex Mono → JetBrains Mono.

## Phases (thin vertical, tests first)

### Phase 1 — Extract the sheet from the implemented console; dashboard consumes it

The walking skeleton: the sheet exists and the surface that already wears the strip is
styled by it end to end.

- Tests first: both climate scopes define the identical set of `--console-*` names (parse
  the CSS, compare sets); font tokens resolve to Fraunces / IBM Plex Sans / JetBrains Mono;
  `DASHBOARD_STYLES` contains the sheet and no `--dashboard-` definitions remain in
  `plugins/dashboard`; strip links match registered routes (no CMS route → no CMS link).
- Create `shared/console-theme` by extracting the dashboard's implemented tokens
  (instrument) and the CMS editor's implemented paper set; move the strip's CSS into it.
- Dashboard: delete `tokens.ts`, rename usages, derive `ConsoleStrip` links from the route
  registry, wire `data-climate` (default instrument; toggle persists `console.climate`).

### Phase 2 — Web-chat adopts tokens and strip

- Tests first: served chat page contains the sheet and no `--chat-*` definitions; the strip
  renders with `here` = Chat and route-derived links; operator session renders the operator
  chip, anonymous renders the visitor chip.
- Replace `chat-page.css` token declarations and fallback chains with `--console-*` usages;
  render the strip (React, mirroring `ConsoleStrip`) above the sessions/thread layout; fold
  the session footer's identity indicator into the chip.

### Phase 3 — CMS editor retrofit: appbar → strip, inline tokens → sheet

- Tests first: editor shell and App contain no local token definitions (both inline copies
  gone); the chrome renders surface nav (`here` = CMS) and ⌘K alongside the existing
  brandmark/session chip; crumb renders in its own bar below the strip; paper climate is
  the default; mono resolves to JetBrains Mono.
- Replace the shell's inline `:root` block and the App's CSS-string tokens with the sheet;
  extend the appbar into the strip; swap the font link.

### Phase 4 — Cross-surface ⌘K jump

- Tests first: `/api/console/jump` returns 401 without an operator session; a query returns
  grouped results (entities via entity-service search, tabs from the group registry,
  actions) with stable shape; entity results carry the CMS edit URL and tab results the
  dashboard anchor.
- Endpoint in `plugins/dashboard`; vanilla-JS palette inline on the dashboard wiring the
  strip's existing ⌘K button; `cmdk` palettes in chat and the CMS consuming the same
  endpoint and appending their local groups.

## Verification

1. `rg -- '--dashboard-|--chat-'` returns no CSS custom-property definitions anywhere, and
   `plugins/cms` contains no local palette declarations; all operator-surface styling
   resolves from `@brains/console-theme`.
2. Dashboard, chat, and the CMS render the same strip: constant brandmark, route-derived
   surface links with correct `here`, ⌘K, session chip — visually identical chrome, paper
   climate on the CMS.
3. Toggling climate on one surface changes the others on next load (`console.climate`);
   defaults hold (instrument for dashboard/chat, paper for CMS) before any explicit toggle.
4. Signed out: dashboard and chat show the visitor chip with a sign-in door; `/cms` stays
   unreachable (existing guard).
5. ⌘K from any surface: an entity result opens that entity in the CMS editor; a tab result
   lands on the dashboard tab; a conversation result resumes in chat.
6. Per-package gates pass: `bun run --filter @brains/console-theme --filter @brains/dashboard
--filter @brains/web-chat --filter @brains/cms typecheck | lint | test`.

## Related

- [`docs/console-unification-mockups.html`](../console-unification-mockups.html) — approved
  direction: trio, strip anatomy + climates, chat surface, ⌘K palette.
- `work/dashboard-tabbed-console` (worktree) — implemented tabbed console + `ConsoleStrip`;
  source of the instrument token values and the strip's reference markup.
- `work/cms-editor` (worktree) — implemented first-party editor + appbar; source of the
  paper token values; Phase 3 retrofits it.
- [`dashboard-tabbed-console.md`](./dashboard-tabbed-console.md) /
  [`first-party-cms-editor.md`](./first-party-cms-editor.md) — the sibling plans whose
  surfaces this unifies (both deleted when their worktrees land; this plan carries the
  unification story from there).
- `interfaces/web-chat/src/chat-page.css` — `--chat-*` fallback chains being replaced.
- `interfaces/webserver` — `getWebRoutes()` route registry the surface nav derives from.
