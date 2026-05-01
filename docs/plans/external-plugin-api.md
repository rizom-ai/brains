# Plan: External Plugin API

## Status

Shell initialization coordination, §1 public plugin authoring exports, §2 `brain.yaml plugins:` loading, and package-local external authoring proof are complete for `ServicePlugin`, `EntityPlugin`, `InterfacePlugin`, and `MessageInterfacePlugin`. External plugin declarations parse, package refs register, runtime loading supports default or named `plugin` factory exports, the public fixture typechecks against `@rizom/brain/*`, and author docs cover the supported package shape. `MessageInterfacePlugin` is public optional chat-interface sugar over `InterfacePlugin`. Runtime plugin API compatibility checks are deferred while `PLUGIN_API_VERSION` tracks the `@rizom/brain` package version during alpha; package-manager `peerDependencies` are the compatibility source of truth for now.

## Current state

What `@rizom/brain` exposes today (`packages/brain-cli/package.json` exports):

- `./cli` — CLI binary entry
- `./site` — site authoring surface (used by extracted Rizom apps)
- `./themes` — theme authoring surface
- `./deploy` — deploy helper re-exports from `@brains/utils`
- `./tsconfig.instance.json`

What plugin authors still need:

- a separate-repo reference plugin once the public package is published
- future plugin API compatibility checks only if/when the plugin API version diverges from the `@rizom/brain` package version

`docs/plans/custom-brain-definitions.md` (the `brain.ts` escape hatch) depends on this plan: `defineBrain` and preset spread targets need to be importable from `@rizom/brain` before `brain.ts` is usable by external authors.

## Audit decisions

The §0 audit lives in this plan, not a separate document. Record each decision here before implementing public exports.

| Area                               | Decision                                                                                                                                                                                                                                                                                                                                                                            | Rationale                                                                                                                                                                                                                                                          |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Plugin type split                  | Keep `EntityPlugin`, `ServicePlugin`, and `InterfacePlugin` as the public top-level classes. Also publish `MessageInterfacePlugin` as a public convenience subclass for chat/channel transports. Do not add composite, derived-data, or daemon-only plugin classes.                                                                                                                 | Existing packages fit the three-way split. Composite capabilities are factory-level composition, derived data is owned by explicit entity projection jobs, and daemon ownership belongs in `InterfacePlugin` when user-facing or `ServicePlugin` when operational. |
| Context consistency                | Publish context **types** with a shared `BasePluginContext`; keep shell/context factory functions private. Preserve intentional sibling differences: entity plugins get AI/entity registration/prompt resolution, service plugins get entity writes/templates/views/instructions, interface plugins get transport/permissions/daemons/conversation writes/routes/plugin visibility. | The shared base is already coherent. The differences map to plugin responsibilities. Exposing `create*Context()` or `IShell` would leak shell internals.                                                                                                           |
| Lifecycle hooks                    | Public minimal set: `onRegister`, `onReady`, `onShutdown`. Shell initialization coordination has landed, so `onReady` is backed by real boot ordering. Keep `SYSTEM_CHANNELS.pluginsRegistered` internal as an all-registered signal. Defer public `onPostReady`, `onConfigChange`, and `onDependencyResolved`.                                                                     | `onRegister` is for capability registration. External authors need a ready-state hook for identity/profile and cross-plugin startup work. Shutdown is needed for cleanup. Other hooks are additive later.                                                          |
| Registration model                 | Keep a documented hybrid. Use class methods/properties for static declarations auto-registered at boot; use `context.*.register()` for dynamic registration or explicit namespace control.                                                                                                                                                                                          | Current entity/service/site code uses both patterns. Forcing one style would create churn without simplifying external authoring enough.                                                                                                                           |
| Cross-plugin dependencies          | Publish both composite factories and `plugin.dependencies`. Composite factories bundle capabilities that should be enabled together; `dependencies` only orders and validates already-loaded plugins. No peer-dependency autoload in v1.                                                                                                                                            | This preserves current resolver behavior and avoids surprising installs/boot-time package loading. External authors can choose bundle vs ordering contract.                                                                                                        |
| Type-safety surface                | Keep `EntityPlugin<TEntity, TConfig>`, `ServicePlugin<TConfig>`, and `InterfacePlugin<TConfig, TTrackingInfo>`. Do not add service/interface domain generics for v1. Tighten examples around Zod config schemas and typed factory inputs instead.                                                                                                                                   | Entity plugins own a durable entity type, so entity narrowing matters. Service/interface plugins expose heterogeneous tools/routes/transports; config and tracking generics are the useful public type parameters.                                                 |
| Versioning policy                  | During alpha, `PLUGIN_API_VERSION` tracks the published `@rizom/brain` package version. Once plugin API v1 is declared stable, it can become an independent semantic API version. External plugin packages declare a semver range in `package.json` under `rizomBrain.pluginApi`; missing or unsatisfied metadata warns during alpha.                                               | Avoids falsely claiming a stable `1.0.0` contract while the package is still alpha, while keeping a path to independent public API versioning later.                                                                                                               |
| `brain.yaml` external plugin shape | Preserve existing `plugins:` map semantics. External packages use keyed map entries with a reserved `package` field and nested `config`, not the list shape.                                                                                                                                                                                                                        | Existing docs and runtime already use `plugins:` as config overrides. A list would be incompatible and ambiguous.                                                                                                                                                  |

Audit-derived implementation gates before §1 public exports:

- Shell initialization coordination is complete: lifecycle phases are explicit and `onReady` is backed by boot ordering.
- Keep `IShell`, `createBasePluginContext`, `createEntityPluginContext`, `createServicePluginContext`, and `createInterfacePluginContext` out of `@rizom/brain/*` public exports.
- Treat `MessageInterfacePlugin` as public API, but document it as optional sugar over `InterfacePlugin`.
- Document the hybrid registration model in plugin author docs before publishing examples.
- Define `PLUGIN_API_VERSION` and `rizomBrain.pluginApi` package metadata before enforcing compatibility for external packages.
- Update both brain-yaml parsers/schemas together; do not introduce the incompatible list-form `plugins:` shape.

## Open work

External developers can import the public authoring surface and declare installed plugin packages in `brain.yaml`, but compatibility checks and reference docs/plugins are still outstanding.

The work breaks into six parts. §0 is gating — publishing the surface before stabilizing the abstractions would freeze whatever shape happens to exist today and force the first real external authors to absorb breaking changes once internal review surfaces gaps.

### 0. Audit and stabilize the abstractions

Before any subpath is exported, audit what's being exposed. The plugin framework has grown organically alongside the entity/service/interface split; some of its asymmetries are intentional and some are accidents. Decide which is which before freezing them.

Audit areas:

- **Plugin type split**: are `EntityPlugin` / `ServicePlugin` / `InterfacePlugin` the right top-level categories, or are there things that don't fit cleanly? `MessageInterfacePlugin` is a subclass of `InterfacePlugin` today — should that subclass be public, or should the base cover the use cases? Are there plugin shapes (composites, derived-data plugins, daemon-only plugins) that deserve their own category?
- **Context consistency**: walk `entity/context.ts`, `service/context.ts`, `interface/context.ts` side by side. Same concept exposed identically across the three? Asymmetries that look intentional but are actually drift? Anything in one that should be in all? Anything in any that should not be public at all?
- **Lifecycle hooks**: `onRegister` exists today; `shell-init-coordination` must add `onReady` and may keep any post-ready phase internal. Are those the right hooks for external authors, or are `onShutdown` / `onConfigChange` / `onDependencyResolved` also needed? What's the _minimal_ set we want to commit to?
- **Registration model**: capability registration is split between `getTemplates()` / `getDataSources()` style class methods and `context.register*()` runtime calls. Pick one direction (or document why both exist) before exposing the surface.
- **Cross-plugin dependencies**: composite plugins are how multi-plugin capabilities are bundled today. Is that the right model for external authors, or do they need a way to declare "this plugin requires plugin X" without bundling?
- **Type-safety surface**: `EntityPlugin<T extends BaseEntity>` is well-typed; `ServicePlugin` and `InterfacePlugin` have no equivalent generic narrowing. Decide whether they should match before publishing.
- **Versioning policy**: when does the plugin API version constant from §3 bump? Semver against the public type signatures? Against runtime behavior? Document the policy before issuing version 1.

Output of this phase:

- audit decisions recorded in this plan
- targeted refactors landing the decisions in the codebase
- a frozen design for the public subpath surface that §1 then implements mechanically

This phase surfaced `shell-init-coordination` as required before public exports; that work is now complete. `env-schema-canonical` remains non-blocking because external plugin env declarations live in plugin packages.

### 1. Expand the public library surface for plugin authors

The package needs a curated plugin-authoring surface beyond the existing `./cli`, `./site`, `./themes`, and `./deploy` subpaths.

Needed public subpaths:

- `@rizom/brain/plugins` — `EntityPlugin`, `ServicePlugin`, `InterfacePlugin`, `MessageInterfacePlugin` base classes plus their context types. `MessageInterfacePlugin` is explicitly public, but documented as optional sugar for messaging surfaces; non-chat integrations should extend `InterfacePlugin` directly.
- `@rizom/brain/entities` — `BaseEntity`, `EntityAdapter`, `EntityTypeConfig`, schema helpers
- `@rizom/brain/services` — `BaseEntityDataSource` and base query/input contracts
- `@rizom/brain/interfaces` — `Daemon` types, route registration types, messaging contracts, permission helpers
- `@rizom/brain/templates` — `Template`, `ViewTemplate`, `WebRenderer` types
- root `@rizom/brain` — `defineBrain`, `PLUGIN_API_VERSION`, and brain definition contracts

No public `@rizom/brain/utils` subpath is published in this slice; external plugin examples import `zod` directly.

Requirements:

- each subpath has a deliberate exports contract; the build replaces workspace `@brains/*` imports with subpath-relative ones
- internal shell-only types (`Shell`, `ShellInitializer`, `ShellBootloader`, raw service singletons, `IShell`, context factory functions) stay private
- `.d.ts` output remains usable for external authors — no `@brains/*` paths in the published types
- public declarations are generated from curated entry/contract source; legacy hand-written `src/types` files are not used for plugin-author subpaths

Frozen public surface contract for §1:

| Subpath                   | Public values                                                                                                                                                                                                         | Public types                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Explicit non-exports                                                                                                                      |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| root `@rizom/brain`       | `defineBrain`, `PLUGIN_API_VERSION`                                                                                                                                                                                   | `BrainDefinition`, `BrainIdentity`, `BrainEnvironment`, `BrainMode`, `PresetName`, `CapabilityConfig`, `CapabilityEntry`, `InterfaceEntry`, `InterfaceConstructor`, `PluginFactory`, `PluginConfig`                                                                                                                                                                                                                                                                          | Built-in model spread targets and `definePreset` remain in `custom-brain-definitions.md`; they are not required for npm plugin loading.   |
| `@rizom/brain/plugins`    | `EntityPlugin`, `ServicePlugin`, `InterfacePlugin`, `MessageInterfacePlugin`, `defineChannel`, `createTool`, `createResource`, `toolSuccess`, `toolError`, `urlCaptureConfigSchema`, public DTO schemas               | `BasePluginContext`, `EntityPluginContext`, `ServicePluginContext`, `InterfacePluginContext`, their namespace interfaces, `PluginFactory`, `PluginConfig`, `PluginConfigInput`, `Tool`, `Resource`, `ResourceTemplate`, `Prompt`, `ToolContext`, `ToolResponse`, `ToolVisibility`, `ToolConfirmation`, `BaseJobTrackingInfo`, `MessageJobTrackingInfo`, `JobProgressEvent`, `JobProgressContext`, `JobProgressStatus`, `Channel`, public DTO types                           | `BasePlugin`, `IShell`, `PluginManager`, `PluginRegistrationContext`, context factory functions, `SYSTEM_CHANNELS`, test harnesses/mocks. |
| `@rizom/brain/entities`   | `BaseEntityAdapter`, `baseEntitySchema`, `BASE_ENTITY_TYPE`, `generateMarkdownWithFrontmatter`, `parseMarkdownWithFrontmatter`, `generateFrontmatter`, `paginationInfoSchema`, `paginateItems`, `buildPaginationInfo` | `BaseEntity`, `EntityInput`, `CreateInput`, `CreateExecutionContext`, `CreateResult`, `CreateInterceptionResult`, `CreateInterceptor`, `EntityAdapter`, `EntityTypeConfig`, `EntityMutationResult`, `SearchResult`, `ListOptions`, `SearchOptions`, `DataSource`, `DataSourceCapabilities`, `BaseDataSourceContext`, `PaginationInfo`, `PaginateOptions`, `PaginateResult`, `FrontmatterConfig`                                                                              | `EntityService`, `EntityRegistry`, `SingletonEntityService`, embedding DB helpers, migrations, raw DB config/runtime singleton types.     |
| `@rizom/brain/services`   | `BaseEntityDataSource`, `baseQuerySchema`, `baseInputSchema`                                                                                                                                                          | `EntityDataSourceConfig`, `BaseQuery`, `NavigationResult`, `SortField`                                                                                                                                                                                                                                                                                                                                                                                                       | `JobQueueService`, `JobQueueWorker`, handler registries, queue DB/migration helpers, shell service singletons.                            |
| `@rizom/brain/interfaces` | `UserPermissionLevelSchema`, `RouteDefinitionSchema`, `NavigationSlots`, route payload schemas, messaging schemas                                                                                                     | `Daemon`, `DaemonHealth`, `DaemonInfo`, `DaemonStatusInfo`, `UserPermissionLevel`, `PermissionConfig`, `PermissionRule`, `WithVisibility`, `ApiRouteDefinition`, `RegisteredApiRoute`, `WebRouteDefinition`, `RegisteredWebRoute`, `WebRouteMethod`, `WebRouteHandler`, `RouteDefinition`, `RouteDefinitionInput`, `SectionDefinition`, `NavigationItem`, `NavigationSlot`, `EntityDisplayEntry`, `MessageResponse`, `MessageSender`, `MessageWithPayload`, `MessageContext` | `IDaemonRegistry`, MCP transport implementations, permission service instance, route registrars/managers.                                 |
| `@rizom/brain/templates`  | `createTemplate`, `createTypedComponent`, `TemplateSchema`, `ViewTemplateSchema`, `SiteBuilderOptionsSchema`, `BuildResultSchema`, `SiteContentEntityTypeSchema`                                                      | `Template`, `TemplateInput`, `ComponentType`, `RuntimeScript`, `ViewTemplate`, `ViewTemplateRegistry`, `WebRenderer`, `OutputFormat`, `SiteBuilder`, `SiteBuilderOptions`, `BuildResult`, `SiteContentEntityType`                                                                                                                                                                                                                                                            | `TemplateRegistry`, `RenderService`, `TemplateCapabilities`, `PermissionService` instances/classes.                                       |

Implementation notes:

- Runtime entry files should re-export from curated contract source where possible; published type files must not expose `@brains/*` import paths.
- Shared types that are useful in more than one subpath should be exported from explicit contract modules rather than forcing authors to import from unrelated subpaths.
- If a public type currently references an explicit non-export such as `IShell`, shrink the public surface or introduce a real public contract instead of leaking the internal dependency.
- `MessageInterfacePlugin` is exposed through the public wrapper, not as a broad internal re-export. Keep its public surface minimal: constructor, stable lifecycle hooks, the abstract channel-send method(s) external chat adapters must implement, and stable chat helpers such as upload validation, URL capture extraction, and progress-message support. Mark future uncertain/non-load-bearing helpers `@internal` so declaration bundling strips them.

### 2. Load external plugins from `brain.yaml`

`brain.yaml` should be able to declare plugins installed from `node_modules`. Today the CLI schema only validates a small subset of fields, and the runtime schema treats `plugins:` as per-plugin config overrides.

Target shape keeps `plugins:` as a keyed map:

```yaml
plugins:
  directory-sync:
    git:
      repo: your-org/brain-data
      authToken: "${GIT_SYNC_TOKEN}"
  calendar:
    package: "@rizom/brain-plugin-calendar"
  stripe:
    package: "@rizom/brain-plugin-stripe"
    config:
      apiKey: "${STRIPE_API_KEY}"
```

Implemented behavior:

- extend the `brain.yaml` schemas with typed support for external plugin map entries while preserving existing config override entries
- collect external plugin package refs for static/dynamic registration
- resolve plugin entries with `package` from registered `node_modules` modules at boot
- support config objects per external plugin entry under `config`
- support env-var interpolation in plugin config (`${VAR}`), reusing the existing override interpolation path
- fail clearly when a declared plugin package is missing or has an invalid export shape

Remaining behavior:

- fail clearly when a declared plugin's API version mismatches (see §3)

External package module contract:

```ts
import type { PluginFactory } from "@rizom/brain/plugins";

export const plugin: PluginFactory = (config) => new CalendarPlugin(config);
export default plugin;
```

Loader rule: import the package entry, use `default` if present, otherwise named `plugin`. The factory receives only the nested `config` object. The `plugins:` map key is the capability id used for add/remove and diagnostics; returned plugin instances keep their own `plugin.id`.

### 3. Compatibility contract during alpha

External plugins use normal package metadata for compatibility during alpha. Because `PLUGIN_API_VERSION` currently tracks the `@rizom/brain` package version, a separate runtime semver check would duplicate package-manager peer dependency resolution.

Current behavior:

- publish `PLUGIN_API_VERSION` for author visibility and future compatibility work
- plugin packages declare compatible `@rizom/brain` versions with `peerDependencies`
- plugin package versions stay in the instance `package.json`, not `brain.yaml`

Deferred behavior:

- add `rizomBrain.pluginApi` runtime checks only if/when the public plugin API version diverges from the package version
- document deprecation and breaking-change policy before declaring plugin API v1 stable

Package metadata shape:

```json
{
  "name": "@rizom/brain-plugin-calendar",
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "peerDependencies": {
    "@rizom/brain": "^0.2.0-alpha.45"
  }
}
```

Package managers enforce or warn on this compatibility through peer dependency resolution. A future independent `rizomBrain.pluginApi` field can be added once it carries information that package version ranges cannot.

### 4. Add basic plugin CLI ergonomics

Optional but useful follow-on CLI work:

- `brain search` for npm plugin discovery
- `brain add` to install and write a keyed `plugins.<id>.package` entry in `brain.yaml`
- `brain remove` to uninstall and remove the keyed plugin entry/config

This should only land if it materially improves the operator path.

### 5. Prove the external DX end-to-end

Before calling this done, ship:

- one reference external plugin in a separate repo after the public package is published
- tests proving authoring + loading work end-to-end (package-local compile fixture and runtime loading tests are in place)
- plugin author docs covering setup, config, testing, and publishing (initial authoring docs are in place; publishing docs can be refined from the separate-repo reference)

## Non-goals

- publishing every internal `@brains/*` workspace package directly
- plugin sandboxing
- hot reload for plugin code
- a custom plugin marketplace or registry

## Dependencies

- current published `@rizom/brain` package contract
- `docs/plans/shell-init-coordination.md` — completed lifecycle foundation; public plugin exports can now build on stable `onRegister`/`onReady` semantics
- `docs/plans/custom-brain-definitions.md` — the `brain.ts` programmatic-mode plan, which assumes the public subpath surface from §1 already exists

## Done when

1. audit decisions are recorded in this plan for every §0 area, and those decisions are reflected in the codebase
2. external plugin authors can import the required public APIs from `@rizom/brain`
3. installed plugins can be declared in `brain.yaml` and loaded at runtime
4. plugin package compatibility expectations are documented through `peerDependencies`
5. at least one external reference plugin proves the full path
6. plugin author documentation exists and matches reality
