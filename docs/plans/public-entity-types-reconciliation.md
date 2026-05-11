# Plan: Reconcile Public Entity Types With Runtime

## Status

Completed. Implemented on branch `public-entity-types-reconciliation` in commit `c2fc86767` and merged against the current public-surface plan.

The external plugin API was already alpha-usable, but this type reconciliation needed to land before the public authoring contract hardened further. The divergence between public `IEntityService` and runtime `ICoreEntityService` was real and growing, and paired `(context: never)` overrides plus `context as <Plugin>Context` casts in `shell/plugins/src/public/{entity,interface,message-interface,service}-plugin.ts` papered over it instead of fixing it.

## Current state

`shell/plugins/src/public/types.ts` re-declares interfaces that already exist in `shell/entity-service/src/types.ts`:

- public `IEntityService` vs runtime `ICoreEntityService`
- public `IEntitiesNamespace` vs the internal namespace shape defined in `shell/plugins/src/entity/context.ts`
- public `GetEntityRequest`, `ListEntitiesRequest`, `EntitySearchRequest` vs the same names on the runtime

The redeclarations were written by hand and have drifted from the runtime in four ways:

| Method                        | Public says                      | Runtime delivers                                                       |
| ----------------------------- | -------------------------------- | ---------------------------------------------------------------------- |
| `getEntity`, `listEntities`   | `<T = unknown>`                  | `<T extends BaseEntity>`                                               |
| `search`                      | `<T = unknown>` → `Promise<T[]>` | `<T extends BaseEntity = BaseEntity>` → `Promise<SearchResult<T>[]>`   |
| `ListEntitiesRequest.options` | redeclared parallel type         | `ListOptions \| undefined` (typed `publishedOnly` / `filter` / `sort`) |
| `getEntityTypeConfig`         | absent                           | `(type: string) => EntityTypeConfig`                                   |

`getEntityTypeConfig` is the worst category — `entities/topics/src/index.ts` calls `entityService.getEntityTypeConfig(entityType).projectionSource` to enforce the cross-plugin cycle guard, but external plugin authors can't see this method on the public type. Any analogous usage from a published plugin forces an `as never` style escape.

Two other runtime-only methods, `getEntityRaw` and `getWeightMap`, stay internal:

- `getEntityRaw` is an entity-service-internal escape hatch used only by `shell/entity-service/src/lib/content-resolver.ts` to avoid recursion when resolving image references. No plugin should call it directly.
- `getWeightMap` is only consumed by `shell/core/src/datasources/ai-content-datasource.ts`. It's a core-internal weighting concern, not part of the plugin contract.

These two need to be reachable from the runtime implementation but explicitly excluded from the public interface — so the cleanup also has to slim or split `ICoreEntityService` (which currently bundles them in) before it can be safely re-exported as the public type.

The runtime generics are not lies. `entityService.getEntity<T>` traces through `entitySerializer.reconstructEntity → entityRegistry.validateEntity → schema.parse(entity) as TData`. The plugin registered the schema for that entity type, so the narrowing is real.

The public delegate methods declare `(context: never)` and call `this.hooks.onRegister(context as <Plugin>Context)`. The cast hides the fact that the runtime context (with the correct `IEntityService` shape) is not assignable to the public context (with the incorrect shape) under TypeScript's structural variance check. The pattern repeats nine times across the four public plugin files.

## Approach

Single source of truth, with a clean public/internal split. `shell/entity-service` should expose:

- a public `IEntityService` interface containing only methods external plugins should see — the read-side methods (`getEntity`, `listEntities`, `search`, `getEntityTypes`, `hasEntityType`, `countEntities`, `getEntityCounts`) plus `getEntityTypeConfig`.
- an internal `ICoreEntityService extends IEntityService` (or equivalent name) that adds `getEntityRaw` and `getWeightMap` for use by `shell/*` consumers only.
- the request/option types (`ListOptions`, `SearchOptions`, `SearchResult`, `GetEntityRequest`, `ListEntitiesRequest`, `EntitySearchRequest`) exported once from this package.

`shell/plugins/src/public/types.ts` then re-exports the public-facing pieces instead of re-declaring them:

- `IEntityService` re-exports the new entity-service public interface.
- `IEntitiesNamespace` re-exports from its canonical home (`shell/plugins/src/entity/context.ts`). It includes plugin-only operations (`registerDataSource`, `registerCreateInterceptor`) that don't belong on `@brains/entity-service`, so it stays there.
- `ListOptions`, `SearchOptions`, `SearchResult`, `GetEntityRequest`, `ListEntitiesRequest`, `EntitySearchRequest` re-export from `@brains/entity-service`.

Once the type identities collapse to one, the wide internal context becomes structurally compatible with the public context. The casts and `(context: never)` overrides can be replaced with proper typed parameters: `(context: EntityPluginContext) → return this.hooks.onRegister(context)`.

## Implemented work

### 1. Tests first

Extended the public-API typecheck fixture at `packages/brain-cli/test/fixtures/external-plugin/`:

- A file that calls `context.entityService.search<MyEntity>(...)` and assigns to `SearchResult<MyEntity>[]`. With the current public type this compiles as `MyEntity[]` — under the fix it must compile as `SearchResult<MyEntity>[]`. This pins the silent-bug case.
- A file that calls `context.entityService.getEntity<MyEntity>(...)` where `MyEntity extends BaseEntity` — the new constraint, currently absent.
- A file that passes a typed `ListOptions` to `listEntities` — locks in autocomplete for `publishedOnly` / `filter` / `sort` etc.

The new fixture files compiled RED against the old public types and GREEN after the fix.

### 2. Reconcile types

- `ICoreEntityService`, `ListOptions`, `SearchOptions`, `SearchResult`, and `IEntitiesNamespace` are exported from `@brains/entity-service`.
- `IEntitiesNamespace` was lifted from `shell/plugins/src/entity/context.ts` into `shell/entity-service/src/types.ts` and imported by runtime plugin contexts.
- `shell/plugins/src/public/types.ts` no longer redeclares entity request/options/result shapes or `IEntitiesNamespace`; public plugin types use the canonical runtime contracts.
- Public `IEntityService` is derived from `ICoreEntityService` as the documented read/query subset plus `getEntityTypeConfig`, so `getEntityRaw` and `getWeightMap` remain out of the public `@rizom/brain/plugins` entity-service surface.

### 3. Remove the casts

Across `shell/plugins/src/public/{entity,service,interface,message-interface}-plugin.ts`:

- Replaced `(context: never)` overrides with the actual typed parameter (the internal context type from `../{entity,service,interface}/context.ts`).
- Dropped the `context as <Plugin>Context` casts in hook calls.
- Updated `EntityPluginDelegate.interceptCreate` the same way.

After the fix, `grep -rn "as never\|context: never\|as EntityPluginContext\|as ServicePluginContext\|as InterfacePluginContext" shell/plugins/src/public/` returns no matches.

### 4. Update `@rizom/brain` public re-exports

`packages/brain-cli/src/entries/plugins.ts` and `entries/entities.ts` expose the newly-canonical types so external authors can import them:

- `ListOptions`, `SearchOptions`, `SearchResult` are available from `@rizom/brain/entities`.
- `IEntityService`, `IEntitiesNamespace` are available from `@rizom/brain/plugins` with the same public names and accurate shapes.

### 5. Public-surface notes

The published `@rizom/brain/*` contract now has the following adjustments:

- `@rizom/brain/plugins`: `IEntityService` shape uses `<T extends BaseEntity>` and the corrected `search` return type.
- `@rizom/brain/entities`: gains `ListOptions`, `SearchOptions`, `SearchResult` as public types.

A changeset records the alpha-phase breaking type tightening: external plugins currently typed against `<T = unknown>` for `getEntity` / `listEntities` may need a touch-up.

## Non-goals

- Adding the `EntityService` _class_ to the public surface. Only the interface(s) it implements.
- Widening the runtime types to match the (broken) public ones — the runtime is correct.
- Introducing a third `IEntityService` definition.
- Exposing `getEntityRaw` or `getWeightMap` on the public surface. They are internal to `entity-service` and `shell/core` respectively, and should stay that way.
- Reworking the `register(shell, context)` low-level entry point. The `IShell` / `PluginRegistrationContext` bridge is pre-existing internal glue and out of scope.

## Dependencies

- The published `@rizom/brain/*` public surface — this plan tightens the entity types it exposes.
- `@brains/entity-service` exports — the runtime types must be reachable from `@brains/plugins/public/types.ts` without pulling in implementation classes.
- The package-local fixture in `packages/brain-cli/test/fixtures/external-plugin/` — the regression net.

## Completion evidence

1. The three new fixture files in `packages/brain-cli/test/fixtures/external-plugin/` compile GREEN under the new types and compiled RED under the old public `search<T>()` shape.
2. `grep` for `as never`, `context: never`, and `as {Entity,Service,Interface}PluginContext` in `shell/plugins/src/public/` returns no matches.
3. `bun run typecheck` passed.
4. `bun test shell/plugins/test shell/entity-service/test packages/brain-cli/test` passed.
5. The generated `@rizom/brain/plugins` and `@rizom/brain/entities` declarations reflect the new public-type contract.
6. `.changeset/public-entity-types-reconciliation.md` notes the alpha-phase breaking change for external authors who relied on `<T = unknown>`.

## Heads up

The external reference plugins (`rizom-ai/brain-plugin-hello`, `rizom-ai/brain-plugin-recipes`) typecheck against published `@rizom/brain` declarations. Adding `<T extends BaseEntity>` constraints where the published types had `<T = unknown>` is technically a breaking change. Acceptable during alpha; record it.
