# Comprehensive Refactor Plan

**Date**: 2026-03-07
**Status**: Proposed

---

## 1. `@brains/plugins` — Barrel Export Overload (High Priority)

**Problem**: `shell/plugins/src/index.ts` has become a **mega re-export barrel** — it re-exports from `@brains/job-queue`, `@brains/templates`, `@brains/ai-service`, `@brains/messaging-service`, `@brains/conversation-service`, `@brains/entity-service`, and `@brains/utils`. Every plugin depends on `@brains/plugins` for _everything_, making it a god-package facade that obscures actual dependency graphs.

**Impact**: You can't tell what a plugin _actually_ depends on. TypeScript must resolve the entire `@brains/plugins` tree for any plugin. It also creates a fragile coupling surface — any change to any re-exported package is a change to `@brains/plugins`.

**Refactor**:

- **Phase 1**: Audit what each plugin actually uses from `@brains/plugins`. Most only need `ServicePlugin`, `BaseEntityAdapter`, `createTypedTool`, and the context types.
- **Phase 2**: Have plugins import directly from the originating packages: `@brains/job-queue` for `BaseJobHandler`, `@brains/templates` for `Template`, `@brains/entity-service` for entity types, etc.
- **Phase 3**: Slim `@brains/plugins` down to _only_ plugin framework code: base classes, context factories, plugin manager, and the plugin interface contracts.

**Estimated effort**: Medium. Mechanical but touches every plugin's imports.

---

## 2. Cross-Plugin Dependencies (High Priority)

**Problem**: `professional-site` imports directly from `@brains/blog` and `@brains/decks` (schemas, enriched types). `blog` imports from `@brains/site-builder-plugin`. The dependency-cruiser rule `no-plugin-to-plugin-imports` exists but these are violations of the architecture's own principle.

**Impact**: Plugins can't be composed independently. You can't use `professional-site` without `blog` and `decks`. This defeats the plugin model.

**Refactor**:

- Extract shared entity types (`EnrichedBlogPost`, `EnrichedDeck`, `DeckEntity`) into a **shared schema package** (e.g., `@brains/content-schemas`) or use the entity service's generic types with runtime type narrowing.
- The homepage datasource should query entities generically by type and let the template handle presentation, rather than importing plugin-specific schemas.
- For `blog` → `site-builder`: extract the shared interface (RSS feed generation, route registration) into a protocol in `@brains/plugins` or a new `@brains/site-protocol` package.

**Estimated effort**: Medium-High. Requires rethinking how site-specific plugins compose data.

---

## 3. `link` Plugin Structure Anomaly (Low Priority, Quick Win) ✅

**Problem**: The `link` plugin defines its entire `LinkPlugin` class inside `index.ts` (138 lines) instead of a separate `plugin.ts` file like every other plugin.

**Refactor**: Extract to `plugins/link/src/plugin.ts`, make `index.ts` a clean re-export barrel like the others. 10-minute fix.

---

## 4. Theme CSS Duplication (Medium Priority)

**Problem**: 7 theme files (575–1143 lines each) all independently define the same structural CSS variables (`--color-bg`, `--color-text`, `--color-brand`, `--color-accent`, etc.) plus `@theme inline` blocks, `@layer` declarations, and semantic token mappings. There's no shared base, and the semantic token _names_ diverge between themes (brutalist has `--color-selection-*` and `--color-footer-text`, default has `--color-warning-*`).

**Impact**: Adding a new semantic token means editing 7 files. New themes can silently miss tokens, causing visual breakage.

**Refactor**:

- Create `shared/theme-base/src/theme-base.css` with:
  - All required semantic token _declarations_ (as CSS custom property fallbacks)
  - The `@theme inline` block
  - Common `@layer` structure
  - Shared component-level utility classes
- Each theme CSS imports the base and overrides only palette + semantic mappings
- Add a **theme validation script** that checks all themes define the required set of semantic tokens
- Standardize the semantic token contract across all themes

**Estimated effort**: Medium. Careful CSS work, needs visual regression testing.

---

## 5. Generation Job Handler Boilerplate (Medium Priority) ✅

**Problem**: 6 generation handlers (note, blog, decks, portfolio, newsletter, image) all follow the identical pattern:

1. Validate input with Zod schema
2. Report progress at 0%
3. Call `context.ai.generate()` with a template
4. Report progress at 50%
5. Create entity via `context.entityService.createEntity()`
6. Report progress at 100%
7. Catch and return error

They all extend `BaseJobHandler` but the _actual generation flow_ is still duplicated across ~1400 lines.

**Refactor**:

- Create a `BaseGenerationJobHandler<TInput, TOutput>` in `@brains/plugins` (or `@brains/job-queue`) that encapsulates the generate → create-entity flow
- Subclasses only provide: input schema, template name, entity type, and a `transformGenerated()` hook for entity-specific content shaping
- This would cut each handler from ~200 lines to ~40 lines

**Estimated effort**: Medium. Need to carefully abstract the common flow while keeping plugin-specific hooks.

---

## 6. DataSource Boilerplate (Medium Priority)

**Problem**: Every plugin's datasource follows the same pattern: parse a query with Zod, call `entityService.listEntities()`, transform entities, validate against output schema. The query schemas are even named identically (`entityFetchQuerySchema`) and defined inline in each file.

**Refactor**:

- Create a `BaseEntityDataSource<TEntity, TOutput>` in `@brains/plugins` or `@brains/entity-service`
- It provides: query parsing, entity fetching with pagination, and a `transform()` hook
- Extract the common `entityFetchQuerySchema` as a shared schema with optional extensions
- Each plugin datasource becomes ~30 lines instead of ~80-100

**Estimated effort**: Medium. Touch many files but each change is simple.

---

## 7. MockShell Maintenance Burden (Medium Priority)

**Problem**: `shell/plugins/src/test/mock-shell.ts` is 654 lines and implements the entire `IShell` interface manually. Every time a new method is added to `IShell`, this file must be updated. It's the #1 most painful file when the shell interface evolves.

**Refactor**:

- Replace with a **auto-mocking factory** in `@brains/test-utils` that uses `Proxy` or Bun's mock utilities to generate a complete `IShell` from the interface
- The existing `createMockServicePluginContext` in test-utils already does this for plugin contexts — extend the pattern to the shell
- Keep the explicit MockShell only for integration-style tests that need stateful behavior

**Estimated effort**: Medium. The existing test-utils already has the right patterns.

---

## 8. ShellInitializer God Constructor (Medium Priority) — Skipped

**Problem**: `shell/core/src/initialization/shellInitializer.ts` (472 lines) creates and wires ~20 services in a single `initializeServices()` method. It imports from 15+ packages. This is the hardest file to understand in the codebase.

**Refactor**:

- Split into **service groups** with their own initializer modules:
  - `initializeDataServices()` — EntityService, EmbeddingService, EntityRegistry
  - `initializeAIServices()` — AIService, AgentService, ContentService
  - `initializeCommunicationServices()` — MessageBus, ConversationService, MCPService
  - `initializeJobServices()` — JobQueueService, JobQueueWorker, BatchJobManager
  - `initializeIdentityServices()` — BrainCharacterService, AnchorProfileService
- Each returns a typed service group object
- The main `ShellInitializer` composes these groups

**Estimated effort**: Medium. Mostly mechanical extraction.

---

## 9. Entity Service Size (Low-Medium Priority) ✅

**Problem**: `shell/entity-service/src/entityService.ts` at 677 lines is the largest non-test source file. It already has extracted `EntitySearch`, `EntitySerializer`, `EntityQueries`, and `ContentResolver` — but the main class still does too much.

**Refactor**:

- Extract `createEntity` / `updateEntity` / `deleteEntity` mutation logic into an `EntityMutations` class (similar to the existing extractions)
- The `EntityService` becomes a thin coordinator that delegates to: `EntityQueries` (reads), `EntityMutations` (writes), `EntitySearch` (search), `EntitySerializer` (formatting)
- Target: EntityService under 300 lines

**Estimated effort**: Low-Medium. The pattern is already established with the other extractions.

---

## 10. Matrix Interface Monolith (Low Priority)

**Problem**: `interfaces/matrix/src/lib/matrix-interface.ts` at 616 lines handles connection, room management, message handling, and event processing in one class.

**Refactor**:

- Extract `MatrixRoomManager` (room join/leave/management)
- Extract `MatrixMessageHandler` (message parsing, command routing)
- Extract `MatrixConnectionManager` (connect/disconnect/retry)
- Keep `MatrixInterface` as the composition root

**Estimated effort**: Low-Medium.

---

## 11. Integration / Composition Tests (High Priority, Non-Breaking)

**Problem**: The 3 app-level test files are minimal. The _composition layer_ — where brain.config.ts pulls 25+ plugins together — has almost no test coverage. Plugin isolation tests are great, but they don't catch wiring issues.

**Refactor**:

- Add **smoke tests** for each brain app that:
  - Boot the shell with a subset of plugins
  - Verify all plugins register successfully
  - Verify tool/resource/entity-type counts match expectations
  - Verify message bus subscriptions are wired
- Add **contract tests** that verify each plugin's tools/resources match documented schemas
- These should be fast (< 5s) and run in CI

**Estimated effort**: Medium. High value.

---

## 12. Inconsistent Zod Import Source (Low Priority, Quick Win) ✅

**Problem**: Some files import `z` from `"zod"` directly (e.g., `plugins/note/src/schemas/note.ts`), others from `"@brains/utils"`. Both work but it's inconsistent.

**Refactor**: Standardize all to `@brains/utils` (which re-exports Zod). Single find-and-replace across the codebase.

**Estimated effort**: Trivial.

---

## 13. Lazy Plugin & Interface Loading (Medium Priority)

**Problem**: `brain.config.ts` eagerly imports all 26 packages (20 plugins + 4 interfaces + layouts + themes) at startup. This takes ~900ms just for module resolution on the professional brain. Every plugin and interface is imported and instantiated unconditionally — including Matrix and Discord interfaces even when their env vars are empty strings.

**Impact**: Startup time scales linearly with plugin count. As more plugins are added, cold start gets worse. For serverless/edge deployment or CLI commands that only need a subset, this is wasteful. It also means every `bun --watch` restart pays the full import cost.

**Observations**:

- No plugins have module-level side effects — all heavy work happens inside `onRegister()`, which is good
- The `plugins: [...]` array in `defineConfig` expects instantiated plugin objects, so lazy loading requires an API change
- Interfaces like Matrix/Discord could be skipped entirely when their tokens aren't configured

**Refactor**:

- **Phase 1 — Conditional interfaces**: Wrap interface instantiation in env checks:

  ```typescript
  ...(process.env["MATRIX_ACCESS_TOKEN"]
    ? [new MatrixInterface({ ... })]
    : []),
  ```

  This is zero-infrastructure, immediate win.

- **Phase 2 — Lazy plugin imports**: Support `() => import("@brains/note")` thunks in the plugin array. The shell resolves them at registration time:

  ```typescript
  plugins: [
    () => import("@brains/note").then((m) => m.notePlugin({})),
    () => import("@brains/blog").then((m) => m.blogPlugin({ paginate: true })),
  ];
  ```

  This defers module resolution until the shell actually needs each plugin.

- **Phase 3 — Plugin groups**: For brain configs with 20+ plugins, support named groups that can be enabled/disabled:
  ```typescript
  pluginGroups: {
    content: [notePlugin, blogPlugin, decksPlugin],
    publishing: [siteBuilderPlugin, contentPipelinePlugin],
    sync: [directorySyncPlugin, gitSyncPlugin],
  }
  ```

**Estimated effort**: Phase 1 is trivial (config-only change). Phase 2 is medium (requires shell API change + type updates). Phase 3 is aspirational.

---

## 14. Root-Level Artifacts (Trivial, Quick Win) ✅

**Problem**:

- `custom.db` and `custom-jobs.db` (empty files at root) should be gitignored
- `dist/` at root should be gitignored
- These pollute the repo

**Refactor**: Add to `.gitignore`, remove from tracking.

**Estimated effort**: 2 minutes.

---

## 15. Brain Model / Deployment Instance Separation (High Priority, Architectural) ✅

**Problem**: The `apps/` directory conflates two distinct concepts: the **brain model** (what a brain is — its identity, capabilities, content, theme) and the **deployment instance** (how and where a specific copy of that brain runs). There is no way to run multiple instances of the same brain model with different environments, domains, or credentials without forking the entire config.

Each `brain.config.ts` simultaneously:

1. Declares identity and capabilities (model concern)
2. Reads `process.env` and wires infrastructure credentials (instance concern)
3. Instantiates plugins and interfaces with runtime config (instance concern)
4. Calls `handleCLI(config)` to start execution (entry point concern)

**Concrete symptoms**:

- All three brain configs repeat the same MatrixInterface/MCPInterface/WebserverInterface/gitSync boilerplate, differing only in env var names and identity
- Seed content lives alongside runtime config but is part of the brain model
- You can't deploy the same brain to production + staging without forking the config
- There's no way for a UI/CLI to ask "what capabilities does this brain have?" without executing the config
- Deployment config (`domain`, `cdn`, `dns`) is inside `AppConfig` even though it's consumed by separate deploy scripts

**The missing abstraction — brain models vs deployment instances**:

```
Brain Model (reusable template — "what is this brain?")
  ├── identity: { name, character, role, values }
  ├── capabilities: [factory, config] tuples
  ├── interfaces: [factory, env→config] tuples
  ├── theme, layouts, content model
  └── seed content

         ↓  instantiated by

Deployment Instance (environment-specific — "where does it run?")
  ├── environment: { credentials, secrets, domains }
  ├── resolve(model, env) → fresh plugin instances
  └── process lifecycle
```

### Target directory structure

A new `brains/` workspace root for brain models, separate from `apps/` for deployment instances:

```
brains/                              ← brain MODELS (the what)
  professional/
    package.json                     ← @brains/professional
    src/
      index.ts                       ← exports defineBrain(...)
    seed-content/
      brain-character/
      anchor-profile/
      site-info/
      post/
      ...
  collective/
    package.json                     ← @brains/collective
    src/
      index.ts
    seed-content/
      ...
  team/
    package.json                     ← @brains/relay
    src/
      index.ts
    seed-content/
      ...

apps/                                ← deployment INSTANCES (the how/where)
  yeehaa-io/                         ← professional brain → yeehaa.io
    package.json
    brain.config.ts                  ← resolve(@brains/professional, process.env)
    .env
  yeehaa-staging/                    ← professional brain → staging
    package.json
    brain.config.ts                  ← resolve(@brains/professional, process.env)
    .env
  rizom-ai/                          ← collective brain → rizom.ai
    package.json
    brain.config.ts
    .env
  local-dev/                         ← any brain locally
    brain.config.ts
    .env
```

Workspace config adds `brains/*`:

```json
{
  "workspaces": [
    "shell/*",
    "shared/*",
    "plugins/*",
    "interfaces/*",
    "brains/*",
    "apps/*"
  ]
}
```

### The `defineBrain()` API

Lives in `shell/app/`. Brain models use it to declare themselves:

```typescript
// brains/professional/src/index.ts
import { defineBrain } from "@brains/app";
import { systemPlugin } from "@brains/system";
import { notePlugin } from "@brains/note";
import { blogPlugin } from "@brains/blog";
import { decksPlugin } from "@brains/decks";
import { portfolioPlugin } from "@brains/portfolio";
import { topicsPlugin } from "@brains/topics";
import { socialMediaPlugin } from "@brains/social-media";
import { contentPipelinePlugin } from "@brains/content-pipeline";
import { dashboardPlugin } from "@brains/dashboard";
import { wishlistPlugin } from "@brains/wishlist";
import { analyticsPlugin } from "@brains/analytics";
import { siteBuilderPlugin } from "@brains/site-builder-plugin";
import {
  professionalSitePlugin,
  ProfessionalLayout,
  routes,
} from "@brains/professional-site";
import { MCPInterface } from "@brains/mcp";
import { MatrixInterface } from "@brains/matrix";
import { DiscordInterface } from "@brains/discord";
import { WebserverInterface } from "@brains/webserver";
import yeehaaTheme from "@brains/theme-brutalist";

export default defineBrain({
  name: "professional",
  version: "0.1.0",

  // Pure data — the brain's identity
  identity: {
    characterName: "Rover",
    role: "Personal knowledge manager and professional content curator",
    purpose:
      "Help organize thoughts, capture knowledge, and showcase professional work",
    values: [
      "clarity",
      "organization",
      "professionalism",
      "continuous learning",
    ],
  },

  // Capabilities as [factory, config] tuples — NOT instantiated
  // Each resolve() call creates fresh plugin instances from these factories
  capabilities: [
    [systemPlugin, {}],
    [notePlugin, {}],
    [blogPlugin, { paginate: true }],
    [decksPlugin, undefined],
    [portfolioPlugin, {}],
    [topicsPlugin, { includeEntityTypes: ["post", "deck", "project", "link"] }],
    [socialMediaPlugin, { autoGenerateOnBlogPublish: true }],
    [
      contentPipelinePlugin,
      {
        /* generation schedules */
      },
    ],
    [dashboardPlugin, undefined],
    [wishlistPlugin, {}],
    [analyticsPlugin, "FROM_ENV"], // config needs env — resolver handles this
    [siteBuilderPlugin, { routes, theme: yeehaaTheme /* ... */ }],
    [
      professionalSitePlugin,
      {
        /* entityRouteConfig */
      },
    ],
  ],

  // Interfaces as [factory, env→config mapper] tuples
  // The mapper receives the deployment environment and returns interface config
  interfaces: [
    [
      MCPInterface,
      (env) => ({
        domain: env.DOMAIN,
      }),
    ],
    [
      MatrixInterface,
      (env) => ({
        homeserver: env.MATRIX_HOMESERVER || "https://matrix.rizom.ai",
        accessToken: env.MATRIX_ACCESS_TOKEN || "",
        userId: env.MATRIX_USER_ID || "@yeehaa-brain-bot:rizom.ai",
      }),
    ],
    [
      DiscordInterface,
      (env) => ({
        botToken: env.DISCORD_BOT_TOKEN || "",
      }),
    ],
    [
      WebserverInterface,
      (env) => ({
        productionDomain: env.DOMAIN ? `https://${env.DOMAIN}` : undefined,
        previewDomain: env.PREVIEW_DOMAIN
          ? `https://${env.PREVIEW_DOMAIN}`
          : undefined,
      }),
    ],
  ],

  // Content model — pure data
  contentModel: {
    seedContentDir: "./seed-content",
    entityRoutes: {
      post: { label: "Essay" },
      deck: { label: "Presentation" },
      project: { label: "Project" },
      base: { label: "Note", navigation: { show: false } },
      topic: { label: "Topic", navigation: { slot: "secondary" } },
      link: { label: "Link", navigation: { slot: "secondary" } },
    },
  },

  // Permissions — structural, no credentials
  permissions: {
    anchors: ["matrix:@yeehaa:rizom.ai", "discord:1442828818493735015"],
    rules: [
      { pattern: "mcp:stdio", level: "anchor" },
      { pattern: "mcp:http", level: "public" },
      { pattern: "matrix:*", level: "public" },
      { pattern: "discord:*", level: "public" },
    ],
  },
});
```

Key design decisions:

- **Capabilities are `[factory, config]` tuples**, not instantiated plugins. Each `resolve()` call creates fresh instances. Any plugin works — no central registry needed. Fully extensible.
- **Interfaces are `[factory, envMapper]` tuples**. The mapper receives the deployment environment and returns the interface config. This is how credentials stay out of the model.
- **Identity, content model, permissions, theme are pure data**. Inspectable, diffable, serializable.
- **Seed content travels with the brain model**, not the deployment instance.

### The `resolve()` function

Also lives in `shell/app/`. Takes a brain model + environment, produces a fresh `AppConfig`:

```typescript
// shell/app/src/brain-resolver.ts
export function resolve(
  brain: BrainDefinition,
  env: Record<string, string | undefined>,
): AppConfig {
  // Instantiate capabilities — fresh plugin instances every time
  const plugins = brain.capabilities.map(([factory, config]) => {
    if (config === "FROM_ENV") {
      // Plugin needs env-derived config — use a convention or per-plugin env mapper
      return factory(resolveEnvConfig(factory, env));
    }
    return factory(config);
  });

  // Instantiate interfaces — pass env through mapper, skip if required credentials missing
  const interfaces = brain.interfaces
    .map(([factory, envMapper]) => {
      const config = envMapper(env);
      // Optionally skip interfaces with missing credentials
      return new factory(config);
    })
    .filter(Boolean);

  return defineConfig({
    name: brain.name,
    version: brain.version,
    aiApiKey: env.ANTHROPIC_API_KEY,
    openaiApiKey: env.OPENAI_API_KEY,
    googleApiKey: env.GOOGLE_GENERATIVE_AI_API_KEY,
    identity: brain.identity,
    permissions: brain.permissions,
    plugins: [...plugins, ...interfaces],
  });
}
```

### Deployment instances become trivial

```typescript
// apps/yeehaa-io/brain.config.ts
// 4 lines. That's it.
import professional from "@brains/professional";
import { resolve, handleCLI } from "@brains/app";

const config = resolve(professional, process.env);
if (import.meta.main) handleCLI(config);
```

```typescript
// apps/yeehaa-staging/brain.config.ts
// Same brain model, different environment
import professional from "@brains/professional";
import { resolve, handleCLI } from "@brains/app";

const config = resolve(professional, process.env);
if (import.meta.main) handleCLI(config);
```

```typescript
// apps/rizom-ai/brain.config.ts
import collective from "@brains/collective";
import { resolve, handleCLI } from "@brains/app";

const config = resolve(collective, process.env);
if (import.meta.main) handleCLI(config);
```

The only difference between `yeehaa-io` and `yeehaa-staging` is the `.env` file. The code is identical. You could even share a single generic entry point:

```typescript
// apps/generic/brain.config.ts
// Resolve any brain from BRAIN_MODEL env var
const model = await import(process.env.BRAIN_MODEL!);
const config = resolve(model.default, process.env);
if (import.meta.main) handleCLI(config);
```

### What this enables

- **Multi-instance deployment**: same brain model, different envs → different running instances
- **Brain introspection**: import `@brains/professional` and inspect its capabilities, identity, etc. without booting the shell
- **Brain diffing**: compare two brain models structurally ("collective has `products` but not `blog`")
- **Brain templates**: "create a new brain from the professional template" → copy a `brains/` directory
- **Thin deployment targets**: `apps/` entries become 4-line files + `.env`
- **Seed content belongs to the model**: moves from `apps/*/seed-content/` to `brains/*/seed-content/`
- **Deploy scripts simplify**: they read the brain model for structural config (domain, CDN) and the env for credentials
- **Testing**: test a brain model by resolving it with a test environment — no real credentials needed
- **Future: brain marketplace/sharing**: brain models are self-contained packages

### Migration path

Fully backward-compatible:

1. `defineConfig()` continues to work — existing `brain.config.ts` files don't break
2. Create `brains/` workspace root, add to `package.json` workspaces
3. Migrate `team-brain` first (simplest — fewest plugins)
   - Move model to `brains/team/`, seed-content included
   - Rewrite `apps/team-brain/` as thin resolver entry point
   - Verify everything still works
4. Migrate `collective-brain`, then `professional-brain`
5. Old `apps/` naming can be updated to deployment-target names (optional)

### New files in `shell/app/`

```
shell/app/src/
  brain-definition.ts     ← defineBrain() helper + BrainDefinition type
  brain-resolver.ts       ← resolve(model, env) → AppConfig
  app.ts                  ← existing (unchanged)
  config.ts               ← existing defineConfig (kept for backward compat)
  types.ts                ← existing AppConfig (target of resolve())
```

**Estimated effort**: Medium-High. The `defineBrain()` type and `resolve()` function are straightforward. The real work is migrating each brain's config, moving seed-content, and updating deploy scripts to find things in the new locations. But each brain can be migrated independently.

---

## Suggested Execution Order

| Phase                          | Items                                                 | Rationale                                                                                                   |
| ------------------------------ | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **Phase 0** (Quick Wins)       | #3, #12, #14                                          | Zero-risk cleanup, build confidence — ✅ Done                                                               |
| **Phase 1** (Brain Model)      | #15 (`defineBrain` + `resolve` + migrate team-brain)  | Establish the model/instance split; create `brains/` workspace — ✅ Done                                    |
| **Phase 2** (Brain Migration)  | #15 (migrate remaining brains, update deploy scripts) | Complete the separation; apps become 4-line entry points — ✅ Done                                          |
| **Phase 3** (Foundation)       | #8, #9                                                | #9 ✅ Done, #8 skipped (low impact — linear startup code, rarely changed)                                   |
| **Phase 4** (Plugin Framework) | #1, #5, #6                                            | #5 ✅ Done, #1 and #6 remaining                                                                             |
| **Phase 5** (Architecture)     | #2, #4, #13                                           | Cross-plugin deps, themes, lazy loading (interface factories from #15 enable conditional loading naturally) |
| **Phase 6** (Quality)          | #11, #7                                               | Integration tests validate brain models as data; mock shell cleanup                                         |
| **Phase 7** (Polish)           | #10                                                   | Interface cleanup                                                                                           |

**Why #15 is Phase 1**: The `defineBrain()` type and `resolve()` function are additive — they produce the same `AppConfig` that `defineConfig` already expects. Existing brain configs continue to work untouched. Migrating team-brain first (fewest plugins) proves the pattern with minimal risk. The `brains/` workspace root is just a new directory + one line in `package.json` workspaces. Once the model/instance split exists, lazy loading (#13) comes naturally through the interface env-mappers, and integration tests (#11) can validate brain models without booting real services.

---

## What Should NOT Be Refactored

- **The plugin architecture itself** — it's genuinely well-designed. The `CorePlugin` / `ServicePlugin` / `InterfacePlugin` hierarchy is clean.
- **The singleton + `createFresh` + `resetInstance` pattern** — it's consistent, testable, and documented.
- **The Turborepo workspace structure** — the `shell/` / `plugins/` / `shared/` / `interfaces/` / `apps/` layout is logical and scales.
- **Individual plugin business logic** — the adapters, schemas, and handlers are well-structured within each plugin. The refactoring is about _shared patterns_, not individual implementations.
- **The test-utils package** — it's already well-factored with typed mock factories. Just extend it (#7).
