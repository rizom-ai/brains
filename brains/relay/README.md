# @brains/relay

A collaborative knowledge management brain model for teams. Captures, organizes, and shares knowledge through topics, summaries, decks, and links.

## Capabilities

| Plugin         | Purpose                                  |
| -------------- | ---------------------------------------- |
| system         | Core entity management, search, identity |
| topics         | Topic extraction and organization        |
| summary        | Conversation summarization               |
| link           | URL capture and metadata extraction      |
| decks          | Slide deck generation                    |
| directory-sync | File ↔ DB synchronization                |
| git-sync       | Remote git backup and collaboration      |
| site-content   | CMS content management                   |
| site-builder   | Static site generation                   |

## Interfaces

| Interface | Purpose                               |
| --------- | ------------------------------------- |
| MCP       | Model Context Protocol (stdio + HTTP) |
| Webserver | HTTP server for static site           |

## Seed Content

Default identity and content in `seed-content/`:

- `brain-character/` — Brain identity (name, role, purpose, values)
- `anchor-profile/` — Owner profile and social links
- `site-info/` — Site title, description, theme mode
- `deck/` — Example decks
- Root `.md` files — Reference documents

Seed content is copied on first boot when `brain-data/` is empty. After that, the DB and git repo are the source of truth.

## Usage

### 1. Create an instance

```
apps/my-team/
├── brain.yaml          # Instance config
├── .env                # Secrets only
├── tsconfig.json       # Required for Bun JSX resolution
└── package.json
```

### 2. brain.yaml

```yaml
brain: "@brains/relay"

logLevel: debug

anchors:
plugins:
  git-sync:
    repo: your-org/brain-content
    authorName: Relay
    authorEmail: you@example.com
  webserver:
    productionDomain: https://your-site.com
```

### 3. .env (secrets only)

```
ANTHROPIC_API_KEY=sk-ant-...
MATRIX_ACCESS_TOKEN=syt_...
GIT_SYNC_TOKEN=ghp_...
MCP_AUTH_TOKEN=your-mcp-token
```

### 4. Run

```bash
bun run dev        # Development with watch
bun run start      # Production
bun run start:cli  # CLI mode
```

## Config Architecture

- **Brain model** (`src/index.ts`): Structural config — which plugins, layouts, templates, permission rules
- **brain.yaml**: Instance config — who, where, what repo, what domain
- **.env**: Secrets — tokens and API keys you'd rotate if leaked
- **seed-content/**: Default identity and content — copied once on first boot
