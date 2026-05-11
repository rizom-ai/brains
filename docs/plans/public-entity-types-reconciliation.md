# Plan: Reconcile Public Entity Types With Runtime

## Status

Proposed. Near-term: the external plugin API is already alpha-usable, but this type reconciliation should land before the public authoring contract hardens further. The divergence between public `IEntityService` and runtime `ICoreEntityService` is real and growing, and nine paired `(context: never)` overrides plus `context as <Plugin>Context` casts in `shell/plugins/src/public/{entity,interface,message-interface,service}-plugin.ts` paper over it instead of fixing it.

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

## Open work

### 1. Tests first

Extend the public-API typecheck fixture at `packages/brain-cli/test/fixtures/external-plugin/`:

- A file that calls `context.entityService.search<MyEntity>(...)` and assigns to `SearchResult<MyEntity>[]`. With the current public type this compiles as `MyEntity[]` — under the fix it must compile as `SearchResult<MyEntity>[]`. This pins the silent-bug case.
- A file that calls `context.entityService.getEntity<MyEntity>(...)` where `MyEntity extends BaseEntity` — the new constraint, currently absent.
- A file that passes a typed `ListOptions` to `listEntities` — locks in autocomplete for `publishedOnly` / `filter` / `sort` etc.

Each new fixture file must compile RED on `bunx tsc --noEmit -p packages/brain-cli/test/fixtures/external-plugin` against the current types, and GREEN after the fix.

### 2. Reconcile types

- In `shell/entity-service/src/types.ts`, split `ICoreEntityService` into a public `IEntityService` (read methods + `getEntityTypeConfig`) and a runtime-only superset that keeps `getEntityRaw` and `getWeightMap`. Update internal call sites (`content-resolver.ts`, `ai-content-datasource.ts`) to use the runtime-only type.
- Ensure the public `IEntityService`, `ListOptions`, `SearchOptions`, `SearchResult`, `GetEntityRequest`, `ListEntitiesRequest`, and `EntitySearchRequest` are all exported from the package's public entry.
- Keep `IEntitiesNamespace` in `shell/plugins/src/entity/context.ts` and make sure `shell/plugins/src/public/types.ts` can import it without re-declaring.
- In `shell/plugins/src/public/types.ts`, delete every redeclared interface in the entity-service family (`IEntityService`, `IEntitiesNamespace`, request shapes) and replace with re-exports from the canonical packages. The new `IEntityService` already carries `getEntityTypeConfig`; do not add `getEntityRaw` or `getWeightMap` here — they are intentionally internal.

### 3. Remove the casts

Across `shell/plugins/src/public/{entity,service,interface,message-interface}-plugin.ts`:

- Replace `(context: never)` overrides with the actual typed parameter (the internal context type from `../{entity,service,interface}/context.ts`).
- Drop the `context as <Plugin>Context` casts in the `onRegister` / `onReady` hook calls.
- The `EntityPluginDelegate.interceptCreate` site in `entity-plugin.ts` follows the same pattern (currently casts to `EntityPluginContext`).

After the fix, `grep -rn "as never\|context: never\|as EntityPluginContext\|as ServicePluginContext\|as InterfacePluginContext" shell/plugins/src/public/` must return no matches.

### 4. Update `@rizom/brain` public re-exports

`packages/brain-cli/src/entries/plugins.ts` and `entries/entities.ts` need to add the newly-canonical types so external authors can import them:

- `ListOptions`, `SearchOptions`, `SearchResult` join `@rizom/brain/entities`.
- `IEntityService`, `IEntitiesNamespace` are unchanged from external-author perspective (same names, accurate shapes).

### 5. Public-surface notes

The published `@rizom/brain/*` contract needs the following adjustments:

- `@rizom/brain/plugins`: `IEntityService` shape uses `<T extends BaseEntity>` and the corrected `search` return type.
- `@rizom/brain/entities`: gains `ListOptions`, `SearchOptions`, `SearchResult` as public types.

Record the breaking-change note: external plugins currently typed against `<T = unknown>` for `getEntity` / `listEntities` may need a touch-up. Acceptable during alpha; flag in a changeset.

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

## Done when

1. The three new fixture files in `packages/brain-cli/test/fixtures/external-plugin/` compile GREEN under the new types and previously compiled RED under the old.
2. `grep` for `as never`, `context: never`, and `as {Entity,Service,Interface}PluginContext` in `shell/plugins/src/public/` returns no matches.
3. `bun turbo run typecheck` passes for all packages.
4. `bun test` passes `shell/plugins/test/`, `shell/entity-service/test/`, `packages/brain-cli/test/`, and the public-API typecheck suite.
5. The published `@rizom/brain/plugins` and `@rizom/brain/entities` declarations reflect the new public-type contract.
6. A changeset notes the alpha-phase breaking change for external authors who relied on `<T = unknown>`.

## Heads up

The external reference plugins (`rizom-ai/brain-plugin-hello`, `rizom-ai/brain-plugin-recipes`) typecheck against published `@rizom/brain` declarations. Adding `<T extends BaseEntity>` constraints where the published types had `<T = unknown>` is technically a breaking change. Acceptable during alpha; record it.
