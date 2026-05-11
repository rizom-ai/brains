# Plan: Memory Reduction — Registries, Templates & Eager Loading

## Status

Proposed. Needs a fresh profile before implementation — some quick wins have already happened (e.g. the old hydration path was removed), so treat the phase list as a candidate checklist rather than current measurements.

## Context

The app uses ~860MB at runtime. The user identified templates-in-memory and the proliferation of registries as likely contributors. Exploration confirmed:

- **14 registries**, all singleton, all populated eagerly at startup, none with eviction
- **~30 templates** in `TemplateRegistry` — including a 735KB compiled hydration JS string on the dashboard template (bloated by bundled Zod)
- **15 plugins** all loaded eagerly — no code splitting, no lazy imports
- **25+ singleton services** created at startup in `shellInitializer.ts`, never freed
- **3 SQLite connections** opened at startup (entity, job queue, conversation)
- **AI SDK + 3 providers** (Anthropic, OpenAI, Google) all imported eagerly even though most brains only use Anthropic
- **Zod schemas** (~510KB total) are negligible — not worth optimizing
- **Embedding model** is already deferred enough that it is not the first optimization target

Registry data itself is small (~150KB-3.5MB). The real cost is the code loaded to support all these registries, plugins, and services.

---

## Phase 0: Profile Before Optimizing (1-2 days)

Add `process.memoryUsage()` logging at startup milestones to establish baselines.

**Files to modify:**

- `shell/core/src/initialization/shellInitializer.ts` — log after `initializeServices()` (line 224) and after `initializeAll()`
- `shell/core/src/initialization/shellBootloader.ts` — log after `SYSTEM_CHANNELS.pluginsRegistered` emission and after ready hooks

**Also create a standalone script** that measures per-import cost:

```typescript
// scripts/measure-imports.ts
const before = process.memoryUsage();
await import("ai");
// await import("@ai-sdk/openai");
// await import("@ai-sdk/google");
const after = process.memoryUsage();
```

**Expected outcome:** A profile showing cost of (a) base runtime, (b) service creation, (c) plugin loading, (d) AI SDK imports, (e) idle state.

---

## Phase 1: Quick Wins (1 day)

### 1A. Lazy-load OpenAI and Google AI providers

**File:** `shell/ai-service/src/provider-clients.ts`

Currently eager-imports `@ai-sdk/anthropic`, `@ai-sdk/openai`, and `@ai-sdk/google` at module load. Keep Anthropic eager (always used). Convert OpenAI + Google to dynamic `await import()` inside `createProviderClients()` so they're only parsed when an API key for that provider is present. Image generation in `image-generation.ts` and embeddings in `online-embedding-provider.ts` already go through this factory, so they pick up the laziness automatically.

```typescript
// Replace static imports of openai + google with lazy getters inside the factory:
async function getOpenAI(apiKey: string) {
  const { createOpenAI } = await import("@ai-sdk/openai");
  return createOpenAI({ apiKey });
}
```

**Expected savings:** 5-15MB (two SDK modules + their transitive deps not parsed by V8/JSC).

### 1B. Hydration pipeline removed

The old hydration path was removed instead of optimized. See `docs/hydration-pattern.md` for the retired approach and recovery notes.

---

## Phase 2: Registry Optimization (2-3 days)

### 2A. Clear registries on shutdown

**Files:**

- `shell/core/src/shell.ts` — in `shutdown()` method (line 238+)
- All registries that have or need a `clear()` method

When `Shell.shutdown()` is called, clear all registries and null singleton references. Prevents memory leaks in test suites and long-running processes.

### 2B. Evict plugin templates on disable

**Files:**

- `shell/plugins/src/manager/plugin-lifecycle.ts` — in `disablePlugin()`
- `shell/templates/src/registry.ts` (has `unregister()` and `getPluginTemplateNames()`)

When a plugin is disabled, unregister its templates:

```typescript
const names = templateRegistry.getPluginTemplateNames(pluginId);
for (const name of names) templateRegistry.unregister(name);
```

### 2C. Template metadata/payload separation (optional, larger effort)

**Files:**

- `shell/templates/src/types.ts` — split `Template` interface
- `shell/templates/src/registry.ts` — store lightweight metadata, load heavy content lazily

Split templates into lightweight metadata (name, description, permission, dataSourceId) stored eagerly, and heavy payload (schema, layout component, formatter, basePrompt) loaded on demand. This is the most impactful registry change but also the most invasive — it touches the `Template` interface used by all 16 entity plugins.

**Defer to Phase 2 if Phase 0 profiling shows templates aren't a top consumer.**

---

## Phase 3: Plugin & Service Loading (3-5 days)

### 3A. Lazy AI SDK core import

**File:** `shell/ai-service/src/aiService.ts` (line 1)

`import { generateText, generateObject, generateImage } from "ai"` loads the entire Vercel AI SDK at module load. Convert to dynamic imports inside each method — Bun caches dynamic imports so cost is paid once:

```typescript
async query(systemPrompt, userPrompt) {
  const { generateText } = await import("ai");
  // ...
}
```

**Expected savings:** 10-20MB if no AI operations triggered yet.

### 3B. Deferred service initialization

**File:** `shell/core/src/initialization/shellInitializer.ts` (lines 224-420)

Several services created eagerly at line 224+ are not needed until runtime events:

- `ConversationService` — only needed when chat starts
- `AgentService` — only needed for agent conversations
- `BatchJobManager` + `JobProgressMonitor` — only needed for batch operations
- `BrainCharacterService` + `AnchorProfileService` — currently initialized during `ShellBootloader` ready-state preparation; any future laziness must preserve the guarantee that identity/profile are ready before plugin `onReady`

Use a lazy proxy pattern:

```typescript
class LazyService<T> {
  private instance: T | null = null;
  constructor(private factory: () => T) {}
  get(): T {
    return (this.instance ??= this.factory());
  }
}
```

**Must keep eager:** `entityService`, `entityRegistry`, `messageBus`, `templateRegistry`, `pluginManager`, `mcpService` (needed during plugin init).

**Expected savings:** 30-80MB (deferred DB connection for conversations, deferred xstate/agent machinery).

### 3C. Conditional plugin module loading

**Files:**

- `shell/app/src/brain-definition.ts` — change `PluginFactory` to support async
- `shell/app/src/brain-resolver.ts` — `await` factory calls
- Brain definition files (e.g., `brains/rover/src/index.ts`)

Convert plugin factories to async so unused plugins aren't even imported:

```typescript
capabilities: [
  [
    "blog",
    async () => {
      const { blogPlugin } = await import("@brains/blog");
      return blogPlugin();
    },
  ],
];
```

**Expected savings:** 20-60MB for minimal presets (skipping ~17 unused plugin module trees).

---

## Phase 4: Structural (5-10 days, deferred)

These are larger changes to consider only after Phases 0-3 are done:

- **4A. Lazy database connections** — `ConversationService` DB deferred until first chat
- **4B. Worker isolation for site builds** — run Preact SSR in a `new Worker()`, free memory when done
- **4C. Entity content streaming** — add `includeContent: false` option to list/search queries

---

## Verification

After each phase:

1. Run `process.memoryUsage()` at the same checkpoints as Phase 0
2. Run `bun run typecheck` and `bun test`
3. Run a site build to verify templates/hydration still work
4. Compare RSS before/after with `ps aux | grep bun`

## Execution Order

```
Phase 0 (profile)
  ↓
Phase 1A (lazy OpenAI/Google providers — quick win)
  ↓
Phase 3A (lazy AI SDK — easy, high impact)
  ↓
Phase 2A + 2B (registry cleanup — easy)
  ↓
Phase 3B (deferred services — medium effort, high impact)
  ↓
Phase 3C (conditional plugins — medium effort)
  ↓
Phase 2C (template split — only if profiling justifies it)
  ↓
Phase 4 (structural — only if target not met)
```

**Estimated total savings: 100-300MB** (from ~860MB to ~560-760MB), with Phase 4 potentially bringing it under 500MB.
