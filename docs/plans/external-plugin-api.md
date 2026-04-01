# Plan: External Plugin API

## Context

The internal plugin framework is mature — 15 plugins across three types (EntityPlugin, ServicePlugin, InterfacePlugin), clean sibling contexts, type-safe tool system, comprehensive test harness. But it's only consumable within the monorepo via `@brains/plugins`. External developers can't build plugins yet because:

1. `@rizom/brain` only exports the CLI binary, not the plugin API
2. No TypeScript declarations for plugin authors
3. No runtime loading of plugins from `node_modules`
4. No API version contract — no way to detect compatibility
5. No example external plugin to validate the DX

This plan makes the plugin API public and enables a plugin ecosystem.

## What exists

**Plugin base classes** (`shell/plugins/src/index.ts`, 257 lines of exports):

- `EntityPlugin`, `ServicePlugin`, `InterfacePlugin` base classes
- Context types: `EntityPluginContext`, `ServicePluginContext`, `InterfacePluginContext`
- Tool system: `createTool`, `toolSuccess`, `toolError`, `ToolResult`
- Entity system: `BaseEntityAdapter`, `baseEntitySchema`, `BaseEntityDataSource`, `BaseGenerationJobHandler`
- Templates: `createTemplate`, `Template`, `ViewTemplate`
- Messaging: `IMessageBus`, `MessageResponse`
- Routing: `RouteDefinition`, `NavigationItem`
- Utilities: `createId`, `basePluginConfigSchema`
- Schemas: Zod-based validation throughout

**Plugin anatomy** (from npm-packages plan):

```typescript
import { ServicePlugin, createTool, z } from "@rizom/brain";

export const calendarPlugin = ServicePlugin.create({
  id: "calendar",
  tools: [...],
});
```

**brain.yaml plugin declaration** (target UX):

```yaml
brain: rover
plugins:
  - @rizom/brain-plugin-calendar
  - @rizom/brain-plugin-stripe:
      apiKey: "${STRIPE_API_KEY}"
```

---

## Phase 1: Library exports from `@rizom/brain`

### 1A. Barrel export file

Create `packages/brain-cli/src/lib.ts` that re-exports from `@brains/plugins` and `@brains/utils`:

```typescript
// Plugin base classes
export { EntityPlugin, ServicePlugin, InterfacePlugin } from "@brains/plugins";

// Context types (read-only view for plugin authors)
export type {
  EntityPluginContext,
  ServicePluginContext,
  InterfacePluginContext,
  BasePluginContext,
} from "@brains/plugins";

// Tool system
export {
  createTool,
  toolSuccess,
  toolError,
  toolResultSchema,
} from "@brains/plugins";
export type {
  Tool,
  ToolResult,
  ToolResponse,
  ToolContext,
} from "@brains/plugins";

// Entity system
export {
  BaseEntityAdapter,
  baseEntitySchema,
  BaseEntityDataSource,
  BaseGenerationJobHandler,
} from "@brains/plugins";
export type {
  BaseEntity,
  EntityAdapter,
  EntityTypeConfig,
  DataSource,
} from "@brains/plugins";

// Templates
export { createTemplate } from "@brains/plugins";
export type { Template, ViewTemplate } from "@brains/plugins";

// Messaging
export type { IMessageBus, MessageResponse } from "@brains/plugins";

// Config
export { basePluginConfigSchema } from "@brains/plugins";

// Utilities
export { createId } from "@brains/plugins";
export { z } from "@brains/utils";
export type { Logger, ProgressReporter } from "@brains/utils";
```

This is a curated subset — not everything from `shell/plugins/src/index.ts` belongs in the public API. Internal types like `PluginManager`, `IShell`, `IDaemonRegistry` stay internal.

**Files:** `packages/brain-cli/src/lib.ts`

### 1B. Dual build target

Update `packages/brain-cli/scripts/build.ts` to produce two outputs:

```typescript
// Existing: CLI executable
await Bun.build({ entrypoints: ["scripts/entrypoint.ts"], ... });

// New: library for plugin authors
await Bun.build({
  entrypoints: ["src/lib.ts"],
  outdir, naming: "index.js",
  target: "bun", format: "esm",
  minify: false, // readable for debugging
  external: [...], // same native externals
});
```

**Files:** `packages/brain-cli/scripts/build.ts`

### 1C. TypeScript declarations

Generate `.d.ts` files for the library export:

```bash
tsc --emitDeclarationOnly --declaration --outDir dist/types src/lib.ts
```

Add to build script as a post-build step. This gives plugin authors full IDE support (autocomplete, type checking, go-to-definition).

**Files:** `packages/brain-cli/scripts/build.ts`, `packages/brain-cli/tsconfig.build.json` (new, for declaration emit only)

### 1D. Update package.json exports

```json
{
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/types/lib.d.ts"
    },
    "./cli": "./dist/brain.js"
  }
}
```

Plugin authors: `import { EntityPlugin } from "@rizom/brain"`
CLI users: `brain start` (unchanged)

**Files:** `packages/brain-cli/package.json`

---

## Phase 2: Plugin loading from brain.yaml

### 2A. YAML plugin resolution

When `brain.yaml` has a `plugins:` section, resolve each entry from `node_modules` at runtime:

```typescript
// In brain-resolver.ts or a new plugin-loader.ts
for (const entry of config.plugins) {
  const [name, pluginConfig] =
    typeof entry === "string" ? [entry, {}] : Object.entries(entry)[0];

  const mod = await import(name); // resolves from node_modules
  const factory = mod.default ?? mod[Object.keys(mod)[0]];
  const plugin = factory(interpolateEnvVars(pluginConfig));
  plugins.push(...(Array.isArray(plugin) ? plugin : [plugin]));
}
```

Key: the bundled `dist/brain.js` uses `await import(name)` which Bun resolves from the instance's `node_modules/`, not from the bundle.

**Files:** `shell/app/src/brain-resolver.ts` (or new `shell/app/src/plugin-loader.ts`)

### 2B. Auto-install on `brain start`

If `brain.yaml` declares plugins but `node_modules` doesn't have them, prompt or auto-install:

```
$ brain start
Missing plugin: @rizom/brain-plugin-calendar
Run 'brain add @rizom/brain-plugin-calendar' or 'bun add @rizom/brain-plugin-calendar'
```

Or with `--install` flag: auto-run `bun add` for missing plugins.

**Files:** `packages/brain-cli/src/commands/start.ts`

### 2C. Env var interpolation in plugin config

brain.yaml plugin configs support `${ENV_VAR}` interpolation:

```yaml
plugins:
  - @rizom/brain-plugin-stripe:
      apiKey: "${STRIPE_API_KEY}"
```

This already works for brain model config overrides — extend the same pattern to external plugins.

**Files:** `shell/app/src/brain-resolver.ts`

---

## Phase 3: API version contract

### 3A. Plugin API version field

Add `apiVersion` to `@rizom/brain` package exports:

```typescript
// packages/brain-cli/src/lib.ts
export const PLUGIN_API_VERSION = "1";
```

Plugin authors declare compatibility in their package.json:

```json
{
  "peerDependencies": {
    "@rizom/brain": "^0.1.0"
  },
  "brain": {
    "apiVersion": "1"
  }
}
```

### 3B. Compatibility check at load time

When loading an external plugin, check the `brain.apiVersion` field in its package.json against the current API version. Warn (not error) on mismatch — this gives plugin authors time to update without breaking users.

```typescript
const pluginPkg = require.resolve(`${name}/package.json`);
const { brain } = JSON.parse(readFileSync(pluginPkg, "utf-8"));
if (brain?.apiVersion && brain.apiVersion !== PLUGIN_API_VERSION) {
  logger.warn(
    `Plugin ${name} targets API v${brain.apiVersion}, running v${PLUGIN_API_VERSION}`,
  );
}
```

### 3C. Stability commitment

Once the API is published:

- **Major version bumps** (`PLUGIN_API_VERSION` 1 → 2) only when breaking changes happen
- Breaking changes documented in CHANGELOG with migration guide
- Minimum 1 release cycle deprecation period before removal

---

## Phase 4: Discovery and CLI tooling

### 4A. `brain search`

Search npm for packages matching the `brain-plugin-*` or `@*/brain-plugin-*` convention:

```bash
brain search calendar
# → @rizom/brain-plugin-calendar  Calendar events and scheduling
# → @community/brain-plugin-gcal  Google Calendar sync
```

Uses the npm registry search API.

### 4B. `brain add`

Install plugin + add to brain.yaml:

```bash
brain add @rizom/brain-plugin-calendar
```

1. Creates `package.json` if it doesn't exist
2. `bun add @rizom/brain-plugin-calendar`
3. Appends to `plugins:` in `brain.yaml`

### 4C. `brain remove`

Reverse of add: remove from brain.yaml + `bun remove`.

---

## Phase 5: Example plugin + documentation

### 5A. Reference external plugin

Create `@rizom/brain-plugin-example` as a separate repo (not in the monorepo) that demonstrates:

- EntityPlugin with schema, adapter, generation handler
- ServicePlugin with tools
- Composite factory returning both
- Config with env var interpolation
- Tests using `createPluginHarness`
- Proper package.json with `peerDependencies` and `brain.apiVersion`

This validates the full external DX end-to-end.

### 5B. Plugin author guide

Documentation covering:

- Plugin types and when to use each
- Setting up a plugin project (`bun init`, `bun add -D @rizom/brain`)
- Defining entity schemas and adapters
- Creating tools with `createTool`
- Testing with `createPluginHarness`
- Publishing to npm
- brain.yaml integration

---

## What this does NOT cover

- **Plugin marketplace/registry** — npm is the registry, no custom infrastructure
- **Plugin sandboxing** — plugins run in the same process with full access (trust model)
- **Hot reload** — plugins load at startup, restart required for changes
- **Plugin-to-plugin dependencies** — declared but not validated yet (future work)
- **Composite plugins** — separate plan ([composite-plugins.md](./composite-plugins.md)), complements this

---

## Public API surface (what gets exported)

| Exported                                     | Internal                                |
| -------------------------------------------- | --------------------------------------- |
| EntityPlugin, ServicePlugin, InterfacePlugin | PluginManager, PluginLifecycle          |
| Context types (read-only views)              | Context factories, dependency injection |
| createTool, toolSuccess, toolError           | Tool registry, MCP transport            |
| z, Logger, ProgressReporter                  | Full @brains/utils internals            |
| BaseEntityAdapter, baseEntitySchema          | EntityService internals, DB layer       |
| createTemplate, Template                     | TemplateRegistry, RenderService         |
| IMessageBus (types only)                     | MessageBus implementation               |
| BaseGenerationJobHandler                     | JobQueueService, worker internals       |
| RouteDefinition, NavigationItem              | RouteRegistry, site builder internals   |
| basePluginConfigSchema, createId             | Shell, App, initialization              |

This is a contract. Shell internals can change without breaking external plugins as long as the contract holds.

---

## Summary

| Phase | What                                 | Effort   | Depends on      |
| ----- | ------------------------------------ | -------- | --------------- |
| 1     | Library exports + .d.ts + dual build | 2-3 days | v0.1.0 released |
| 2     | Plugin loading from brain.yaml       | 2-3 days | Phase 1         |
| 3     | API version contract                 | 1 day    | Phase 1         |
| 4     | brain search/add/remove CLI          | 2-3 days | Phase 2         |
| 5     | Example plugin + docs                | 2-3 days | Phase 1-3       |

**Total:** ~2 weeks of focused work, starting after v0.1.0.
