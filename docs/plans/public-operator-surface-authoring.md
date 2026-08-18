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
remaining gap. Delivered work is removed from this document rather than kept as
a record.

**Master/detail is delivered** on `work/operator-view-composition`: a `detail`
container block with derived selection, a `detail` link target scoped to its
enclosing master, host-rendered two-pane and drill-down layouts, and Unified
Inbox converted onto it. `inbox-open-detail`, `inboxDetailWorkspaceHref`, and
the hardcoded `"unified-inbox:inbox"` workspace ID are gone.

## Problem

`RuntimeCmsOperatorView` is a flat, ordered array of leaf blocks plus two
containers (`tabs` and `detail`). Two inventory requirements remain without
representation, and one is dropped without a diagnostic.

### 1. Layout intent is absent

The inventory's composition family names "responsive grids" and "primary/aside
intent". Neither exists; the only layout field in the contract is
`matrix.columns` (1–4). The host currently infers block width from block type
alone, which is a guess the author cannot correct or override.

### 2. Nested tabs are silently dropped

The inventory names "nested tabs". `normalizeCmsBlock` filters them out inside
the `tabs` case with a `type !== "tabs"` guard and emits no validation issue, so
the content vanishes without diagnostics. This also violates the standing rule
that unsupported profile content is rejected rather than ignored.

### Related: product names in a generic vocabulary

`OperatorLaunchIntent` remains a union of first-party targets — `inbox`,
`publishing`, `site`, `account-settings`, `admin-peer-invite`,
`inbox-open-entity`, `inbox-capture-note`, `inbox-discuss-in-chat`. The
renderer-name allowlist was removed and replaced by a launch-target allowlist
naming built-in products. External authors can now open a detail view, but they
still cannot reach another workspace except through a target named after a
first-party product.

## Contract additions

### Layout intent

```ts
readonly span?: "full" | "half" | undefined;
readonly density?: "comfortable" | "compact" | undefined;
```

Optional on panel blocks. Bounded values rather than a column count: the author
states intent and the host still decides actual columns per breakpoint. The
current type-derived width becomes the default when `span` is absent, so authors
override only where that default is wrong.

### Workspace launch target

Replace the product-named launch union with a target that references a workspace
definition, keeping host surfaces (`account-settings`, `admin-peer-invite`)
named by role rather than product. Definition references are already the rule
for entities, actions, and jobs; launches are the remaining exception.

## Delivery slices

Each slice converts a real surface end to end and leaves the tree shippable.

### Slice 1: layout intent

1. Add `span` and `density` to panel block contracts, schemas, and
   normalization.
2. Replace the host's type-derived width with the declared value where present.
3. Retune Directory Sync, Site, and Publishing to declare their own widths.

Exit: no workspace depends on the host guessing width from block type.

### Slice 2: nested containers and generic launches

1. Either support nested tabs or reject them with a diagnostic; silent dropping
   ends either way.
2. Replace the product-named launch targets with a workspace-definition
   reference.
3. Update the inventory, `docs/feature-overview.md`,
   `plugins/dashboard/README.md`, and the authoring guide to describe the
   delivered contract.

Exit: no first-party product name remains in the public vocabulary.

## Validation

| Layer      | Required evidence                                                        |
| ---------- | ------------------------------------------------------------------------ |
| Contract   | declared span/density normalize, unsupported values rejected with bounds |
| Host       | declared width wins over the type default; nested containers diagnose    |
| Conversion | each converted workspace declares its own widths                         |
| Regression | workspace suites, architecture check, packed operator evidence           |

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
