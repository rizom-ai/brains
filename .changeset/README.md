# Changesets

Changesets use two independent queues so a core release cannot publish a site
or theme package, and a site release cannot publish core runtime packages.

## Choose a release lane

- `bun changeset core` — `@brains/*`, `@rizom/brain`, `@rizom/ops`,
  `@rizom/ui`, and other non-site packages.
- `bun changeset site` — public `@rizom/site*` and `@rizom/theme*` packages.

The wrapper adds a `core--` or `site--` filename prefix. Do not run the raw
Changesets CLI to create a changeset. A changeset may reference packages from
only one lane; dependency propagation must also stay in that lane.

`bun run changeset:check` validates both queues and their assembled release
plans. CI runs this before either release pipeline versions packages.

## Release commands

The workflows use lane-scoped commands:

- `bun run changeset:version:core` / `bun run changeset:publish:core`
- `bun run changeset:version:site` / `bun run changeset:publish:site`

Unscoped publish commands are intentionally not exposed. The site pipeline also
verifies prepared package metadata before npm publish and registry metadata
after publish.
