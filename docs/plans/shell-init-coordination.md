# Plan: Shell initialization coordination

## Status

Complete. Shell startup now has explicit phases, a real plugin `onReady` hook, and a dedicated `ShellBootloader` that owns boot ordering. `shell.ts` is back to being the runtime facade/service access surface.

This was the required lifecycle foundation before exposing an external plugin API. A public `onPostReady` hook is still not needed; keep any future post-ready/background-started phase internal unless plugin-author requirements prove otherwise.

## Current boot sequence

1. Construct services with `ShellInitializer`.
2. Initialize entity storage.
3. Register shell templates and shell-owned entity adapters.
4. Register configured plugins and run plugin `onRegister` work.
5. Register shell job handlers, data sources, and system capabilities.
6. Emit `SYSTEM_CHANNELS.pluginsRegistered` — wire value `system:plugins:ready` — as an internal all-plugins-registered signal.
7. Because the message bus send is blocking, internal subscribers such as directory-sync complete their startup work before boot continues. Directory-sync emits `SYSTEM_CHANNELS.initialSyncCompleted` — wire value `sync:initial:completed` — as a compatibility/internal post-import notification.
8. Initialize identity/profile and materialize prompt entities in `ShellBootloader`.
9. Dispatch plugin `onReady` hooks.
10. Start plugin daemons, the job queue worker, and the progress monitor.

For plugin authors, the stable promise is: use `onRegister` for capability registration/subscriptions, and use `onReady` for work that needs seeded identity/profile or all plugins registered.

## What changed

- `ShellBootloader` owns startup coordination.
- `ShellInitializer` constructs services and handles registration-time setup only; it no longer owns ready-state identity/profile initialization.
- `Plugin.ready?()` is optional; base plugin classes expose `onReady(context)` with a default no-op.
- Daemons and job processing start after ready hooks.
- Directory-sync initial import runs synchronously during the internal plugins-registered signal instead of queuing a detached startup batch.
- Identity/profile initialization no longer depends on `sync:initial:completed`.
- Internal channel wire names are centralized in `SYSTEM_CHANNELS`.
- Site presentation metadata now flows to plugin context through plugin registration context instead of staying on `IShell` as a facade method.

## Verification

- [x] Tests assert `onRegister` before the plugins-registered signal.
- [x] Tests assert the initial-sync barrier completes before identity/profile ready-state preparation and plugin `onReady`.
- [x] Tests assert daemons/job processing start after ready hooks.
- [x] Tests assert register-only mode does not emit plugins-registered or start background services.
- [x] No production ready-state initialization depends on `sync:initial:completed`.
- [x] Existing targeted tests, package typechecks, lints, and full typecheck passed during implementation.

## Non-goals

- Publishing `onPostReady` for the first external plugin API.
- Changing the message-bus wire values for existing internal compatibility channels.
- Adding ordering guarantees between unrelated plugins within the same phase beyond existing dependency ordering.

## Related

- `shell/core/src/initialization/shellBootloader.ts`
- `shell/core/src/initialization/shellInitializer.ts`
- `shell/plugins/src/system-channels.ts`
- `docs/plans/memory-reduction.md`
