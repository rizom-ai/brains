# MockShell Cleanup (#7)

## Problem

`shell/plugins/src/test/mock-shell.ts` is 667 lines manually implementing the entire `IShell` interface (71 methods/properties). Every time `IShell` gains a method, `MockShell` breaks. It's the #1 most painful file when the shell interface evolves.

## Current Usage

31 test files import `MockShell` across shell/ and plugins/. Two import paths:

- **Direct**: `from "../../src/test/mock-shell"` (3 files in shell/plugins/test/)
- **Via barrel**: `from "@brains/plugins/test"` (all plugin tests)

The `PluginTestHarness` in `shell/plugins/src/test/harness.ts` also wraps MockShell.

## Key Insight: Stateful Message Bus is Critical

The MockShell's message bus is **stateful** — plugins subscribe during `register()`, then tests call `messageBus.send()` which dispatches to those handlers. This is used extensively:

- Content pipeline tests send publish messages
- Analytics tests send `system:plugins:ready`
- Plugin registration wires up message handlers

A simple stateless mock (like `createMockMessageBus()` in test-utils) would break all of these.

## What Tests Actually Use

Method usage frequency across test files:

- `getMessageBus()` — 64 calls (most common, stateful dispatch needed)
- `createFresh()` — 35 calls (static factory)
- `getEntityService()` — 13 calls (stateful entity store needed)
- `addEntities()` — 9 calls (test helper, not on IShell)
- `registerPlugin()` — 5 calls (test helper)
- `setAgentService()` — 3 calls (test helper, used by matrix/discord interface tests)
- `getDaemonRegistry()` — 3 calls (test helper, used by pluginManager tests)
- `getTemplates()` — 1 call (test helper)

Tests also **reassign methods** directly: `mockShell.registerPluginTools = mock(...)` — so the object must have mutable properties (plain object, not frozen).

## Approach

Replace class with `createMockShell()` factory in `@brains/test-utils`:

```ts
export interface MockShell extends IShell {
  // Test helpers (not on IShell)
  addEntities(entities: BaseEntity[]): void;
  clearEntities(): void;
  registerPlugin(plugin: Plugin): void;
  addPlugin(plugin: Plugin): void;
  getPlugin(pluginId: string): Plugin | undefined;
  getTemplates(): Map<string, Template>;
  setAgentService(agentService: IAgentService): void;
  getDaemonRegistry(): IDaemonRegistry;
}

export function createMockShell(options?: MockShellOptions): MockShell;
```

Key design decisions:

- Returns a **plain object** (not a class instance) — methods can be reassigned
- **Stateful** message bus, entity store, template store, datasource store — backed by Maps
- `MockShell` is an **interface** extending `IShell` — type-safe test helpers
- `createMockShell.createFresh = createMockShell` for backward compat with `MockShell.createFresh()`

## Import Resolution Issue

The `Daemon` and `IDaemonRegistry` types need to be importable. Currently they come from:

```ts
import type { Daemon, IDaemonRegistry } from "../manager/daemon-types";
```

This is a relative import within `@brains/plugins`. For `@brains/test-utils` to use them, they need to be exported from `@brains/plugins` (check if they already are via the barrel, or add an export path).

## Migration Plan

### Step 1: Create factory in test-utils

- `shared/test-utils/src/mock-shell.ts` — ~350 lines (started, needs daemon type import fix)
- Export from `shared/test-utils/src/index.ts`

### Step 2: Bridge the old location

- `shell/plugins/src/test/mock-shell.ts` → re-export `createMockShell` and `MockShell` from `@brains/test-utils`
- `shell/plugins/test.ts` → re-export the same
- This keeps all existing imports working

### Step 3: Update harness

- `shell/plugins/src/test/harness.ts` — use `createMockShell()` instead of `new MockShell()`
- Return type stays `MockShell` (the interface)

### Step 4: Migrate test files (mechanical)

27 files, mostly:

```diff
- const mockShell = MockShell.createFresh({ logger });
+ const mockShell = createMockShell({ logger });
```

### Step 5: Delete old class

- Remove `shell/plugins/src/test/mock-shell.ts` (the class)
- Update barrel exports

## Estimated Effort

- Factory function: done (needs daemon type import fix)
- Bridge + harness: ~30 min
- Test migration: ~1 hour (mechanical, but 27 files need verification)
- Total: ~2 hours

## Files Changed

| File                                   | Change                                  |
| -------------------------------------- | --------------------------------------- |
| `shared/test-utils/src/mock-shell.ts`  | New factory (started)                   |
| `shared/test-utils/src/index.ts`       | Export `createMockShell`, `MockShell`   |
| `shell/plugins/src/test/mock-shell.ts` | Re-export from test-utils → then delete |
| `shell/plugins/src/test/harness.ts`    | Use `createMockShell()`                 |
| `shell/plugins/test.ts`                | Re-export                               |
| 27 test files                          | Update constructor → factory call       |
