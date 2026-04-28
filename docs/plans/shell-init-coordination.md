# Plan: Shell initialization coordination

## Status

Proposed. This gates the external plugin API so public lifecycle semantics are stable before plugin authoring exports ship.

External API gate scope: this plan must land far enough to provide a real `onReady` hook and explicit boot ordering. A public `onPostReady` hook is not required for the first external plugin API; keep any post-ready phase internal unless implementation proves plugin authors need it.

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

Public plugin hook contract for the first external plugin API:

```ts
type PublicPluginLifecycle =
  | "register" // capability registration only; do not rely on seeded identity/profile
  | "ready"; // shell services available; identity/profile seeded
```

The bootloader may still have an internal post-ready/background-started phase, but that does not become public API unless a concrete plugin-author need appears.

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
3. emit `system:plugins:ready` as an internal "all registrations complete" signal for existing subscribers such as directory-sync
4. wait for initial sync completion when a sync plugin is active; otherwise continue immediately
5. seed/refresh identity and profile in the bootloader
6. dispatch `onReady` for all plugins
7. start background services
8. optionally run internal post-ready observers if needed later

After step 7, `Shell.getInstance()` returns the live facade. For external plugin authors, the stable promise is `onReady` after identity/profile seeding and before background behavior that depends on ready-state assumptions.

### What this replaces

- the identity/profile initialization work currently attached to `sync:initial:completed` in `shellInitializer.ts`
- the comment-driven ordering at `shell.ts:205-225`
- the implicit "ready" meaning of `system:plugins:ready`; the broadcast can stay, but means "all plugins registered" rather than "safe to read ready-state identity/profile"

## Steps

1. Add lifecycle tests first: `onRegister` before ready, identity/profile seeded before `onReady`, daemon/job startup still ordered.
2. Inventory current `onRegister` callers — which actually need ready-state services? Move them to `onReady`.
3. Add an optional `onReady` hook on the three plugin base classes; default no-op.
4. Introduce `ShellBootloader` adjacent to `Shell`; move `initialize()` body there.
5. Keep `system:plugins:ready` as the internal all-registered signal, but stop treating it as public lifecycle readiness.
6. Make identity/profile seeding part of the bootloader sequence, not a message-bus reaction.
7. Drop the `sync:initial:completed` ordering trick once plugins migrate.
8. Bench startup timing — phased dispatch should not regress.

## Inventory notes

Known migration hotspots from current code search:

- Identity/profile reads that should move to `onReady` or later: `interfaces/a2a`, dashboard widget data, assessment/capability profile builders, generation handlers that already run as jobs.
- `system:plugins:ready` producers/consumers used only for "all subscribers are installed" ordering can stay on the message bus: analytics/head scripts, publish provider registration, dashboard widget registration.
- `sync:initial:completed` consumers that rebuild derived state after files land need a replacement bootloader-owned initial-sync barrier or an internal post-sync event with clear semantics: topics, series, site-info, assessment, content-pipeline, site-builder, agent-discovery skills.
- Directory-sync may still emit a sync completion event for observers, but identity/profile initialization should no longer depend on subscribers racing that event.

## Non-goals

- Changing plugin authoring API beyond a single optional public hook (`onReady`)
- Publishing `onPostReady` for the first external plugin API
- Changing the message bus or its semantics
- Adding ordering between plugins within a phase

## Verification

1. No plugin calls `context.identity` during `onRegister` after migration.
2. `shell.ts` shrinks to a runtime facade with no `initialize()` body.
3. Tests assert phase order: `onRegister` before `system:plugins:ready`, initial sync barrier before identity/profile seeding, identity/profile seeded before `onReady`, daemon/job startup remains ordered.
4. No public `onPostReady` API is required by the implementation.
5. Existing tests pass.
6. Startup is no slower than before.

## Related

- `shell/core/src/shell.ts:200-236`
- `shell/core/src/initialization/shellInitializer.ts`
- `docs/plans/memory-reduction.md` — touches the same files for a different reason
