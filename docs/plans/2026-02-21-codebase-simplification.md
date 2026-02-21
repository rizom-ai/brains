# Codebase Simplification Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove dead code, eliminate unnecessary abstractions, harmonize plugin patterns, and clean up stale documentation.

**Architecture:** Refactoring-only — no new features. Each task is independent and can be committed separately. Existing tests must continue to pass; new tests only where behavior changes.

**Tech Stack:** TypeScript, Bun test, Zod schemas

---

### Task 1: Make `generateEntityUrl` optional in `ResolutionOptions`

**Files:**

- Modify: `shell/content-service/src/types.ts:68`
- Modify: `shell/content-service/test/resolve-content.test.ts` (remove dead field from call sites)

**Step 1: Make the field optional**

In `shell/content-service/src/types.ts`, change line 68 from:

```typescript
generateEntityUrl: (entityType: string, slug: string) => string;
```

to:

```typescript
generateEntityUrl?: (entityType: string, slug: string) => string;
```

**Step 2: Remove `generateEntityUrl` from test call sites**

In `shell/content-service/test/resolve-content.test.ts`, remove `generateEntityUrl: testGenerateEntityUrl` from every `resolveContent()` call. Also remove the `testGenerateEntityUrl` helper function (lines 15-20) if no longer used.

**Step 3: Check for other callers**

Run: `grep -r "generateEntityUrl" --include="*.ts" shell/ plugins/`

If any production code actually reads this field, keep it optional but don't remove from those call sites. The field should remain available for site-builder's `SiteBuilder` which passes it through template resolution.

**Step 4: Verify**

Run: `bun run typecheck && bun test shell/content-service/`

**Step 5: Commit**

```
refactor: make generateEntityUrl optional in ResolutionOptions
```

---

### Task 2: Fix `ContentGenerationJobHandler` error handling

**Files:**

- Modify: `shell/content-service/src/handlers/contentGenerationJobHandler.ts:198,206-226`

**Step 1: Replace `throw error` with error return**

In `contentGenerationJobHandler.ts`, find the catch block around line 198 that does `throw error`. Replace with:

```typescript
return {
  success: false,
  error: error instanceof Error ? error.message : "Unknown error",
};
```

**Step 2: Remove dead `onError` method**

Delete the `onError` method (lines 206-226). It's all logging that never executes because the error is thrown before it could be called.

**Step 3: Verify**

Run: `bun run typecheck && bun test shell/content-service/`

**Step 4: Commit**

```
fix: return error result instead of throwing in ContentGenerationJobHandler
```

---

### Task 3: Eliminate `ServiceRegistry` package

This is the most involved task. The ServiceRegistry exists to lazily resolve `shell` and `mcpService`, but both are always required and always present by the time plugins initialize.

**Files:**

- Delete: `shell/service-registry/` (entire package)
- Modify: `shell/plugins/src/manager/pluginManager.ts`
- Modify: `shell/plugins/src/manager/pluginRegistrationHandler.ts`
- Modify: `shell/plugins/src/test/mock-shell.ts`
- Modify: `shell/core/src/initialization/shellInitializer.ts`
- Modify: `shell/core/src/types/shell-types.ts`
- Modify: `shell/core/package.json` (remove dependency)
- Modify: `shell/plugins/package.json` (remove dependency if present)
- Modify: Tests that mock ServiceRegistry

**Step 1: Add `setShell` method to PluginManager**

The problem: PluginManager is created before Shell exists. Currently it receives ServiceRegistry in the constructor and lazily resolves Shell later.

Solution: Replace `serviceRegistry` with a `shell` field set via a setter after Shell creation.

In `shell/plugins/src/manager/pluginManager.ts`:

- Remove `serviceRegistry` from constructor parameters and field
- Remove `ServiceRegistry` import
- Add a `shell: IShell | null = null` private field
- Add `setShell(shell: IShell): void` public method
- Change line 155 from `this.serviceRegistry.resolve<IShell>("shell")` to `this.shell!` (or throw if null)

**Step 2: Update PluginRegistrationHandler similarly**

In `shell/plugins/src/manager/pluginRegistrationHandler.ts`:

- Remove `serviceRegistry` from constructor parameters and field
- Remove `ServiceRegistry` import
- Add `shell: IShell | null = null` private field
- Add `setShell(shell: IShell): void` public method
- Change lines 81-83 from `this.serviceRegistry.resolve<IShell>("shell")` to `this.shell!`

**Step 3: Update ShellInitializer**

In `shell/core/src/initialization/shellInitializer.ts`:

- Remove ServiceRegistry creation (line 362)
- Remove `serviceRegistry.register("shell", ...)` and `serviceRegistry.register("mcpService", ...)`
- After Shell is created, call `pluginManager.setShell(shell)` instead
- Remove ServiceRegistry import

**Step 4: Update ShellDependencies type**

In `shell/core/src/types/shell-types.ts`, remove `serviceRegistry?: ServiceRegistry` from the interface.

**Step 5: Update mock-shell.ts**

In `shell/plugins/src/test/mock-shell.ts`, remove the `getServiceRegistry()` method and the mock implementation.

**Step 6: Update tests**

Search for all test files that reference ServiceRegistry:

- `shell/plugins/test/manager/pluginManager.test.ts`
- `shell/plugins/test/plugin-manager-registration.test.ts`
- `shell/core/test/shell-initialization-order.test.ts`

Replace `serviceRegistry.register("shell", () => mockShell)` patterns with direct `pluginManager.setShell(mockShell)` calls.

**Step 7: Remove the package**

- Delete `shell/service-registry/` directory
- Remove `@brains/service-registry` from `shell/core/package.json` and `shell/plugins/package.json`
- Run `bun install` to update lockfile

**Step 8: Verify**

Run: `bun run typecheck && bun test shell/core/ && bun test shell/plugins/`

**Step 9: Commit**

```
refactor: eliminate ServiceRegistry package, pass shell directly to PluginManager
```

---

### Task 4: Extract `SingletonEntityService<T>` base class

**Files:**

- Create: `shell/identity-service/src/singleton-entity-service.ts` (base class)
- Modify: `shell/identity-service/src/identity-service.ts`
- Modify: `shell/profile-service/src/profile-service.ts`
- Modify: `shell/identity-service/src/index.ts` (export base class for profile-service to import)
- Modify: `shell/profile-service/package.json` (add dependency on identity-service, or put base in shared location)

**Step 1: Decide base class location**

The base class should live in a location both services can import. Options:

- In `shell/identity-service/` and have profile-service depend on it
- In `shared/utils/` or a new shared location

Prefer putting it in `shell/identity-service/` since that's the natural home and profile-service can depend on it. If that creates a weird dependency, put it in `shared/utils/`.

**Step 2: Create the base class**

Extract the 8 shared methods identified in research:

- `getInstance()` / `resetInstance()` / `createFresh()` (singleton pattern)
- `initialize()` — load entity, create default if missing
- `get()` — return parsed body from cache or default
- `getContent()` — return raw content from cache or generated default
- `refreshCache()` — reload from entity service
- `load()` (private) — fetch entity from entity service

The base class is generic over:

- `TBody` — the parsed body type (IdentityBody / ProfileBody)
- `TEntity` — the entity type
- `TAdapter` — the adapter type (needs `parseBody()` and `createContent()`)

```typescript
export abstract class SingletonEntityService<TBody, TEntity> {
  protected cache: TEntity | null = null;

  constructor(
    protected readonly entityService: IEntityService,
    protected readonly logger: Logger,
    protected readonly entityType: string,
    protected readonly defaultBody: TBody,
  ) {}

  abstract parseBody(content: string): TBody;
  abstract createContent(body: TBody): string;

  async initialize(): Promise<void> {
    /* shared logic */
  }
  get(): TBody {
    /* shared logic */
  }
  getContent(): string {
    /* shared logic */
  }
  async refreshCache(): Promise<void> {
    /* shared logic */
  }
  protected async load(): Promise<void> {
    /* shared logic */
  }
}
```

**Step 3: Refactor IdentityService to extend base**

Keep `IdentityService` class name and public API. Override only what differs.

**Step 4: Refactor ProfileService to extend base**

Same approach. Import base class from identity-service or shared location.

**Step 5: Verify**

Run: `bun run typecheck && bun test shell/identity-service/ && bun test shell/profile-service/`

Also run: `bun test shell/core/` (shell initializes both services)

**Step 6: Commit**

```
refactor: extract SingletonEntityService base class for Identity and Profile
```

---

### Task 5: Replace raw progress numbers with `PROGRESS_STEPS`

**Files:**

- Modify: `plugins/blog/src/handlers/blogGenerationJobHandler.ts`
- Modify: `plugins/decks/src/handlers/deckGenerationJobHandler.ts`
- Modify: `plugins/note/src/handlers/noteGenerationJobHandler.ts`
- Modify: `plugins/social-media/src/handlers/generationHandler.ts`
- Modify: `plugins/newsletter/src/handlers/generation-handler.ts`

**Step 1: Update each handler**

For each of the 5 files:

1. Add import: `import { PROGRESS_STEPS } from "@brains/utils";`
2. Replace all raw progress numbers:
   - `progress: 0` → `progress: PROGRESS_STEPS.START`
   - `progress: 10` → `progress: PROGRESS_STEPS.INIT`
   - `progress: 50` → `progress: PROGRESS_STEPS.GENERATE`
   - `progress: 60` → `progress: PROGRESS_STEPS.EXTRACT`
   - `progress: 80` → `progress: PROGRESS_STEPS.SAVE`
   - `progress: 100` → `progress: PROGRESS_STEPS.COMPLETE`

Not all handlers use all steps — match the semantic meaning, not just the number.

**Step 2: Verify**

Run: `bun run typecheck && bun test plugins/blog/ && bun test plugins/decks/ && bun test plugins/note/ && bun test plugins/social-media/ && bun test plugins/newsletter/`

**Step 3: Commit**

```
refactor: use PROGRESS_STEPS constants in all generation handlers
```

---

### Task 6: Extract shared `GenerationResultSchema`

**Files:**

- Modify: `shell/plugins/src/schemas/` or `shell/plugins/src/types/` (add shared schema)
- Modify: `shell/plugins/src/index.ts` (export it)
- Modify: 5 handler files (import instead of redefine)

**Step 1: Add the shared schema**

In `shell/plugins/src/` (where shared plugin types live), create or add to an existing file:

```typescript
export const generationResultSchema = z.object({
  success: z.boolean(),
  entityId: z.string().optional(),
  error: z.string().optional(),
});

export type GenerationResult = z.infer<typeof generationResultSchema>;
```

Export from `shell/plugins/src/index.ts`.

**Step 2: Update handlers to import it**

In each of the 5 handlers, replace the local `generationResultSchema` definition with:

```typescript
import { generationResultSchema } from "@brains/plugins";
```

Remove the local schema definition.

**Step 3: Verify**

Run: `bun run typecheck && bun test plugins/blog/ && bun test plugins/decks/ && bun test plugins/note/ && bun test plugins/social-media/ && bun test plugins/newsletter/`

**Step 4: Commit**

```
refactor: extract shared GenerationResultSchema to @brains/plugins
```

---

### Task 7: Remove `RenderService.registerTemplate()` no-op

**Files:**

- Modify: `shell/render-service/src/render-service.ts:81-104`
- Modify: `shell/render-service/src/types.ts` (if interface requires this method)

**Step 1: Check the interface**

Read `IViewTemplateRegistry` interface. If `registerTemplate` is required, make it optional or remove it from the interface.

**Step 2: Remove the method**

Delete the empty `registerTemplate()` method from `RenderService`.

**Step 3: Check callers**

Run: `grep -r "registerTemplate" --include="*.ts" shell/ plugins/`

If anything calls `renderService.registerTemplate()`, those calls are also dead (the method does nothing) — remove them too.

**Step 4: Verify**

Run: `bun run typecheck && bun test shell/render-service/`

**Step 5: Commit**

```
refactor: remove RenderService.registerTemplate() no-op method
```

---

### Task 8: Remove unused public exports

**Files:**

- Modify: `shell/entity-service/src/index.ts:5` (remove BaseEntityFormatter export)
- Modify: `plugins/analytics/src/index.ts:53` (remove CloudflareClient export)

**Step 1: Remove exports**

Remove the two export lines. Keep the classes themselves — they're used internally.

**Step 2: Check for breakage**

Run: `bun run typecheck`

If anything external imported these, the typecheck will fail and we'll know to keep the export.

**Step 3: Commit**

```
refactor: remove unused public exports (BaseEntityFormatter, CloudflareClient)
```

---

### Task 9: Consolidate plugin test harness factories

**Files:**

- Modify: `shell/plugins/src/test/harness.ts:233-264`
- Modify: `shell/plugins/src/test/index.ts` (update exports)
- Modify: All test files that import these factories (update imports)

**Step 1: Create unified factory**

Replace the three functions with one:

```typescript
export function createPluginHarness<T extends CorePlugin = CorePlugin>(
  options?: HarnessOptions,
): PluginTestHarness<T> {
  return new PluginTestHarness<T>({
    logContext: "plugin-test",
    ...options,
  });
}
```

Keep the old names as aliases for backward compatibility:

```typescript
export const createCorePluginHarness = createPluginHarness;
export const createServicePluginHarness = createPluginHarness as <
  T extends ServicePlugin = ServicePlugin,
>(
  options?: HarnessOptions,
) => PluginTestHarness<T>;
export const createInterfacePluginHarness = createPluginHarness as <
  T extends InterfacePlugin = InterfacePlugin,
>(
  options?: HarnessOptions,
) => PluginTestHarness<T>;
```

**Step 2: Verify**

Run: `bun run typecheck && bun test shell/plugins/`

**Step 3: Commit**

```
refactor: consolidate plugin test harness factories into createPluginHarness
```

---

### Task 10: Clarify `plugins/examples` status

**Files:**

- Modify: `plugins/examples/README.md` (create or update)

**Step 1: Add README**

Create `plugins/examples/README.md`:

```markdown
# Plugin Examples

Reference implementations demonstrating all plugin types. These are not imported by any application — they exist as documentation and code samples.

- `ExampleCorePlugin` — CorePlugin with tools and resources
- `ExampleInterfacePlugin` — InterfacePlugin with daemon management
- `CalculatorServicePlugin` — ServicePlugin with entity registration
```

**Step 2: Commit**

```
docs: add README to plugins/examples clarifying reference-only status
```

---

### Task 11: Documentation cleanup

**Files:**

- Delete: `docs/plans/deduplicate-entity-ids.md`
- Modify: `docs/architecture-overview.md:23` (remove command-registry reference)
- Check: `docs/implementation-plans/job-queue-deduplication.md`

**Step 1: Delete completed plan**

```bash
rm docs/plans/deduplicate-entity-ids.md
```

**Step 2: Remove stale reference**

In `docs/architecture-overview.md`, delete line 23:

```
- **shell/command-registry**: Command registration and management
```

**Step 3: Check job-queue-deduplication plan**

Read `docs/implementation-plans/job-queue-deduplication.md`. If the work is completed, delete it. If not, leave it.

**Step 4: Verify no broken links**

Run: `grep -r "command-registry" --include="*.md" docs/`
Run: `grep -r "deduplicate-entity-ids" --include="*.md" docs/`

**Step 5: Commit**

```
docs: remove stale command-registry reference and completed plan docs
```
