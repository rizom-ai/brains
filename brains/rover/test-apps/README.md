# Rover test apps

Local rover preset apps for fast iteration during development.

## Available now

- `core` — minimal capture + sync + MCP/A2A surface, with webserver but no site-builder
- `default` — adds the website surface, dashboard, blog, decks, analytics, and site-builder; uses `@brains/site-personal` with the rover model's default theme
- `full` — adds portfolio, content automation, newsletter, social-media, and stock-photo workflows

## Start a preset

From `brains/rover/`:

```sh
bun start:core
bun start:default
bun start:full
```

Each command runs the matching test app via the in-repo `@rizom/brain` workspace package. `directory-sync` bootstraps the preset-specific local content remote from `../../eval-content` when the remote is missing or empty.

## Minimum local env

Set these in your shell before starting:

```sh
export AI_API_KEY=...
export GIT_SYNC_TOKEN=...
```

Or put those values in a preset-local `.env` file next to `brain.yaml`, for example:

- `brains/rover/test-apps/core/.env`
- `brains/rover/test-apps/default/.env`
- `brains/rover/test-apps/full/.env`

Use a real `AI_API_KEY` if you want topic extraction, embeddings, and other AI-backed flows to succeed. A placeholder value may still let the app boot, but background AI jobs will fail.

## Optional env

Only set these when you need the corresponding integration:

- `MCP_AUTH_TOKEN` — deprecated static fallback for MCP HTTP auth. Prefer the built-in OAuth/passkey provider; when `auth-service` is enabled, `/mcp` accepts brain-issued OAuth bearer tokens without this env var.
- `DISCORD_BOT_TOKEN` — enable the Discord interface
- `LINKEDIN_ACCESS_TOKEN`
- `BUTTONDOWN_API_KEY`
- `UNSPLASH_ACCESS_KEY`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ANALYTICS_SITE_TAG`

Missing optional integration secrets do not block the whole app from booting, but the corresponding integration may be skipped or fail to start.

## Reset a preset

Remove the matching test app state and local content remote:

```sh
rm -rf brains/rover/test-apps/core/brain-data brains/rover/test-apps/core/data brains/rover/test-apps/core/dist /tmp/rover-core-test-content.git
rm -rf brains/rover/test-apps/default/brain-data brains/rover/test-apps/default/data brains/rover/test-apps/default/dist /tmp/rover-default-test-content.git
rm -rf brains/rover/test-apps/full/brain-data brains/rover/test-apps/full/data brains/rover/test-apps/full/dist /tmp/rover-full-test-content.git
```

The next `bun start:*` recreates and seeds that preset's local content remote from `brains/rover/eval-content/`.
