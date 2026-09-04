# Plan: One control vocabulary for the app

## Status

**Implemented 2026-09-02 after review of the accepted direction and spike.** The review corrected three integration assumptions before implementation: the shared operator renderer also serves Dashboard, Web Chat had no asset manifest, and StyleX does not give every generated rule elevated specificity. The phases below record the delivered build order. Reading surfaces continue to own the phone document scroll, and the operator-view renderer contains author-supplied text within its column.

## Question

[`studio-ux-research.md`](./studio-ux-research.md) settled Studio's _layout_
grammar — one page head, one primary-action rule, two-bar phone chrome. It did
not settle its _material_ grammar. Every surface still draws its own controls,
so the workspaces read as separately built pages that happen to sit behind the
same rail. What is the app's single set of controls, and where do its colours
come from?

The second question turned out to be the one that ordered the first: sites and
app are different products with different customisation contracts, so they do
not want the same styling engine, and what they share is tokens rather than
components.

## Evidence

From the committed phone baselines (`test/visual/console/baselines/*-390x844-*`).

Three button systems with no shared vocabulary: `.btn` and `.save-btn`
(Studio), `.declarative-actions` / `.declarative-pager` / `.declarative-filter`
(operator-view renderer), and `.people-button`, `.people-button--primary`,
`.people-button--danger`, `.people-text-action` (Account). Thirty-six
input and select styling sites across nine files.

What that produces on one screen: Invitations shows a white native `<select>`
("Pending (1)") directly above a beige one ("Private email"), and five button
treatments across the surface — pinned filled accent, outlined accent, filled
dark, large outlined pager, segmented tab.

Chrome budget is spent on those controls. Inbox and Audit both open with two
stacked full-width native selects plus a pager row: roughly 448px on Inbox and
374px on Audit before the first row, against an 844px viewport.

Two further defects that are the same root cause:

- The Invitations form on a phone is an overlay sheet with no scrim, drawn over
  live content, with no title, no close control, a third surface colour, and
  its submit button clipped at the viewport edge.
- `.declarative-action-form` inputs and selects render at 12px. iOS zooms any
  field below 16px on focus and does not zoom back. The `.declarative-query`
  selects were fixed; the action forms were not.

## Decisions

1. **Sites and app are two products and get two component sets.** Public,
   static, brand-themed, visitor-facing is not the same problem as
   authenticated, dense, interactive, operator-facing. `@brains/ui-library`
   stays the site set. The app — Studio and Chat — gets its own. Dashboard is
   a site surface by this line, not an app one: the roadmap calls it "the
   anonymous public brain card", it is unauthenticated, server-rendered, and
   already imports `CardHeader` from the library.

   What the two products share is brand identity, and that is the token
   contract in CSS custom properties, not components. A marketing card and an
   operator row have different jobs; forcing one component set across both was
   the reason this looked like a choice between engines at all.

2. **The app styles with StyleX; sites and Dashboard stay Tailwind.** The app's
   pathologies are specificity and duplication — `!important` in
   `.declarative-matrix`, chains like
   `.declarative-detail-master .declarative-list > li:has(strong .declarative-inline-link)`,
   buttons defined in four files, and ~4,490 lines of hand-written CSS in a
   repo that otherwise runs `isolatedDeclarations` and
   `exactOptionalPropertyTypes`. StyleX's deterministic merge makes that class
   of bug impossible rather than discouraged; Tailwind would leave it a matter
   of discipline.

   Sites keep Tailwind because `themeOverride` is arbitrary operator-supplied
   CSS (`z.string()`, composed by `resolveTheme`), which only works against
   custom properties. StyleX could not express that contract.

3. **Radix supplies the app's interactive primitives, styled with StyleX.**
   The gaps are behavioural: the hand-rolled focus trap in
   `confirm-dialog.tsx`, the `<details>`-based phone overflow menu, the pane
   switcher, filter toggles, the boolean switch. Radix is unstyled, so it
   composes with StyleX as readily as with CVA, and the phone workspace
   picker already runs on `@radix-ui/react-select`.

   `WidgetTabs` is the one thing keeping the split from being real:
   `operator-view-renderer.tsx` imports it from `@brains/ui-library`, so the
   app still depends on the site library for its tab behaviour. Radix Tabs
   replaces it, and that import is what closes the boundary.

4. **One Radix packaging convention: the unified `radix-ui` package.** It is
   already how web-chat depends on Radix (`^1.6.0`), while Studio uses the
   scoped `@radix-ui/react-select` (`^2.3.3`). Two conventions for the same
   dependency is how the button problem started; the app settles on one before
   it adds Dialog, DropdownMenu, Tabs, and Switch to the pile. Scoped packages
   in app code migrate to the unified one as each primitive lands.

5. **`console.css` declares no colour literals.** Both climates alias
   `--color-*`; the values come from a theme. This is the reason the palette
   currently exists twice: instrument hardcodes one and paper restates another
   as `var()` fallbacks that never resolve, because no console shell injects a
   theme.

6. **Each brain's console follows its own theme, with an app-owned neutral theme as the built-in fallback.** `shell/app/src/resolver/site.ts` already composes configured theme strings via `withThemeBase`; the console shells previously ignored them. Core packages cannot depend on the independently released `@rizom/theme-default`, so `@brains/console-theme` owns only the fallback semantic values needed to keep a brain with no site configured from rendering an unstyled console.

7. **Climate stays the console's name for the theme switch.** It already sets
   both attributes — `data-climate` for console CSS, `data-theme` for
   theme-base — so paper is light and instrument is dark with no mapping
   layer. Instrument stops being a fixed identity and follows the brain's dark
   palette.

8. **Shared console chrome stays plain CSS.** The strip, the palette aliases,
   and the command palette live in `@brains/console-theme` and are consumed by
   all three surfaces regardless of engine. They are chrome and tokens, not
   components, and rewriting them buys nothing.

## What the StyleX spike settled

Run 2026-09-02 against `plugins/studio`, then reverted. StyleX 0.19.0 has no
Bun plugin, but it does not need one: its Babel transform runs inside a
`Bun.BunPlugin` `onLoad` hook, and `processStylexRules` turns the collected
Babel metadata into a stylesheet. A two-variant button produced 15 atomic
rules in 648 bytes.

- **Tokens survive the transform.** Every `var(--console-*)` passes through
  untouched, so one token contract genuinely serves both engines and climate
  switching stays a runtime custom-property swap. This is what makes the
  two-product split possible rather than merely tidy.
- **No runtime injection.** Class names are baked into the JS; nothing calls
  `insertRule`. The output is a stylesheet plus static markup.
- **Review correction: specificity is priority-dependent, not universal.** `processStylexRules` adds `:not(#\#)` only to later property-priority groups; the first group remains an ordinary class, and Studio's legacy React `<style>` element is inserted after the linked StyleX sheet. Migration therefore cannot rely on StyleX beating old selectors. The implementation removes obsolete app rules and scopes the Dashboard renderer's CSS controls under `data-control-engine="css"`. The `!important` in `.declarative-matrix` was removed.
- `@stylexjs/babel-plugin`'s exported type does not satisfy `@babel/core`'s
  `PluginItem`; the integration needs a cast.

## Review findings resolved during implementation

- `theme-base` now supplies `--color-bg-card`, `--color-success`, `--color-warning`, `--color-error`, and `--color-on-accent` under both theme modes. Console warning state no longer reaches into a palette internal.
- Resolved themes begin with `theme-base`, so a theme's font `@import`s are no longer first. `resolveConsoleThemeCSS()` hoists them for Studio and Dashboard and removes them for Web Chat's no-third-party-request policy.
- `@brains/operator-view-react` serves both hydrated Studio and server-rendered Dashboard. It now exposes a host-control seam: Studio supplies the app components, while Dashboard retains CSS/static-tab fallbacks and does not load StyleX or Radix behavior.
- Web Chat has fixed `app.js`/`app.css` routes rather than a manifest. Studio adds `app.css` to its existing bounded manifest.
- The phone query row remains stacked full-width selects; the visual fixture confirms the resulting budget.

## Phases

Each phase ships behind the visual harness and leaves the console renderable.

1. **Complete — fill the token contract.** `theme-base` defines the five app tokens that themes previously omitted. Tests assert each under both `[data-theme]` values.
2. **Complete — inject resolved themes.** Studio, Web Chat, and Dashboard consume the runtime theme with the base-composed, app-owned neutral fallback. Imports are hoisted or deliberately removed according to host policy.
3. **Complete — delete console colour literals.** Both climates alias semantic theme tokens; climate selects matching light/dark theme mode. Every console baseline was reviewed and regenerated.
4. **Complete — compile StyleX in app bundles.** A shared build-tools `Bun.BunPlugin` transforms Studio and Web Chat and emits static CSS. Studio records `app.css` in its bounded manifest; Web Chat serves a fixed CSS asset. A test-only preload applies the compile transform to source imports, while deployed browsers receive no Babel plugin or style injector.
5. **Complete — migrate controls.** Buttons, fields, selects, text areas, filters, pagers, Account actions, and operator actions collapse into `@brains/app-ui-react`. Obsolete Studio/Account material rules were deleted; Dashboard's fallback controls are scoped behind `data-control-engine="css"`. The matrix override no longer uses `!important`.
6. **Complete — use Radix behavior.** Dialog owns app confirmations, DropdownMenu owns document overflow actions, Switch owns booleans, and Tabs owns hydrated workspace/editor panes. The Dashboard-only all-tabs fallback moved into the shared renderer, dropping its `ui-library` dependency without trying to hydrate a public server-rendered card. The phone disclosure is a bounded sheet with scrim, title, and close control. All app primitives use unified `radix-ui`; the scoped Select package is gone.

## Coverage delivered

Content sync, Site, and Publishing now have fixtures at all three viewport sizes in both climates. The harness also checks action-sheet bounds, document overflow, document-versus-pane scrolling, and fixed app controls. Core CI installs Chrome, builds both app bundles, and runs `visual:console`; reviewed baselines are a gate rather than a local convention.
