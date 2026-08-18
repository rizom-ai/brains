# Plan: Complete the operator view composition contract

## Status

**Proposed 2026-08-18. No implementation or release is authorized by this plan.**

The shipped operator authoring contract renders every first-party Dashboard
widget and CMS workspace through one host-owned semantic protocol, and the
private renderer registrations are gone. That part holds.

What does not hold is the completeness claim. The Phase 4 capability inventory
at
`packages/brain-cli/test/fixtures/public-authoring/operator-surface/CAPABILITY_INVENTORY.md`
records required semantics that the contract cannot express. The inventory was
treated as satisfied; the code shows otherwise. This plan covers only that
remaining gap. The delivered phases have been removed from this document rather
than kept as a record.

## Problem

`RuntimeCmsOperatorView` is `{ title?, blocks[] }` — a flat, ordered array of
leaf blocks plus one container (`tabs`). The only layout intent anywhere in the
contract is `matrix.columns` (1–4). Three inventory requirements have no
representation.

### 1. Master/detail is absent

The inventory requires, for Unified Inbox, "a keyboard-accessible server-driven
master/detail presentation with bounded host-rendered plain text", "canonical
URL updates and responsive single-pane fallback", and lists "split
master/detail presentation" and "item selection" among the demonstrated
composition and interaction families.

What ships instead:

1. an item link carries the launch intent `inbox-open-detail`;
2. `inboxDetailWorkspaceHref()` writes `detailSourceId`/`detailItemId` into the
   URL;
3. the browser navigates the whole workspace and the server reloads it;
4. the loader splices a `text` block into the block array between `query` and
   `group`;
5. the host stacks it vertically, so the opened content renders above the
   source-availability panel and above the list it came from.

There is no pane, no selection state, and no way to express one:
`OperatorListItem` has no field indicating which row is open. The pre-conversion
renderer had a two-pane grid with selection, focus management, and a back
control; all of it was lost, and none of it is expressible today.

### 2. Layout intent is absent

The inventory's composition family names "responsive grids" and "primary/aside
intent". Neither exists. The host currently infers block width from block type
alone, which is a guess the author cannot correct or override.

### 3. Nested tabs are silently dropped

The inventory names "nested tabs". `normalizeCmsBlock` filters them out inside
the `tabs` case with `normalized.block.type !== "tabs"` and emits no validation
issue, so the content vanishes without diagnostics. This also violates the
standing rule that unsupported profile content is rejected rather than ignored.

### Related: product names in a generic vocabulary

`OperatorLaunchIntent` is a union of first-party targets — `inbox`,
`publishing`, `site`, `account-settings`, `admin-peer-invite`,
`inbox-open-entity`, `inbox-open-detail`, `inbox-capture-note`,
`inbox-discuss-in-chat` — and `plugins/cms/ui-react/src/operator-launch.ts`
hardcodes the workspace ID `"unified-inbox:inbox"`. The renderer-name allowlist
was removed and replaced by a launch-target allowlist naming built-in products.
An external author cannot open a detail view; only the inbox can, through a
target named after it.

## Contract additions

Composition follows the pattern `tabs` already establishes: a container block
holding panel blocks one level deep, inside the same closed union. No new
architecture is introduced.

### Detail container

```ts
export interface OperatorDetailBlock<
  TAction extends AnyWorkspaceActionDefinition,
> {
  readonly type: "detail";
  readonly id: string;
  /** The collection the operator picks from. */
  readonly master: OperatorListBlock<TAction> | OperatorTableBlock<TAction>;
  /** Present only when an item is open; rendered beside the master. */
  readonly open?:
    | {
        readonly forId: string;
        readonly title: string;
        readonly blocks: readonly OperatorPanelBlock<TAction>[];
      }
    | undefined;
  /** Rendered in the detail region when nothing is open. */
  readonly empty: string;
}
```

Selection is derived from `forId` rather than declared per item. The server
already knows which item it rendered the detail for, so the host highlights that
row and rejects an `open` whose `forId` matches no master row. A separate
`selected` flag could disagree with the content it claims to describe; a derived
one cannot.

### Detail link target

```ts
export interface OperatorDetailLinkTarget {
  readonly kind: "detail";
  readonly detailId: string;
  readonly itemId: string;
}
```

Added to `OperatorLinkTarget`. The host writes canonical query state, reruns the
loader, and re-renders with `open` populated. Authors construct no URL and name
no product. Loading remains server-driven — the inbox deliberately does not copy
source content into Brain — but the host keeps the master rendered in a pending
state instead of navigating the whole workspace.

### Layout intent

```ts
readonly span?: "full" | "half" | undefined;
readonly density?: "comfortable" | "compact" | undefined;
```

Optional on panel blocks. Bounded values rather than a column count: the author
states intent and the host still decides actual columns per breakpoint. The
current type-derived width becomes the default when `span` is absent, so authors
override only where that default is wrong.

## Delivery slices

Each slice converts a real surface end to end and leaves the tree shippable.

### Slice 1: master/detail

1. Add `OperatorDetailBlock`, `OperatorDetailLinkTarget`, their schemas, runtime
   types, and normalization, reusing the one-level-deep containment rule `tabs`
   enforces.
2. Reject a dangling `forId`, a `master` that is not a list or table, and a
   nested container, each with a bounded actionable issue.
3. Render two panes on wide viewports and a single-pane drill-down with a back
   control on narrow ones, preserving keyboard focus movement into the opened
   detail.
4. Convert Unified Inbox to emit `detail` instead of splicing a `text` block.
5. Delete `inboxDetailWorkspaceHref` and the hardcoded `"unified-inbox:inbox"`.

Exit: opening an inbox item keeps the list rendered beside it, marks the open
row, updates the canonical URL, and restores the same view on reload. Benchmark
against the pre-conversion renderer at `62aa30f84^`.

### Slice 2: layout intent

1. Add `span` and `density` to panel block contracts, schemas, and
   normalization.
2. Replace the host's type-derived width with the declared value where present.
3. Retune Directory Sync, Site, and Publishing to declare their own widths.

Exit: no workspace depends on the host guessing width from block type.

### Slice 3: nested containers and generic launches

1. Either support nested tabs or reject them with a diagnostic; silent dropping
   ends either way.
2. Replace the product-named launch targets with a target referencing a
   workspace definition, keeping host surfaces named by role rather than
   product.
3. Update the inventory, `docs/feature-overview.md`, `plugins/dashboard/README.md`,
   and the authoring guide to describe the delivered contract.

Exit: no first-party product name remains in the public vocabulary.

## Validation

| Layer      | Required evidence                                                            |
| ---------- | ---------------------------------------------------------------------------- |
| Contract   | detail containment depth, dangling `forId`, invalid master, bounded issues   |
| Host       | two-pane and single-pane rendering, selection marking, focus into the detail |
| Query      | canonical URL round-trip, reload restores the open item, paging preserved    |
| Conversion | inbox parity with the pre-conversion renderer, no product-named launch       |
| Regression | existing workspace suites, architecture check, packed operator evidence      |

## Non-goals

- Author-supplied components, HTML, CSS, or browser scripts.
- A generic DOM tree, free-form grid, or column-count layout field.
- Client-owned workspace data or optimistic detail loading.
- Reworking inbox sources, follow-up registration, or prepared confirmation.
- Any release action; nomination and publication remain separately authorized.

## Related work

- [Public authoring API `0.2`](./public-authoring-api-0.2.md)
- [Capability inventory](../../packages/brain-cli/test/fixtures/public-authoring/operator-surface/CAPABILITY_INVENTORY.md)
- [External package authoring](../external-plugin-authoring.md)
