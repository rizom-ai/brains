# Plan: Complete the operator view composition contract

## Status

**Implemented in the current candidate. Merge and release remain separately
approval-gated.**

The shipped operator authoring contract already renders every first-party
Dashboard widget and CMS workspace through one host-owned semantic protocol.
Master/detail is also delivered: selection is canonical query state, detail
links are scoped to their enclosing master, and the host owns two-pane and
single-pane presentation.

This candidate closes the remaining workspace-composition gap with bounded
`columns` and `card` blocks. It also adds semantic view-head metadata and stat
captions, converts all four first-party CMS workspaces, and keeps nested
containers invalid rather than silently dropping them.

## Delivered contract

### View head and status

`OperatorView` may declare:

- `kicker`: the domain above the title;
- `title` and `description`: the surface purpose; and
- `status`: a bounded label, optional detail, and semantic tone.

Stat items may add a short `caption` explaining what their value counts. The
host owns markup, placement, responsive behavior, and accessible status
presentation.

### Cards

`OperatorCardBlock<TAction>` groups related panel blocks under one label and an
optional tone. A card is valid as a top-level view block, in either column
region, or in an open detail region. Its children remain panel blocks, so a card
cannot contain another card, columns, tabs, or detail container.

### Primary/aside columns

`OperatorColumnsBlock<TAction>` declares one `primary` region and one `aside`
region. Each region contains bounded panels or cards. This expresses the stable
semantic distinction between active work and standing facts without exposing a
DOM tree, CSS grid, column count, breakpoint, or renderer-specific width.

The host decides the physical layout at each breakpoint and preserves primary
content before aside content in accessible reading order. This explicit
composition supersedes the earlier proposed `span`/`density` fields: those
fields are not part of the public contract.

### Bounded nesting and validation

Container nesting is closed and schema-enforced:

- tabs contain panels;
- cards contain panels;
- columns contain panels or cards;
- open detail regions contain panels or cards; and
- containers cannot recursively contain other containers.

Invalid declarations are rejected before normalization. Author-link inspection
recurses through every allowed container, so cards and columns cannot be used to
submit host-normalized entity, external, launch, or detail targets.

## First-party conversions

- **Directory Sync:** active work and history remain primary; automation,
  source facts, coverage, Git state, and issues use the aside rail and cards.
- **Site:** release flow, active work, routes, and recent builds remain primary;
  environment and automation facts/actions use cards in the aside rail.
- **Publishing:** queue, generation, and failures remain primary; pipeline facts
  use an aside card.
- **Unified Inbox:** the paged collection remains the master; source content,
  follow-ups, and available actions are grouped in the detail pane. Opening a
  row preserves its current page, and selected metadata remains available if
  the operator later changes pages.

## Public authoring evidence

The stable service entry exports `OperatorCardBlock`, `OperatorColumnsBlock`,
`OperatorRegionBlock`, and `OperatorViewStatus`. The export ledger and authoring
reference classify them, runtime tests cover top-level and nested placement,
and the packed operator consumer typechecks the named public types against a
packed local `@rizom/brain` tarball.

Exact registry evidence must be advanced only after this candidate is published;
the last historical registry baseline remains Brain `0.2.0-alpha.304` with Site
`0.2.0-alpha.233`.

## Remaining separate work

`OperatorLaunchIntent` still contains first-party product target names such as
`inbox`, `publishing`, and `site`. Replacing those cases with generic workspace
definition references is a separate contract change. It is not hidden by or
required for the delivered layout protocol.

## Validation

| Layer      | Required evidence                                                                                                                    |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Contract   | cards and columns normalize at every allowed level; unsupported nesting and host-normalized author targets are rejected              |
| Host       | view heads, status, captions, top-level cards, primary/aside columns, detail cards, and responsive reading order render semantically |
| Conversion | Directory Sync, Site, Publishing, and Unified Inbox use the public composition blocks without assertion-based type escapes           |
| Public API | service entry, stable ledger, authoring reference, golden export checks, and local packed operator consumer agree                    |
| Regression | focused workspace/runtime tests, package typechecks, root lint/typecheck, docs checks, and packed operator evidence pass             |

## Non-goals

- Author-supplied components, HTML, CSS, or browser scripts.
- A generic DOM tree, free-form grid, column-count, breakpoint, `span`, or
  `density` field.
- Client-owned workspace data or optimistic detail loading.
- Reworking Inbox source ownership, prepared confirmation, or follow-up
  registration.
- Merge, release, registry nomination, or stable-baseline freezing without
  separate authorization.

## Related work

- [Public authoring API `0.2`](./public-authoring-api-0.2.md)
- [Capability inventory](../../packages/brain-cli/test/fixtures/public-authoring/operator-surface/CAPABILITY_INVENTORY.md)
- [External package authoring](../external-plugin-authoring.md)
