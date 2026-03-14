# MockShell Cleanup (#7)

## Problem

`shell/plugins/src/test/mock-shell.ts` is 667 lines manually implementing the entire `IShell` interface (71 methods/properties). Every time `IShell` gains a method, `MockShell` breaks. It's the #1 most painful file when the shell interface evolves.

## Current Usage

27 test files import `MockShell` across shell/ and plugins/:

- **Shell tests** (4): app.test.ts, pluginManager.test.ts, channels.test.ts, plugin-manager-registration.test.ts, plugin-api-routes.test.ts
- **Plugin tests** (22): content-pipeline, social-media, blog, topics, newsletter, portfolio, image, summary, decks

## Approach

Replace with a `createMockShell()` factory function in `@brains/test-utils`, following the existing `createMockServicePluginContext` pattern:

```ts
export function createMockShell(options?: MockShellOptions): IShell {
  const logger = options?.logger ?? createSilentLogger();
  const entityService = options?.entityService ?? createMockEntityService();
  const messageBus = options?.messageBus ?? createMockMessageBus();
  // ...

  return {
    getLogger: mock(() => logger),
    getEntityService: mock(() => entityService),
    getMessageBus: mock(() => messageBus),
    registerPluginTools: mock(() => {}),
    registerPluginResources: mock(() => {}),
    // ... every method is a mock with sensible defaults
  } as unknown as IShell;
}
```

## Migration Risk

Some tests rely on `MockShell`'s stateful behavior (Map-based plugin/entity tracking). Those need careful migration — the new factory returns stateless mocks by default, with opt-in stateful implementations via options.

## Estimated Effort

- Factory function: ~100 lines (vs 667 current)
- Test migration: 27 files, mostly mechanical (change import + constructor call)
- Some tests may need custom mock overrides where they rely on statefulness
- Total: ~2-3 hours

## Files Changed

| File                                   | Change                   |
| -------------------------------------- | ------------------------ |
| `shared/test-utils/src/mock-shell.ts`  | New factory function     |
| `shared/test-utils/src/index.ts`       | Export `createMockShell` |
| `shell/plugins/src/test/mock-shell.ts` | Delete (or deprecate)    |
| 27 test files                          | Update imports + usage   |
