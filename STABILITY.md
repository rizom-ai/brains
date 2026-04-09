# Stability Policy

`brains` is in the **0.x** series.

That means:

- breaking changes can land in minor releases
- patch releases should be fixes or additive changes
- the project will document important migrations when stable surfaces change

This file describes what is considered stable enough to build against today, and what is still expected to churn before `1.0`.

## Stable surface

### `brain.yaml` top-level schema

The documented top-level shape in [packages/brain-cli/docs/brain-yaml-reference.md](packages/brain-cli/docs/brain-yaml-reference.md) is the main stable configuration surface.

That includes fields such as:

- `brain`
- `site`
- `name`
- `logLevel`
- `logFile`
- `port`
- `domain`
- `database`
- `model`
- `preset`
- `mode`
- `add` / `remove`
- `anchors` / `trusted`
- `plugins`
- `permissions`

Plugin-specific schemas under `plugins.*` are owned by the plugin that defines them.

### System tool names

The canonical entity/runtime tools are stable:

- `system_create`
- `system_update`
- `system_delete`
- `system_get`
- `system_list`
- `system_search`
- `system_extract`
- `system_status`
- `system_insights`

If these tools change in a breaking way, the release notes should call it out explicitly.

### MCP resource URI scheme

The URI families exposed by built-in MCP resources are stable:

- `entity://types`
- `entity://{type}`
- `entity://{type}/{id}`
- `brain://identity`
- `brain://profile`
- `brain://status`

### Entity markdown contract

The base markdown contract is stable:

- frontmatter delimited by `---`
- base fields such as `id`, `entityType`, `created`, `updated`
- schema-backed per-entity frontmatter fields
- markdown body content as the durable source of truth

### CLI command names

The documented `brain` command names are stable:

- `brain init`
- `brain cert:bootstrap`
- `brain start`
- `brain chat`
- `brain eval`
- `brain diagnostics`
- `brain pin`
- `brain tool`
- `brain help`
- `brain version`

Documented remote invocation via `--remote` is also part of the stable CLI surface.

### Brain-definition surface

The exported brain-definition model used by shipped brain packages is intended to be stable at the top level: model identity, presets, plugin lists, site/theme defaults, and eval-disable declarations.

## Unstable surface

### Plugin context internals

Expect churn in internal context shapes and service wiring, including types such as:

- `EntityPluginContext`
- `ServicePluginContext`
- `InterfacePluginContext`
- base plugin context internals

If you build plugins against internal context details, pin versions tightly.

### Internal services and non-exported modules

Anything not exported from a package entrypoint should be treated as internal. In practice, that includes a lot of implementation detail under `shell/*` and package-local helpers.

Examples:

- search scoring weights
- embedding model selection
- queue internals
- prompt assembly internals
- messaging topic internals
- DB query details

### Log schema

Log output is for humans and debugging, not a stable machine contract. Field names, formatting, and exact messages may change.

### Database internals

SQLite tables, drizzle migrations, and derived-cache behavior are internal implementation details. Use the runtime and entity APIs, not direct table access.

### Performance and tuning defaults

Batch sizes, retry policies, cache behavior, debounce timing, ranking weights, and similar defaults may change between releases.

### Build and authoring internals

The user workflow is stable; the implementation is not. Tooling choices, bundling details, generated entrypoints, and internal build plumbing can change.

## Versioning expectations

### Before `1.0`

- **Patch**: fixes, docs, and additive behavior
- **Minor**: may include breaking changes
- **Major**: reserved for the move to `1.0` semantics

### After `1.0`

Normal semver applies:

- **Patch**: fixes only
- **Minor**: backward-compatible additions
- **Major**: breaking changes

## If you are extending brains

Build against:

- documented CLI behavior
- documented `brain.yaml` fields
- documented plugin entrypoints and exports
- entity schemas you own or explicitly depend on

Do **not** build against:

- deep imports into package internals
- undocumented shell service behavior
- exact log output
- exact search ranking order for borderline cases

## When in doubt

If you are unsure whether a behavior or export is meant to be stable, open an issue and ask before depending on it.
