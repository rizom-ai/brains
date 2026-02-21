# Codebase Simplification

## Goal

Remove dead code, eliminate unnecessary abstractions, harmonize plugin patterns, and clean up stale documentation across the monorepo.

## Section 1: Type, Error Handling & Dead Abstraction Fixes

### 1. Make `generateEntityUrl` optional in `ResolutionOptions`

`shell/content-service/src/types.ts` declares `generateEntityUrl` as required, but `ContentService.resolveContent()` never reads it. Every caller (20+ sites including tests) supplies a dead field.

- Make the field optional
- Remove from test call sites that supply it unnecessarily

### 4. Fix `ContentGenerationJobHandler`

`shell/content-service/src/handlers/contentGenerationJobHandler.ts` throws on error instead of returning `{ success: false, error }`, violating the plugin error-handling contract. It also has a dead `onError` method (all comments).

- Wrap in try/catch, return error result instead of throwing
- Remove dead `onError` method

### 5. Eliminate `ServiceRegistry` package

`shell/service-registry/` is a full singleton-pattern package to store exactly 2 always-required references (`shell` and `mcpService`). A registry with lazy factory resolution is pointless when both services are always present.

- Pass `shell` and `mcpService` directly as constructor args to `PluginManager` and `PluginRegistrationHandler`
- Remove `shell/service-registry/` package entirely
- Update `ShellInitializer` to wire dependencies directly
- Remove from `shell/core/package.json` devDependencies

## Section 2: Shared Base Class Extraction

### 2. Extract `SingletonEntityService<T>` base class

`IdentityService` and `ProfileService` are structural clones — identical singleton pattern, `initialize`/`load`/`get`/`getContent`/`refreshCache` lifecycle, identical `FrontmatterContentHelper` setup. ~150 lines of duplication.

- Create a base class encapsulating the shared lifecycle
- Both services extend it, providing only their schema, entity type string, and defaults
- No consumer API changes

## Section 3: Plugin Harmonization

### 3. Replace raw progress numbers with `PROGRESS_STEPS`

5 generation handlers (blog, decks, note, social-media, newsletter) hardcode `0/10/50/60/80/100` instead of using `PROGRESS_STEPS` from `@brains/utils`.

- Import and use `PROGRESS_STEPS.START/INIT/GENERATE/EXTRACT/SAVE/COMPLETE`

### 10. Extract shared `GenerationResultSchema`

The result schema (`{ success, entityId?, error? }`) is copy-pasted across all 5 generation handlers.

- Extract to `@brains/plugins` as a reusable schema
- Each handler imports instead of redefining

## Section 4: Dead Code & Unused Export Cleanup

### 8/9. Clarify `plugins/examples` status

`plugins/examples` is never imported by any app. It exists as reference code only.

- Move to `docs/examples/plugins/` or add a clear README marking it as reference-only
- Remove from turborepo pipeline if being built/tested unnecessarily

### 11. Remove `RenderService.registerTemplate()` no-op

Empty method with a comment explaining it exists for compatibility. The abstraction doesn't fit.

- Remove the empty method
- Update the interface (make optional or remove from interface)

### 12. Stop exporting `BaseEntityFormatter`

Exported from `shell/entity-service/src/index.ts` but only used internally by `shell/core`.

- Remove from public exports, keep the class

### 14. Stop exporting `CloudflareClient`

Exported from `plugins/analytics/src/index.ts` with no external consumer.

- Remove from public exports

### 15. Consolidate plugin test harness factories

`createCorePluginHarness`, `createServicePluginHarness`, `createInterfacePluginHarness` differ only by a `logContext` string.

- Replace with a single `createPluginHarness(options?)` factory
- Keep old names as aliases or update all call sites

## Section 5: Documentation Cleanup

### 6. Clean up stale docs

- Delete `docs/plans/deduplicate-entity-ids.md` (completed)
- Remove `shell/command-registry` reference from `docs/architecture-overview.md`
- Check `docs/implementation-plans/job-queue-deduplication.md` — delete if completed

## Excluded

- **Item 5 (ServiceRegistry)**: Originally considered skipping due to effort, but included after confirming both services are always required — registry adds no value
- **Item 7 (placeholder tests)**: Skipped per user preference
- **Item 13 (site-builder-astro.md)**: Active plan, linked from roadmap — no action needed
