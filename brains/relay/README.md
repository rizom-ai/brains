# @brains/relay

> Internal-use brain model. This source ships publicly so the architecture stays inspectable, but `@brains/rover` is the public reference model for adoption, extension, and standalone app authoring.

`@brains/relay` is the collaborative team brain model: capture → synthesize → share. Its shipped presets focus on notes, links, topic extraction, peer-brain discovery, MCP/Discord/A2A access, and an optional public website.

## Presets

- **`core`** — team capture + synthesis without the public site layer
- **`default`** — `core` plus the minimal public-site stack

Registered but opt-in for now:

- **`summary`** — available via `add: [summary]`
- **`decks`** — available via `add: [decks]`

## Capabilities

| Plugin           | Purpose                                      |
| ---------------- | -------------------------------------------- |
| `prompt`         | editable prompt/template entities            |
| `directory-sync` | markdown + optional git-backed content sync  |
| `note`           | free-form team notes                         |
| `link`           | URL capture and metadata extraction          |
| `topics`         | topic extraction and organization            |
| `agents`         | peer-brain discovery entities                |
| `cms`            | CMS surface                                  |
| `dashboard`      | operator dashboard widgets                   |
| `image`          | image handling for site-facing instances     |
| `site-info`      | site identity metadata                       |
| `site-content`   | durable route/section copy                   |
| `site-builder`   | static-site generation                       |
| `summary`        | summarization plugin, currently opt-in       |
| `decks`          | deck/presentation entities, currently opt-in |

System tools such as create, update, search, extract, and status are framework-level surfaces provided by the shell.

## Interfaces

| Interface   | Purpose                                        |
| ----------- | ---------------------------------------------- |
| `mcp`       | Model Context Protocol                         |
| `discord`   | team chat interface with URL capture           |
| `a2a`       | agent-to-agent RPC surface                     |
| `webserver` | HTTP host for site, CMS, dashboard, and health |

## Seed content

Default identity and starter content live in `seed-content/`:

- `brain-character/` — brain identity
- `anchor-profile/` — owner/team profile
- `site-info/` — site title and metadata
- `deck/` — example decks
- root `.md` files — supporting reference docs

Seed content is copied on first boot when `brain-data/` is empty. After that, the markdown content directory becomes the durable source of truth, with the runtime indexing it into SQLite and optionally syncing it to git.

## Usage

### 1. Create an instance directory

```text
apps/my-team/
├── brain.yaml
├── .env
├── tsconfig.json
└── package.json
```

### 2. Configure `brain.yaml`

```yaml
brain: relay
preset: default

plugins:
  directory-sync:
    git:
      repo: your-org/brain-content
  webserver:
    productionDomain: https://your-site.com
```

To enable the deferred plugins:

```yaml
add: [summary, decks]
```

### 3. Configure `.env`

```bash
AI_API_KEY=your-api-key-here
DISCORD_BOT_TOKEN=your-discord-token
GIT_SYNC_TOKEN=ghp_...
MCP_AUTH_TOKEN=your-mcp-token
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

- [Relay preset plan](../../docs/plans/relay-presets.md)
- [Brain model architecture](../../docs/brain-model.md)
- [Repository README](../../README.md)
