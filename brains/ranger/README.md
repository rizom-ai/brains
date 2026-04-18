# @brains/ranger

> Internal-use brain model. This source ships publicly so the architecture stays inspectable, but `@brains/rover` is the public reference model for adoption, extension, and standalone app authoring.

`@brains/ranger` is the community-facing brain model for collectives and organizations. It combines publishing, lightweight community interaction, and operator tooling around notes, links, social posts, products, and wishlist-style feedback.

## Presets

- **`default`** — the full shipped ranger surface

## Capabilities

| Plugin           | Purpose                                     |
| ---------------- | ------------------------------------------- |
| `prompt`         | editable prompt/template entities           |
| `admin`          | CMS/admin surface                           |
| `dashboard`      | operator dashboard widgets                  |
| `note`           | note capture and organization               |
| `link`           | URL capture and metadata extraction         |
| `social-media`   | social publishing entities and workflows    |
| `products`       | product catalog entities                    |
| `wishlist`       | community request / wishlist entities       |
| `directory-sync` | markdown + optional git-backed content sync |
| `analytics`      | Cloudflare web analytics integration        |
| `site-info`      | site identity metadata                      |
| `site-content`   | durable route/section copy                  |
| `site-builder`   | static-site generation                      |

System tools such as create, update, search, extract, and status are framework-level surfaces provided by the shell.

## Interfaces

| Interface   | Purpose                               |
| ----------- | ------------------------------------- |
| `mcp`       | Model Context Protocol                |
| `discord`   | community chat interface with capture |
| `webserver` | HTTP host for site, admin, and health |

## Seed content

Default identity and starter content live in `seed-content/`:

- `brain-character/` — brain identity
- `anchor-profile/` — owner/operator profile
- `site-info/` — site title and metadata

Seed content is copied on first boot when `brain-data/` is empty. After that, the markdown content directory becomes the durable source of truth, with the runtime indexing it into SQLite and optionally syncing it to git.

## Usage

### 1. Create an instance directory

```text
apps/my-collective/
├── brain.yaml
├── .env
├── tsconfig.json
└── package.json
```

### 2. Configure `brain.yaml`

```yaml
brain: ranger
preset: default

anchors:
  - "discord:your-discord-user-id"

plugins:
  directory-sync:
    git:
      repo: your-org/brain-content
  discord: {}
  webserver:
    productionDomain: https://your-site.com
```

### 3. Configure `.env`

```bash
AI_API_KEY=your-api-key-here
DISCORD_BOT_TOKEN=your-discord-token
GIT_SYNC_TOKEN=ghp_...
MCP_AUTH_TOKEN=your-mcp-token

# Optional integrations
LINKEDIN_ACCESS_TOKEN=your-linkedin-token
LINKEDIN_ORGANIZATION_ID=your-org-id
CLOUDFLARE_API_TOKEN=your-api-token
CLOUDFLARE_ANALYTICS_SITE_TAG=your-site-tag
```

### 4. Run the instance

```bash
bunx brain start
```

## Architecture

- **Brain model** (`src/index.ts`) — plugin selection, presets, interfaces, permissions
- **`brain.yaml`** — per-instance config and overrides
- **`.env`** — secrets only
- **`seed-content/`** — first-boot starter content

See also:

- [Brain model architecture](../../docs/brain-model.md)
- [Repository README](../../README.md)
