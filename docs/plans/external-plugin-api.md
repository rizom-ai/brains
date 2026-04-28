# Plan: External Plugin API

## Status

Proposed. The audit (§0) is the gating workstream; §1–§5 follow it.

## Current state

What `@rizom/brain` exposes today (`packages/brain-cli/package.json` exports):

- `./cli` — CLI binary entry
- `./site` — site authoring surface (used by extracted Rizom apps)
- `./themes` — theme authoring surface
- `./deploy` — deploy helper re-exports from `@brains/utils`
- `./tsconfig.instance.json`

What plugin authors need but cannot reach:

- no `./plugins`, `./entities`, `./services`, `./interfaces`, `./utils`, or `./templates` subpath
- no public re-export of `defineBrain` (lives at `@brains/app`, internal)
- `brain.yaml` parses `brain`, `domain`, `preset`, `model` only — no `plugins:` field, no node_modules resolution path
- no plugin API version constant published anywhere

`docs/plans/custom-brain-definitions.md` (the `brain.ts` escape hatch) depends on this plan: `defineBrain` and preset spread targets need to be importable from `@rizom/brain` before `brain.ts` is usable by external authors.

## Audit decisions

The §0 audit lives in this plan, not a separate document. Record each decision here before implementing public exports.

| Area                      | Decision | Rationale                                                                                       |
| ------------------------- | -------- | ----------------------------------------------------------------------------------------------- |
| Plugin type split         | Pending  | Decide before freezing public base classes.                                                     |
| Context consistency       | Pending  | Compare entity/service/interface contexts for intentional vs accidental differences.            |
| Lifecycle hooks           | Pending  | Commit only to minimal hooks external authors need.                                             |
| Registration model        | Pending  | Choose class-method, context-registration, or documented hybrid model.                          |
| Cross-plugin dependencies | Pending  | Decide whether composite plugins are enough or explicit dependency declarations are public API. |
| Type-safety surface       | Pending  | Decide whether service/interface plugins need generic narrowing like entity plugins.            |
| Versioning policy         | Pending  | Define when plugin API version bumps.                                                           |

## Open work

External developers still cannot build and load full plugins against `@rizom/brain`.

The work breaks into six parts. §0 is gating — publishing the surface before stabilizing the abstractions would freeze whatever shape happens to exist today and force the first real external authors to absorb breaking changes once internal review surfaces gaps.

### 0. Audit and stabilize the abstractions

Before any subpath is exported, audit what's being exposed. The plugin framework has grown organically alongside the entity/service/interface split; some of its asymmetries are intentional and some are accidents. Decide which is which before freezing them.

Audit areas:

- **Plugin type split**: are `EntityPlugin` / `ServicePlugin` / `InterfacePlugin` the right top-level categories, or are there things that don't fit cleanly? `MessageInterfacePlugin` is a subclass of `InterfacePlugin` today — should that subclass be public, or should the base cover the use cases? Are there plugin shapes (composites, derived-data plugins, daemon-only plugins) that deserve their own category?
- **Context consistency**: walk `entity/context.ts`, `service/context.ts`, `interface/context.ts` side by side. Same concept exposed identically across the three? Asymmetries that look intentional but are actually drift? Anything in one that should be in all? Anything in any that should not be public at all?
- **Lifecycle hooks**: `onRegister` exists today; `shell-init-coordination` proposes `onReady` and `onPostReady`. Are those the right hooks for external authors, or are `onShutdown` / `onConfigChange` / `onDependencyResolved` also needed? What's the _minimal_ set we want to commit to?
- **Registration model**: capability registration is split between `getTemplates()` / `getDataSources()` style class methods and `context.register*()` runtime calls. Pick one direction (or document why both exist) before exposing the surface.
- **Cross-plugin dependencies**: composite plugins are how multi-plugin capabilities are bundled today. Is that the right model for external authors, or do they need a way to declare "this plugin requires plugin X" without bundling?
- **Type-safety surface**: `EntityPlugin<T extends BaseEntity>` is well-typed; `ServicePlugin` and `InterfacePlugin` have no equivalent generic narrowing. Decide whether they should match before publishing.
- **Versioning policy**: when does the plugin API version constant from §3 bump? Semver against the public type signatures? Against runtime behavior? Document the policy before issuing version 1.

Output of this phase:

- a written audit document (live in `docs/plans/` alongside this plan, or as an ADR-style note) covering each area above with a decision and rationale
- targeted refactors landing the decisions in the codebase
- a frozen design for the public subpath surface that §1 then implements mechanically

This phase may surface that some `framework consolidation` plans (`shell-init-coordination`, `env-schema-canonical`) should land here rather than later — the audit decides.

### 1. Expand the public library surface for plugin authors

The package needs a curated plugin-authoring surface beyond the existing `./cli`, `./site`, `./themes`, and `./deploy` subpaths.

Needed public subpaths:

- `@rizom/brain/plugins` — `EntityPlugin`, `ServicePlugin`, `InterfacePlugin`, `MessageInterfacePlugin` base classes plus their context types
- `@rizom/brain/entities` — `BaseEntity`, `EntityAdapter`, `EntityTypeConfig`, schema helpers
- `@rizom/brain/services` — `BaseEntityDataSource`, `BaseGenerationJobHandler`, shared service utilities
- `@rizom/brain/interfaces` — `Daemon` types, route registration types, permission helpers
- `@rizom/brain/utils` — re-export of the curated `@brains/utils` surface
- `@rizom/brain/templates` — `Template`, `ViewTemplate`, `WebRenderer` types
- a public re-export of `defineBrain` (currently `@brains/app`-only) and preset composition helpers

Requirements:

- each subpath has a deliberate exports contract; the build replaces workspace `@brains/*` imports with subpath-relative ones
- internal shell-only types (`Shell`, `ShellInitializer`, `ShellBootloader`, raw service singletons) stay private
- `.d.ts` output remains usable for external authors — no `@brains/*` paths in the published types
- the public type surface is committed under `packages/brain-cli/src/types/` (existing convention for `./site` and `./themes`) so drift is reviewable

### 2. Load external plugins from `brain.yaml`

`brain.yaml` should be able to declare plugins installed from `node_modules`. Today the schema in `packages/brain-cli/src/lib/brain-yaml.ts` accepts `brain`, `domain`, `preset`, `model`; unknown keys pass through but are not consumed.

Target shape:

```yaml
plugins:
  - @rizom/brain-plugin-calendar
  - @rizom/brain-plugin-stripe:
      apiKey: "${STRIPE_API_KEY}"
```

Needed behavior:

- extend the `brain.yaml` schema with a typed `plugins:` field
- resolve plugin entries from `node_modules` at boot
- support config objects per plugin entry
- support env-var interpolation in plugin config (`${VAR}`), reusing varlock-resolved env where possible
- fail clearly when a declared plugin is missing or its API version mismatches (see §3)

### 3. Add a plugin API compatibility contract

External plugins need a versioned contract so breaking changes are detectable.

Needed behavior:

- publish a plugin API version constant
- let plugins declare target API version in `package.json`
- warn on mismatch at load time
- document deprecation and breaking-change policy

### 4. Add basic plugin CLI ergonomics

Optional but useful follow-on CLI work:

- `brain search` for npm plugin discovery
- `brain add` to install and write `brain.yaml`
- `brain remove` to uninstall and remove config

This should only land if it materially improves the operator path.

### 5. Prove the external DX end-to-end

Before calling this done, ship:

- one reference external plugin in a separate repo
- tests proving authoring + loading work end-to-end
- plugin author docs covering setup, config, testing, and publishing

## Non-goals

- publishing every internal `@brains/*` workspace package directly
- plugin sandboxing
- hot reload for plugin code
- a custom plugin marketplace or registry

## Dependencies

- current published `@rizom/brain` package contract
- `docs/plans/custom-brain-definitions.md` — the `brain.ts` programmatic-mode plan, which assumes the public subpath surface from §1 already exists

## Done when

1. the audit document exists with decisions on every §0 area, and those decisions are reflected in the codebase
2. external plugin authors can import the required public APIs from `@rizom/brain`
3. installed plugins can be declared in `brain.yaml` and loaded at runtime
4. plugin API version mismatches are detectable
5. at least one external reference plugin proves the full path
6. plugin author documentation exists and matches reality
