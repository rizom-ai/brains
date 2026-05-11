# Plan: Reconcile Public Entity Types With Runtime

## Status

Completed. Implemented on branch `public-entity-types-reconciliation` in commit `c2fc86767`.

The external plugin API was already alpha-usable, but this type reconciliation needed to land before the public authoring contract hardened further. Discovered during a `/simplify` review of the recent plugins-package refactor (commits `e32e2c1b7`, `a0ddb0f48`, `42da4d4c4`). Eleven `(context: never) → as PublicContext` casts in `shell/plugins/src/public/{entity,service,interface,message-interface}-plugin.ts` were not stylistic noise — they papered over real shape divergence between public and runtime entity-service interfaces.

## Current state

`shell/plugins/src/public/types.ts` re-declares two interfaces that already exist in `shell/entity-service/src/types.ts`:

- public `IEntityService` (~line 219) vs runtime `ICoreEntityService` (line 289)
- public `IEntitiesNamespace` (~line 287) vs the runtime equivalent attached to plugin contexts

The redeclarations were written by hand and got three things wrong:

| Method                      | Public says     | Runtime delivers                             |
| --------------------------- | --------------- | -------------------------------------------- |
| `getEntity`, `listEntities` | `<T = unknown>` | `<T extends BaseEntity>`                     |
| `search`                    | `Promise<T[]>`  | `Promise<SearchResult<T>[]>`                 |
| `options` parameter         | `unknown`       | typed `ListOptions` / `SearchOptions` shapes |

The runtime generics are not lies. `entityService.getEntity<T>` traces through `entitySerializer.reconstructEntity → entityRegistry.validateEntity → schema.parse(entity) as TData` (`shell/entity-service/src/entityRegistry.ts:144-147`). The plugin registered the schema for that entity type, so the narrowing is real.

The public delegates wrap a runtime base class. Their override methods declare `(context: never)` and `return this.hooks.onRegister(context as PublicEntityPluginContext)`. The cast hides the fact that the runtime context (with the correct `IEntityService` shape) is not assignable to the public context (with the incorrect shape) under TypeScript's structural variance check.

## Approach

Single source of truth. `shell/plugins/src/public/types.ts` should re-export the relevant interfaces from `@brains/entity-service` instead of re-declaring them. Specifically:

- `IEntityService` ← runtime `ICoreEntityService` (`shell/entity-service/src/types.ts:289`).
- `IEntitiesNamespace` (the namespace methods plugins call — `register`, `update`, `getAdapter`, `registerDataSource`, `registerCreateInterceptor`) ← a single canonical definition, found in or moved into `shell/entity-service`.
- `ListOptions`, `SearchOptions`, `SearchResult` ← runtime types, exported alongside.

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
- `shell/plugins/src/public/types.ts` no longer redeclares `IEntityService` or `IEntitiesNamespace`; public plugin types re-export the canonical runtime contracts, with public `IEntityService` mapped to `ICoreEntityService`.

### 3. Remove the casts

Across `shell/plugins/src/public/{entity,service,interface,message-interface}-plugin.ts`:

- Replaced `(context: never)` overrides with the actual typed parameter (the internal context type from `../{entity,service,interface}/context.ts`).
- Dropped the `as PublicContext` casts in hook calls.
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
