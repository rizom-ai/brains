# Plan: Migrate Tests from MockShell to Plugin Harness

## Context

31 test files use `createMockShell` directly despite it being deprecated. The `createPluginHarness()` from `@brains/plugins/test` is the intended replacement. Tests should never import or interact with MockShell directly.

## Step 1: Add missing methods to harness

Methods tests need that the harness doesn't expose yet:

| Method                   | Uses        | Source                                    |
| ------------------------ | ----------- | ----------------------------------------- |
| `getEntityService()`     | 9           | `mockShell.getEntityService()`            |
| `createEntity(entity)`   | convenience | wraps `getEntityService().createEntity()` |
| `getEntity(type, id)`    | convenience | wraps `getEntityService().getEntity()`    |
| `getApiRoutes()`         | 4           | `mockShell.getPluginApiRoutes()`          |
| `setAgentService(mock)`  | 3           | interface tests that mock agent responses |
| `getDaemonRegistry()`    | 2           | interface tests checking daemon lifecycle |
| `getPermissionService()` | 2           | interface tests mocking permissions       |

After this, `getShell()` can be deprecated on the harness — nothing should need it.

## Step 2: Migrate tests file by file

31 files, grouped by complexity:

**Simple (just subscribe + send + register)** — ~15 files:

- `plugins/blog/test/plugin-registration.test.ts`
- `plugins/decks/test/plugin-registration.test.ts`
- `plugins/portfolio/test/publish-integration.test.ts`
- `plugins/newsletter/test/publish-integration.test.ts`
- `plugins/social-media/test/publish-registration-order.test.ts`
- `plugins/social-media/test/plugin-registration.test.ts`
- `plugins/social-media/test/plugin-execute.test.ts`
- `plugins/social-media/test/auto-generate.test.ts`
- `plugins/social-media/test/tools/index.test.ts`
- `plugins/content-pipeline/test/plugin.test.ts`
- `plugins/content-pipeline/test/plugin-report.test.ts`
- `plugins/content-pipeline/test/tools/publish.test.ts`
- `plugins/summary/test/summary-plugin.test.ts`
- `plugins/summary/test/tools/index.test.ts`
- `plugins/image/test/image-plugin.test.ts`

**Medium (use entity service + message bus)** — ~10 files:

- `plugins/social-media/test/datasources/social-post-datasource.test.ts`
- `plugins/social-media/test/handlers/generationHandler.test.ts`
- `plugins/summary/test/handlers/digest-handler.test.ts`
- `plugins/topics/test/datasources/topics-datasource.test.ts`
- `plugins/topics/test/handlers/topic-extraction-handler.test.ts`
- `plugins/topics/test/lib/topic-extractor.test.ts`
- `plugins/topics/test/lib/topic-service.test.ts`
- `plugins/newsletter/test/generation-handler.test.ts`
- `shell/plugins/test/utils/channels.test.ts`
- `shell/app/test/app.test.ts`

**Complex (interface tests, agent service, daemon registry)** — ~6 files:

- `interfaces/discord/test/discord-interface.test.ts`
- `interfaces/matrix/test/matrix-interface.test.ts`
- `interfaces/cli/test/cli-channel-name.test.ts`
- `shell/plugins/test/manager/pluginManager.test.ts`
- `shell/plugins/test/plugin-manager-registration.test.ts`
- `shell/core/test/plugin-api-routes.test.ts`

## Approach

1. Add methods to harness (Step 1)
2. Migrate simple files first — one commit per batch of ~5 related files
3. Run tests after each batch
4. Deprecate `getShell()` on harness after all migrations done

## Key files

| File                                | Change                                                                                                                |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `shell/plugins/src/test/harness.ts` | Add getEntityService, createEntity, getEntity, getApiRoutes, setAgentService, getDaemonRegistry, getPermissionService |
| 31 test files                       | Replace createMockShell → createPluginHarness                                                                         |
