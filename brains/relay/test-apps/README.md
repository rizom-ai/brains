# Relay test apps

Local relay preset apps for fast iteration during development.

## Available

- `core` — team/collaboration brain without public site-builder docs routes
- `default` — minimal public Relay site surface
- `full` — public team knowledge hub with docs and decks
- `docs` — legacy focused fixture for `default` plus opt-in `docs` capability

## Start a preset

From `brains/relay/`:

```sh
bun start:core
bun start:default
bun start:full
bun start:docs
```

Each command runs the matching test app via the in-repo `@rizom/brain` workspace package. `directory-sync` bootstraps the preset-specific local content remote from `../../eval-content` when the remote is missing or empty.

## Minimum local env

Set these in your shell before starting:

```sh
export AI_API_KEY=...
export GIT_SYNC_TOKEN=...
```

Or put those values in a preset-local `.env` file next to `brain.yaml`, for example:

- `brains/relay/test-apps/core/.env`
- `brains/relay/test-apps/default/.env`
- `brains/relay/test-apps/full/.env`
- `brains/relay/test-apps/docs/.env`

Use a real `AI_API_KEY` if you want topic extraction, embeddings, summaries, and other AI-backed flows to succeed. A placeholder value may still let the app boot, but background AI jobs will fail.

## Optional env

Only set these when you need the corresponding integration:

- `MCP_AUTH_TOKEN` — enable authenticated local MCP HTTP startup; without it, the app can still boot, but the MCP HTTP daemon will not start
- `DISCORD_BOT_TOKEN` — enable the Discord interface

Missing optional integration secrets do not block the whole app from booting, but the corresponding integration may be skipped or fail to start.

## Reset a preset

```sh
rm -rf brains/relay/test-apps/core/brain-data brains/relay/test-apps/core/data brains/relay/test-apps/core/dist /tmp/relay-core-test-content.git
rm -rf brains/relay/test-apps/default/brain-data brains/relay/test-apps/default/data brains/relay/test-apps/default/dist /tmp/relay-default-test-content.git
rm -rf brains/relay/test-apps/full/brain-data brains/relay/test-apps/full/data brains/relay/test-apps/full/dist /tmp/relay-full-test-content.git
rm -rf brains/relay/test-apps/docs/brain-data brains/relay/test-apps/docs/data brains/relay/test-apps/docs/dist /tmp/relay-docs-test-content.git
```
