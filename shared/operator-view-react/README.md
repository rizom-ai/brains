# Operator view React

Shared operator-view behavior for Studio and Dashboard. Providers supply semantic blocks; hosts supply controls and choose appropriate presentation.

## Build and styles

Run `bun run build` in this package before consuming it. The workspace build graph does this through dependency builds; Studio's standalone UI builder also builds this dependency. `bun run test` builds first.

The runtime export is `dist/index.js`; TypeScript resolves the source types. The package compiles StyleX before either host imports it, including source-based Dashboard development. SSR therefore needs neither a DOM nor a StyleX loader. Tests also exercise the built entry under production React without a loader.

The build collects static rules, then embeds them as `operatorViewStylexCSS` and writes `dist/stylex.css`. Dashboard includes the immutable export in its stylesheet; Studio includes the file in `app.css`. No browser style injection is needed for migrated components.

Migration is incremental: facts, notices, cards, columns, lists, record typography, totals, reading panes, source text, filters, pagination, and text links have compiled styles. Other renderer components still use `operatorViewRendererStyles` until migrated. Fonts and colors continue to use existing console tokens.

## Provider-owned hierarchy

List blocks may declare `presentation`: `standard`, `editorial`, `attention`, or `activity`. These are reading roles, not workspace identities. Editorial titles use the existing display face at 20px; attention uses 18px UI type with stronger emphasis on the leading item; activity uses 14px UI type. Explicit roles work in both host densities. Attention records group metadata and links beneath the copy; ordinary records keep dates inline, while activity puts dates on a separate line. Routine row actions use the host's `link` button variant; confirmation-gated actions remain `danger`. Master-detail collections retain two-line summaries, and timestamps retain their exact source values in `<time>` markup.

Cards may declare `presentation: "feature"` for a primary state with a prominent display heading, or `presentation: "disclosure"` for supporting details that start closed. Card metadata supplies compact section facts without repeating the heading. Action controls may override display `label` without changing their declared identity, inputs, permissions, or confirmation. Their full contents and permission-filtered controls remain available. Providers own these choices; Studio does not dispatch to plugin-specific renderers. Shared components do not require identical workspace compositions.

Query blocks can contain filters, pagination, or both. Providers can place a pagination-only block below a collection. A single page shows its range without redundant buttons; a previously populated later page keeps a way back after its items disappear. Comfortable filters use plain labels and a bounded two-column phone layout; compact hosts retain their instrument labels.
