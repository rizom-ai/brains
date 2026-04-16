# Rover test apps

Local rover preset apps for fast iteration during development.

## Available now

- `core` — minimal capture + sync + MCP/A2A surface, with webserver but no site-builder
- `default` — adds the website surface, dashboard, blog, decks, analytics, and site-builder

## Start a preset

From `brains/rover/`:

```sh
bun start:core
bun start:default
```

Each command runs the matching test app via the in-repo `@rizom/brain` workspace package and seeds its local `brain-data/` from `../../eval-content` on first boot.

## Minimum local env

Set these in your shell before starting:

```sh
export AI_API_KEY=...
export GIT_SYNC_TOKEN=...
```

Use a real `AI_API_KEY` if you want topic extraction, embeddings, and other AI-backed flows to succeed. A placeholder value may still let the app boot, but background AI jobs will fail.

## Optional env

Only set these when you need the corresponding integration:

- `MCP_AUTH_TOKEN` — enable authenticated local MCP HTTP startup; without it, the app can still boot, but the MCP HTTP daemon will not start
- `DISCORD_BOT_TOKEN` — enable the Discord interface
- `LINKEDIN_ACCESS_TOKEN`
- `BUTTONDOWN_API_KEY`
- `UNSPLASH_ACCESS_KEY`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ANALYTICS_SITE_TAG`

Missing optional integration secrets do not block the whole app from booting, but the corresponding integration may be skipped or fail to start.

## Reset a preset

Remove the matching test app data directory:

```sh
rm -rf brains/rover/test-apps/core/brain-data
rm -rf brains/rover/test-apps/default/brain-data
```

The next `bun start:*` re-seeds that preset from `brains/rover/eval-content/`.
