# Research: Studio UX coherence

## Status

**Design research complete; second iteration accepted 2026-08-30.** The
accepted frames and decisions below are the Studio refactor baseline. Not an
implementation plan: this settles what the
consolidated Studio should look and feel like before any build phase is
cut. The three "UX research" frames in
[`../studio-consolidation-mockups.html`](../studio-consolidation-mockups.html)
test the hypotheses. Accepted decisions become thin phases in
[`studio-refactor.md`](./studio-refactor.md). Chat's surface migration is a
separate concern tracked by
[`studio-chat-integration.md`](./studio-chat-integration.md).

## Question

The consolidation moved every operator surface into one shell, but did not
give them one design. What is Studio's single visual and interaction
grammar — across the entity library, declarative workspaces, Account,
Overview, the editor, and fixed client workspaces — and what does it become
on a phone?

## Evidence

From the current visual baselines (`test/visual/console/baselines/`).

Desktop:

- Three head grammars coexist: the library's single-line title with inline
  count and a head-level action; the declarative workspaces'
  kicker/title/description/status/totals stack; Account's oversized title
  with its own settings-row idiom.
- The primary action lives somewhere different on every surface: a head
  button (library), disclosure cards in an aside (Invitations), a pinned
  bar (editor).
- Mono micro-labels compete on one screen — kicker, status corner, totals
  captions, column heads, card titles — until hierarchy blurs; the
  "Admin only · Access administration" status corner reads as debug output.
- Wide viewports leave dead half-screens beside half-width tables, and
  paired filters sit at opposite screen edges (Audit).

Mobile (390×844):

- Administration's tables clip mid-cell and side-scroll over their own
  content.
- Chrome — strip, breadcrumb, chips row, head, totals — consumes roughly
  half the viewport before content appears.
- The workspace chips row truncates at the screen edge with no scroll
  affordance.
- Creation actions land a screen or more below the fold.

The phone editor is the quality bar: segmented Details/Write/Preview tabs
and a pinned action bar with pipeline status. Nothing else in Studio meets
it.

## Accepted decisions (mocked and accepted 2026-08-30)

Each maps to a "UX research" frame in the mockups file.

1. **One head grammar, density as the only parameter.** Kicker line
   (carrying the permission lock as a chip), then a single title row
   holding meta, attention, and totals as chips, then at most one line of
   description. The library, workspaces, and Account all use it — Account's
   bespoke idiom and the workspaces' totals block and debug-looking status
   corner go away. The head stops being a region and becomes two lines.
2. **Filters live with what they filter.** Filter selects group
   left-aligned directly above their table with the pager on the same line;
   nothing sits at the far screen edge, and tables own the full main
   column. Mocked on Audit, the worst offender.
3. **Tables re-flow into the protocol's list grammar at phone width** — a
   renderer rule over source-declared compact row semantics: the row's key
   fact becomes the list title, the rest the meta line, provenance and state
   become chips. Mocked for People and Audit. The host never guesses these
   roles from column position or labels; unannotated tables remain safely
   scrollable until migrated.
4. **Phone chrome budget: two bars and two lines.** The strip collapses
   into the top bar, the workspace chips row scrolls with a visible fade,
   and the head is one line. Content starts near 160px instead of ~450px.
5. **One primary-action rule, responsive.** One explicitly declared primary
   action sits trailing in the head's title row on desktop and pins to a
   bottom bar on the phone — the editor's pattern generalized. The renderer
   never hoists an arbitrary action block. This amends the original
   hypothesis of a single fixed placement: the research showed one _rule_,
   two positions.

The access chip is host-derived from active-session and permission-floor
admission, compact table rows are source-declared, and the primary action is
singular protocol data.
These semantic requirements precede CSS; they are specified in
[`studio-refactor.md`](./studio-refactor.md).

The second iteration mocks the editor, Overview at phone width, and Account
as the representative fixed client workspace. These frames resolved the first
iteration's missing evidence and passed the implementation gate.

## Method

Screen-by-screen mockups in the house mockup file, mobile and desktop side
by side, editor as reference. Each accepted mockup becomes a recorded
decision here; accepted decisions then cut into the phases in
[`studio-refactor.md`](./studio-refactor.md). Mockups first, code never ahead
of an accepted mockup.
