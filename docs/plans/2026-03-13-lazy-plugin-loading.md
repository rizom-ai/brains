# Lazy Plugin & Interface Loading (#13)

## Problem

Rover brain takes **1540ms** to import. Every interface module is eagerly loaded regardless of whether credentials exist:

| Module              | Import time | Has heavy SDK?         |
| ------------------- | ----------- | ---------------------- |
| `@brains/discord`   | 638ms       | discord.js (3MB)       |
| `@brains/matrix`    | 849ms       | matrix-bot-sdk (2.4MB) |
| `@brains/mcp`       | 596ms       | MCP SDK                |
| `@brains/webserver` | 414ms       | Hono                   |

All four interfaces are imported at the top of `brains/rover/src/index.ts` as static imports. Even when `MATRIX_ACCESS_TOKEN` and `DISCORD_BOT_TOKEN` are empty strings, both SDKs are fully loaded into memory.

**Current behavior**: Matrix and Discord validate credentials only in `onRegister()` — they throw _after_ the full module tree has been loaded and the constructor has run.

## Scope

Three phases, each independently shippable:

### Phase 1: Conditional interface instantiation (this PR)

**What**: Allow `envMapper` to return `null` to signal "skip this interface". The resolver already has the pattern (`resolvePlugin` returns `null` for disabled plugins).

**Changes**:

1. **`shell/app/src/brain-definition.ts`** — Widen `InterfaceEntry` envMapper return type:

   ```ts
   export type InterfaceEntry = [
     constructor: InterfaceConstructor,
     envMapper: (env: BrainEnvironment) => PluginConfig | null,
   ];
   ```

2. **`shell/app/src/brain-resolver.ts`** — Skip null configs:

   ```ts
   for (const [ctor, envMapper] of definition.interfaces) {
     const baseConfig = envMapper(env);
     if (!baseConfig) continue; // envMapper opted out
     // ... rest unchanged
   }
   ```

3. **`brains/rover/src/index.ts`** (and relay, ranger) — Return null when credentials missing:
   ```ts
   [MatrixInterface, (env) =>
     env["MATRIX_ACCESS_TOKEN"]
       ? { accessToken: env["MATRIX_ACCESS_TOKEN"] }
       : null
   ],
   [DiscordInterface, (env) =>
     env["DISCORD_BOT_TOKEN"]
       ? { botToken: env["DISCORD_BOT_TOKEN"] }
       : null
   ],
   ```

**Impact**: No interface constructor runs, no `onRegister()` throws. But the static `import` still loads the SDK — no startup time improvement yet.

**Effort**: ~15 minutes. Type change + 2-line resolver change + brain config updates.

### Phase 2: Dynamic imports for interfaces (deferred)

**What**: Replace static imports with dynamic `import()` so SDKs aren't loaded when not needed.

**Changes**:

1. **`shell/app/src/brain-definition.ts`** — Add lazy interface entry type:

   ```ts
   export type LazyInterfaceEntry = [
     loader: () => Promise<InterfaceConstructor>,
     envMapper: (env: BrainEnvironment) => PluginConfig | null,
   ];

   // InterfaceEntry becomes a union
   export type InterfaceEntry = EagerInterfaceEntry | LazyInterfaceEntry;
   ```

2. **`shell/app/src/brain-resolver.ts`** — Resolve lazy loaders:

   ```ts
   for (const [ctorOrLoader, envMapper] of definition.interfaces) {
     const baseConfig = envMapper(env);
     if (!baseConfig) continue;

     const ctor =
       typeof ctorOrLoader === "function" && !ctorOrLoader.prototype
         ? await ctorOrLoader() // lazy loader
         : ctorOrLoader; // eager constructor
     // ...
   }
   ```

3. **`brains/rover/src/index.ts`** — Dynamic imports:

   ```ts
   // Remove: import { MatrixInterface } from "@brains/matrix";
   // Remove: import { DiscordInterface } from "@brains/discord";

   interfaces: [
     [
       () => import("@brains/matrix").then((m) => m.MatrixInterface),
       (env) =>
         env["MATRIX_ACCESS_TOKEN"]
           ? { accessToken: env["MATRIX_ACCESS_TOKEN"] }
           : null,
     ],
     [
       () => import("@brains/discord").then((m) => m.DiscordInterface),
       (env) =>
         env["DISCORD_BOT_TOKEN"]
           ? { botToken: env["DISCORD_BOT_TOKEN"] }
           : null,
     ],
   ];
   ```

**Impact**: When credentials are missing, the SDK modules are never loaded. Potential saving: **~1500ms** on cold start when both Matrix and Discord are unconfigured.

**Effort**: Medium. Type changes, resolver becomes async (it may already be called in async context — need to verify), brain config updates.

**Risk**: `resolve()` is currently synchronous. Making it async ripples to callers. Need to check `handleCLI()` and `App.create()`.

## Recommendation

**Ship Phase 1 now** — it's trivial, prevents the `onRegister()` throw, and sets up the `null` return convention that Phase 2 builds on.

**Phase 2 later** — when startup time actually matters (serverless deployment, CLI responsiveness). It's a clean extension of Phase 1.

## Files Changed (Phase 1)

| File                                | Change                                                |
| ----------------------------------- | ----------------------------------------------------- |
| `shell/app/src/brain-definition.ts` | Widen envMapper return type to `PluginConfig \| null` |
| `shell/app/src/brain-resolver.ts`   | Add `if (!baseConfig) continue`                       |
| `brains/rover/src/index.ts`         | Return null for Matrix/Discord when no token          |
| `brains/relay/src/index.ts`         | Return null for Matrix when no token                  |
| `brains/ranger/src/index.ts`        | Return null for Matrix/Discord when no token          |
