# Plan: Shell initialization coordination

## Status

Proposed.

## Problem

`shell/core/src/shell.ts` is a 682-line facade that combines runtime service access with init orchestration. The init sequence at lines 200-236 coordinates several distinct phases through implicit ordering:

1. services constructed (`ShellInitializer`)
2. plugins registered (`onRegister` hooks)
3. `system:plugins:ready` broadcast over the message bus
4. background services (job queue worker, progress monitor) start
5. identity/profile defaults seeded **after** a `sync:initial:completed` event arrives — which depends on a directory-sync subscription firing later

A plugin's `onRegister` hook that touches identity or profile races the seed step. The code papers this over with the comment at `shell.ts:205-207` ("Identity and profile services are initialized via sync:initial:completed subscription") and the assumption that no plugin reads identity at register time. The guarantee is informal — there is no type-level signal that a particular service is or is not available yet.

## Goal

Make initialization phases explicit at the API level instead of implicit in the message bus, so:

- plugins declare which lifecycle phase a hook belongs to
- "ready" is a reachable state, not a broadcast
- `shell.ts` is a runtime facade, not also the coordinator

## Design sketch

### Explicit lifecycle phases

```ts
type PluginLifecycle =
  | "register" // capabilities registered; no shell services available
  | "ready" // shell services available; identity/profile seeded
  | "post-ready"; // background services started; jobs may run
```

Plugins opt in:

```ts
class MyPlugin extends ServicePlugin {
  onRegister(ctx) {
    /* register capabilities only */
  }
  onReady(ctx) {
    /* identity, profile, conversation services available */
  }
}
```

### Split the coordinator out of `Shell`

- `Shell` — runtime facade. Service accessors, no init logic.
- `ShellBootloader` — runs the phased init sequence; owns plugin lifecycle dispatch.

Bootloader sequence:

1. construct services
2. dispatch `onRegister` for all plugins
3. seed identity/profile (synchronously if no directory-sync; otherwise wait for sync once, here)
4. dispatch `onReady` for all plugins
5. start background services
6. dispatch `onPostReady` (optional)

After step 5, `Shell.getInstance()` returns the live facade.

### What this replaces

- the `sync:initial:completed` subscription in `shellInitializer.ts`
- the comment-driven ordering at `shell.ts:205-225`
- the implicit "ready" via broadcast (the broadcast can stay for observers; it stops being load-bearing)

## Steps

1. Inventory current `onRegister` callers — which actually need ready-state services? Move them to `onReady`.
2. Add an optional `onReady` hook on the three plugin base classes; default no-op.
3. Introduce `ShellBootloader` adjacent to `Shell`; move `initialize()` body there.
4. Make identity/profile seeding part of the bootloader sequence, not a message-bus reaction.
5. Drop the `sync:initial:completed` ordering trick once plugins migrate.
6. Bench startup timing — phased dispatch should not regress.

## Non-goals

- Changing plugin authoring API beyond a single optional hook
- Changing the message bus or its semantics
- Adding ordering between plugins within a phase

## Verification

1. No plugin calls `context.identity` during `onRegister` after migration
2. `shell.ts` shrinks to a runtime facade with no `initialize()` body
3. Existing tests pass; one new test asserts `onReady` runs after identity/profile is seeded
4. Startup is no slower than before

## Related

- `shell/core/src/shell.ts:200-236`
- `shell/core/src/initialization/shellInitializer.ts`
- `docs/plans/memory-reduction.md` — touches the same files for a different reason
