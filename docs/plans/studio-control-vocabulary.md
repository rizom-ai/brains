# Plan: One control vocabulary for the console

## Status

**Not started; direction accepted 2026-09-02.** The phases below are the build
order. Two prerequisites already shipped and are stated only because the
phases depend on them: reading surfaces own the phone document scroll, and the
operator-view renderer contains author-supplied text within its column.

## Question

[`studio-ux-research.md`](./studio-ux-research.md) settled Studio's _layout_
grammar — one page head, one primary-action rule, two-bar phone chrome. It did
not settle its _material_ grammar. Every surface still draws its own controls,
so the workspaces read as separately built pages that happen to sit behind the
same rail. What is the console's single set of controls, and where do its
colours come from?

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

1. **The console consumes `@brains/ui-library` rather than growing a fourth
   control layer.** The library already carries `Button`, `Card`, `Alert`,
   `Pagination`, `EmptyState`, `Breadcrumb`, and the `WidgetTabs` that
   `operator-view-react` already imports.

2. **Take the shadcn pattern, not the CLI.** The library is presentational and
   has nothing for the interactive gaps — the hand-rolled focus trap in
   `confirm-dialog.tsx`, the `<details>`-based phone overflow menu, the pane
   switcher, filter toggles, the boolean switch. Those arrive as Radix
   primitives styled with CVA _inside_ the library, which is materially what
   `shadcn add` emits. Running the CLI would install a second component set
   beside the library and recreate the disease.

3. **`console.css` declares no colour literals.** Both climates alias
   `--color-*`; the values come from a theme. This is the reason the palette
   currently exists twice: instrument hardcodes one and paper restates another
   as `var()` fallbacks that never resolve, because no console shell injects a
   theme.

4. **Each brain's console follows its own theme, with `@rizom/theme-default`
   as the built-in fallback.** `shell/app/src/resolver/site.ts` already
   composes the string via `withThemeBase`; the console shells never receive
   it. The fallback is what keeps a brain with no site configured from
   rendering an unstyled console.

5. **Climate stays the console's name for the theme switch.** It already sets
   both attributes — `data-climate` for console CSS, `data-theme` for
   theme-base — so paper is light and instrument is dark with no mapping
   layer. Instrument stops being a fixed identity and follows the brain's dark
   palette.

6. **Tailwind, not StyleX, for the console.** StyleX was weighed: its typed,
   colocated styles fit this repo's discipline better than class strings, and
   its deterministic merge would make the specificity bugs above impossible.
   It loses on cost, not merit. It compiles source rather than emitting a
   stylesheet, so Dashboard — which renders TSX at request time with no build
   step — would need a compiler in front of it; it has no `Bun.build`
   integration; and it cannot share `@brains/ui-library`, so the console
   would need a second component library. Tailwind adopts a library that
   exists. Phases 1–3 are engine-agnostic, so this is revisited before
   phase 4 only if the console component set turns out not to fit the
   library.

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
4. **One console stylesheet, compiled once.** A single Tailwind sheet with
   `@source` globs resolved through package names, shared by all three
   surfaces. Studio and web-chat emit it from their `build-ui.ts` into the
   existing asset manifest; Dashboard, which has no build step and renders
   at request time, inlines the compiled string the way it already inlines
   the console sheet. Tailwind builds a stylesheet and leaves the TSX
   untouched, which is what lets Dashboard stay unbuilt. Prove with one
   `Button` on one surface in both climates before migrating anything.
5. **Migrate the controls.** Surface by surface, `.btn` / `.people-button*` /
   `.declarative-*` resolve to library components. Each surface's baseline is
   reviewed as it moves.
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
