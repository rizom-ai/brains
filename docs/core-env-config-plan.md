# Move env-derived core defaults to app layer

## Goal

Make `shell/core` deterministic and config-driven by removing direct `process.env` reads from core standard config, while preserving Docker/Kamal behavior that stores state under mounted paths like `/data`.

## Rationale

- `shell/core` should not depend on ambient process/global state.
- Runtime environment policy belongs in app/CLI/deploy code, not core service construction.
- Core tests become simpler: defaults are fixed unless explicit config is passed.
- App/deploy tests own XDG behavior and deployment path mapping.

## Current behavior to preserve

- Docker deploy templates set `XDG_DATA_HOME=/data`.
- Kamal maps persistent state to `/data`.
- Standard DB paths currently resolve to `/data/*.db` in those deployments.

## Proposed steps

1. Add an app/deploy-level helper that reads `XDG_DATA_HOME` and `XDG_CACHE_HOME`.
2. Build explicit core config values from that helper:
   - `database.url`
   - `jobQueueDatabase.url`
   - `conversationDatabase.url`
   - `embeddingDatabase.url`
   - `embedding.cacheDir`
3. Pass those explicit values into `createShellConfig()` / `Shell.createFresh()` from app startup.
4. Move migration-script usage of `getStandardConfigWithDirectories()` out of core and into app/deploy utilities.
5. Change `shell/core` standard defaults to fixed paths only:
   - `./data`
   - `./cache`
   - `./dist`
6. Remove `process.env` reads from `shell/core` config.
7. Update tests:
   - Core: assert standard config ignores XDG and auth-token env vars.
   - App/deploy: assert XDG maps DBs/cache to `/data` and `/cache` or deployed equivalents.
   - Ops: keep Docker/Kamal template assertions.

## Compatibility note

This should be a separate PR from internal core cleanup. It crosses package boundaries and may affect direct `@brains/core` users who rely on XDG env vars implicitly. Those users should pass explicit config or use an app-level helper.
