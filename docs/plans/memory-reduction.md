# Plan: Memory Reduction — Registries, Templates & Eager Loading

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

### 1A. Externalize Zod from hydration bundles

**File:** `scripts/compile-hydration.ts` (line 34)

Current `external` list only has Preact + crypto. Add `@brains/utils`, `zod`, and all `@brains/ui-library` internals so Zod doesn't get bundled into the 735KB hydration script. Also enable `minify: true`.

**Expected savings:** Dashboard hydration string drops from 735KB to ~50-100KB.

### 1B. Lazy-load OpenAI and Google AI providers

**File:** `shell/ai-service/src/aiService.ts` (lines 1-4, 69-84)

Keep `@ai-sdk/anthropic` eager (always used). Convert OpenAI + Google to dynamic `await import()` in their respective `generateImageWith*` methods. The providers are only needed for image generation and only if API keys are set.

```typescript
// Lines 2-4: Remove static imports of openai + google
// Lines 74-84: Replace eager provider creation with lazy getters
private async getOpenAIProvider() {
  if (!this._openai && this.config.openaiApiKey) {
    const { createOpenAI } = await import("@ai-sdk/openai");
    this._openai = createOpenAI({ apiKey: this.config.openaiApiKey });
  }
  return this._openai;
}
```

**Expected savings:** 5-15MB (two SDK modules + their transitive deps not parsed by V8/JSC).

### 1C. Hydration pipeline removed

The old hydration path was removed instead of optimized.

See `docs/hydration-pattern.md` for the retired approach and recovery notes.

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
Phase 1A + 1B + 1C (parallel, quick wins)
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

---

## Production observation (2026-04-30)

After deploying alpha.46 (which fixed an unbounded `Promise.all` in skill replace-all that was OOM-looping yeehaa.io), steady-state RSS across two brains:

| Brain | Entities (rough) | Resident | per-entity overhead |
| --- | --- | --- | --- |
| mylittlephoney | ~30-50 | 363 MB | ~7-12 MB |
| yeehaa.io | ~270 | 1.04-1.61 GB | ~4 MB |

**Implication:** the current plan targets the ~860MB baseline (registries, templates, eager plugins, AI SDK). It does **not** address the dataset-proportional component. With the rough fit `RSS ≈ 200-300 MB baseline + ~3 MB/entity`, scaling to 1000 entities projects ~3 GB; to 5000 entities, ~15 GB. Steady-state alone exceeds the 7.6 GB Hetzner box well before 5000 entities.

The bigger risk is non-steady-state spikes that scale with N:

- **Cold-start initial sync** — alpha.46 backpressured the skill `Promise.all`, but allocation during bulk import still tracks dataset size.
- **Bulk re-derivations / replace-all paths** — even with sequential `for...of`, holding all reconstructed entities in scope during the loop is a large transient.
- **Vector index hydration** during embedding store events — working set scales with library size.
- **FTS reindex** during bulk entity writes — temp buffers grow with batch size.

---

## Phase 5: Dataset-proportional growth (proposed)

Out of scope of the original plan. Add explicit budget for per-N operations.

### 5A. Audit and bound large-N entity loops

**Goal:** no init/sync/derivation path holds more than O(batch) entities in memory at once.

**Files to survey:** anywhere that does `entityService.listEntities("type")` followed by a loop. Known sites include `entities/agent-discovery/src/lib/skill-deriver.ts` (alpha.46 made deletes sequential — good, but creates still loop over the full LLM-returned skill list); the topics initial extraction batch (45 entities → single LLM call → response held in memory); any `replaceAll*` in the entity plugins.

**Pattern:** stream via `for await` over a paginated cursor (add to entity-service if missing), or chunk into fixed-size batches. Avoid materializing the full result array.

### 5B. Default `includeContent: false` for non-content paths

Promote Phase 4C from "deferred" to actionable. Many sync/derivation paths only need entity metadata + id, not the markdown body. Add the option to `listEntities` / `searchEntities`, and audit call sites to pass it where content isn't read.

**Expected savings:** for a brain with 1000 entities × avg 5 KB content, this saves ~5 MB per traversal. Cumulative across concurrent loops, much more.

### 5C. Vector and FTS write batching

Bulk embedding inserts and FTS index updates should commit in chunks (e.g., 50 at a time) with explicit allocation release between chunks, rather than one large transaction holding all temp buffers.

### 5D. Memory budget assertions in tests

Add a test that builds a brain with N synthetic entities (e.g., 500, 1000) and asserts steady-state RSS stays under a threshold per entity. Catches regressions before they hit prod.

**Expected savings:** the goal isn't a fixed MB number; it's bounding the *slope* of `MB per entity` to a known constant, ideally well under 1 MB/entity steady-state and under a defined transient ceiling during sync/derivation.
