# Relay test apps

Local relay preset apps for fast iteration during development.

## Available

- `core` — team/collaboration brain without public site-builder docs routes
- `default` — public Relay site surface
- `docs` — `default` plus opt-in `docs` capability for `doc` entities, with `/` rendering the docs index

## Start a preset

From `brains/relay/`:

```sh
bun start:core
bun start:default
bun start:docs
```

Each command runs the matching test app via the in-repo `@rizom/brain` workspace package. `directory-sync` bootstraps the preset-specific local content remote from `../../eval-content` when the remote is missing or empty.

## Minimum local env

```sh
export AI_API_KEY=...
export GIT_SYNC_TOKEN=...
```

Optional:

- `MCP_AUTH_TOKEN`
- `DISCORD_BOT_TOKEN`

## Reset a preset

```sh
rm -rf brains/relay/test-apps/core/brain-data brains/relay/test-apps/core/data brains/relay/test-apps/core/dist /tmp/relay-core-test-content.git
rm -rf brains/relay/test-apps/default/brain-data brains/relay/test-apps/default/data brains/relay/test-apps/default/dist /tmp/relay-default-test-content.git
rm -rf brains/relay/test-apps/docs/brain-data brains/relay/test-apps/docs/data brains/relay/test-apps/docs/dist /tmp/relay-docs-test-content.git
```
