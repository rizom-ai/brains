# Plan: One control vocabulary for the app

## Status

**Not started; direction accepted 2026-09-02, engine settled by spike the same
day.** The phases below are the build order. Two prerequisites already shipped
and are stated only because the phases depend on them: reading surfaces own the
phone document scroll, and the operator-view renderer contains
author-supplied text within its column.

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
   composes with StyleX as readily as with CVA. `@radix-ui/react-select` is
   already a Studio dependency.

4. **`console.css` declares no colour literals.** Both climates alias
   `--color-*`; the values come from a theme. This is the reason the palette
   currently exists twice: instrument hardcodes one and paper restates another
   as `var()` fallbacks that never resolve, because no console shell injects a
   theme.

5. **Each brain's console follows its own theme, with `@rizom/theme-default`
   as the built-in fallback.** `shell/app/src/resolver/site.ts` already
   composes the string via `withThemeBase`; the console shells never receive
   it. The fallback is what keeps a brain with no site configured from
   rendering an unstyled console.

6. **Climate stays the console's name for the theme switch.** It already sets
   both attributes — `data-climate` for console CSS, `data-theme` for
   theme-base — so paper is light and instrument is dark with no mapping
   layer. Instrument stops being a fixed identity and follows the brain's dark
   palette.

7. **Shared console chrome stays plain CSS.** The strip, the palette aliases,
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
- **Emitted rules carry `:not(#\#)`**, an ID inside `:not()`, so they land at
  specificity (1,1,0) — above essentially all existing console CSS
  (`.declarative-list strong` is (0,1,1)). A migrated component therefore
  beats the hand-written CSS it replaces, which is what lets phase 5 move one
  surface at a time instead of switching everything at once. The `!important`
  in `.declarative-matrix` is the one rule that still wins and must be
  removed by hand.
- `@stylexjs/babel-plugin`'s exported type does not satisfy `@babel/core`'s
  `PluginItem`; the integration needs a cast.

## Unsettled

- **`theme-base`'s token contract has holes.** `@rizom/theme-default` defines
  no `--color-bg-card`, `--color-success`, `--color-error`, or
  `--color-on-accent`, all of which the console needs. They have to be given
  defaults in `theme-base` — derived from the status palette it already
  defines per `[data-theme]` — before any literal can be deleted from
  `console.css`. Until then, phase 1 cannot land.
- **`--console-warn` reads `--palette-warning-text-emphasis-light`**, a
  palette internal rather than a contract token. Needs a real
  `--color-warning`.
- Whether the phone filter row collapses into a single control or stays as
  stacked selects at full width is a layout question this plan does not
  settle; it is bounded by phase 4 and should be mocked first.

## Phases

Each phase ships behind the visual harness and leaves the console renderable.

1. **Fill the token contract.** `theme-base` defines every token the console
   aliases, defaulting the four missing ones. No console change; no baseline
   moves. Tests assert each contract token resolves under both `[data-theme]`
   values.
2. **Inject the theme into the Studio shell only.** `editor-shell.ts` takes a
   resolved theme string, defaulting to `withThemeBase(themeDefault)`, and
   inlines it in its own `<style>` ahead of the console sheet — its own
   element, because the theme's font `@import`s must lead a stylesheet.
   `console.css` keeps its literals. Baselines move only if the default theme
   differs from today's hardcoded values, which is the point of doing Studio
   alone first.
3. **Delete the literals.** Both climates become aliases. Dashboard and
   web-chat shells take the same injection. Every console baseline moves; this
   is the irreversible step and wants review before regeneration.
4. **StyleX in the app bundles.** The `Bun.BunPlugin` the spike proved goes
   into Studio's and web-chat's `build-ui.ts`, emitting the collected
   stylesheet into the existing asset manifest. Dashboard is untouched — it
   is a site surface and keeps Tailwind and `ui-library`. Prove with one
   button on one Studio surface in both climates before migrating anything.
5. **Migrate the controls, one surface at a time.** `.btn`, `.save-btn`,
   `.people-button*`, `.declarative-actions`, `.declarative-pager` and
   `.declarative-filter` collapse into one app control set. StyleX's higher
   specificity means a migrated surface wins over the CSS still in place
   around it, so surfaces move independently and each baseline is reviewed as
   it lands. The `!important` in `.declarative-matrix` is removed first,
   because it is the one rule StyleX will not beat.
6. **Add the interactive primitives.** Dialog replaces the hand-rolled focus
   trap, DropdownMenu the `<details>` menu, Switch the faux-toggle checkbox,
   and the phone action sheet becomes a real sheet with a scrim, a title, and
   a close control.

## Coverage debt

Content sync, Site, and Publishing have no visual coverage. Each is restyled by
phase 5, so each needs a fixture before that phase touches it — the absence of
exactly this coverage is what let the Site health widget ship a 726px overflow
against a 375px viewport, and what hid Inbox's raw ISO timestamps and its
dropped high-priority count.

`visual:console` does not run in CI. It is the only gate that would catch any
of this, and main has drifted past its last baseline refresh before. Wiring it
into CI is a prerequisite for trusting phases 3 and 5.
