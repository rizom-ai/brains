# @brains/ranger

A community-facing brain model for collectives and organizations. Manages notes, links, social media, products, and wishlists with a public website featuring CTA-driven landing pages.

## Capabilities

| Plugin         | Purpose                                         |
| -------------- | ----------------------------------------------- |
| system         | Core entity management, search, identity        |
| dashboard      | Extensible dashboard with plugin widgets        |
| note           | Note capture and organization                   |
| link           | URL capture and metadata extraction             |
| social-media   | LinkedIn integration and social post management |
| products       | Product catalog management                      |
| wishlist       | Community wishlist tracking                     |
| directory-sync | File ↔ DB synchronization                       |
| git-sync       | Remote git backup and collaboration             |
| analytics      | Cloudflare web analytics (beacon + query API)   |
| site-builder   | Static site generation with CTA landing pages   |

## Interfaces

| Interface | Purpose                                            |
| --------- | -------------------------------------------------- |
| MCP       | Model Context Protocol (stdio + HTTP)              |
| Discord   | Discord chat bot with URL capture                  |
| Webserver | HTTP server for static site (with preview support) |

## Custom Route Logic

The home page uses a CTA footer layout with the `about` template showing the `HOME` entity — ideal for community landing pages with a call-to-action. Social posts and links get dedicated entity routes with secondary navigation.

## Seed Content

Default identity and content in `seed-content/`:

- `brain-character/` — Brain identity (name, role, purpose, values)
- `anchor-profile/` — Owner profile
- `site-info/` — Site title, description, theme mode

Seed content is copied on first boot when `brain-data/` is empty. After that, the DB and git repo are the source of truth.

## Usage

### 1. Create an instance

```
apps/my-collective/
├── brain.yaml          # Instance config
├── .env                # Secrets only
├── tsconfig.json       # Required for Bun JSX resolution
└── package.json
```

### 2. brain.yaml

```yaml
brain: ranger

logLevel: debug

anchors:
  - "discord:your-discord-user-id"
trusted:
  - "discord:trusted-user-id"

plugins:
  git-sync:
    repo: your-org/brain-content
    authorName: Ranger
    authorEmail: collective@example.com
  discord: {}
  webserver:
    productionDomain: https://your-site.com
    previewDomain: https://preview.your-site.com
    previewDistDir: ./dist/site-preview
    previewPort: 4321
```

### 3. .env (secrets only)

```
AI_API_KEY=your-api-key-here
MATRIX_ACCESS_TOKEN=syt_...
DISCORD_BOT_TOKEN=your-discord-token
GIT_SYNC_TOKEN=ghp_...
MCP_AUTH_TOKEN=your-mcp-token

# Optional
LINKEDIN_ACCESS_TOKEN=your-linkedin-token
LINKEDIN_ORGANIZATION_ID=your-org-id
CLOUDFLARE_ACCOUNT_ID=your-account-id
CLOUDFLARE_API_TOKEN=your-api-token
CLOUDFLARE_ANALYTICS_SITE_TAG=your-site-tag
```

### 4. Run

```bash
bun run dev        # Development with watch
bun run start      # Production
bun run start:cli  # CLI mode
```

## Config Architecture

- **Brain model** (`src/index.ts`): Structural config — which plugins, layouts, templates, routes, permission rules, entity route config
- **brain.yaml**: Instance config — who, where, what repo, what domain
- **.env**: Secrets — tokens and API keys you'd rotate if leaked
- **seed-content/**: Default identity — copied once on first boot
