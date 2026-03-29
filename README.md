# Rizom Brains

A modular platform for building AI-powered knowledge agents. Each brain is an MCP server that exposes tools and resources for AI assistants, with pluggable entity types, interfaces, and integrations.

## What is a Brain?

A brain is a personal AI agent that manages your knowledge. It stores content as markdown, serves a static website, syncs with git, and talks to AI models. You interact with it through MCP (Claude Desktop, Cursor), Discord, or the CLI.

Brains are defined by a **brain model** (what plugins it includes) and configured per-instance via `brain.yaml` (credentials, domain, git repo). One model, many deployments.

## Architecture

```
brain.yaml (instance config)
  + brain model (plugin selection)
  = running brain
    ├── Entity Plugins    content types: blog, notes, links, portfolio, ...
    ├── Service Plugins   integrations: directory-sync, site-builder, notion, ...
    └── Interface Plugins transports: MCP, Discord, A2A, webserver, CLI
```

### Plugin Types

- **EntityPlugin** — defines a content type with schema, markdown adapter, and AI generation handler. Lives in `entities/`.
- **ServicePlugin** — provides tools, job handlers, and external service integrations. Lives in `plugins/`.
- **InterfacePlugin** — transport layer for user interaction. Lives in `interfaces/`.

### Key Concepts

- **Entities** — all content is a typed entity (blog post, note, link, topic) stored as markdown with frontmatter
- **Tools** — every feature is an MCP tool, accessible to any AI assistant
- **Resources** — read-only data exposed via MCP (identity, profile, status)
- **Auto-sync** — entity changes automatically export to files and commit to git
- **Brain models** — presets (`minimal`, `default`, `pro`) define which plugins load

## Project Structure

```
apps/                    Brain instances (professional, team, mylittlephoney)
entities/                Entity plugins (15): blog, note, link, portfolio, ...
plugins/                 Service plugins (24): site-builder, directory-sync, notion, ...
interfaces/              Interface plugins (6): mcp, discord, a2a, cli, matrix, webserver
shell/                   Core infrastructure
  ├── core/              Shell orchestrator, system tools, plugin management
  ├── entity-service/    Entity CRUD, SQLite, vector search, Drizzle ORM
  ├── ai-service/        AI generation via Vercel AI SDK (Anthropic, OpenAI)
  ├── mcp-service/       MCP server, tool/resource registration
  ├── job-queue/         Background job processing with batching
  ├── plugins/           Plugin base classes, context hierarchy
  ├── messaging-service/ Event-driven pub/sub
  ├── identity-service/  Brain character + anchor profile
  ├── templates/         Template + view registry, content resolution
  └── ...
shared/                  Shared packages
  ├── utils/             Logging, markdown, Zod, pLimit, hashing
  ├── mcp-bridge/        Base class for upstream MCP server integrations
  ├── ui-library/        Preact components for site rendering
  ├── theme-*/           10 themes (default, yeehaa, brutalist, editorial, ...)
  └── test-utils/        Mock factories, fixtures, harnesses
```

## Getting Started

```bash
# Clone and install
git clone https://github.com/rizom-ai/brains.git
cd brains
bun install

# Run the professional brain locally
cd apps/professional-brain
cp example.env .env  # add your API keys
bun run dev
```

### Connecting via MCP

Add to your Claude Desktop or Cursor config:

```json
{
  "mcpServers": {
    "brain": {
      "command": "bun",
      "args": ["run", "dev"],
      "cwd": "/path/to/brains/apps/professional-brain"
    }
  }
}
```

### Creating a Brain Instance

Define a brain model in `apps/your-brain/brain.config.ts`:

```typescript
import { defineBrain } from "@brains/app";

export default defineBrain({
  name: "my-brain",
  model: "@brains/rover",
  site: "@brains/site-default",
  preset: "default",
});
```

Configure the instance in `brain.yaml`:

```yaml
brain: "@brains/rover"
site: "@brains/site-default"
preset: default
domain: mybrain.example.com
plugins:
  directory-sync:
    git:
      repo: my-org/brain-content
      authToken: ${GIT_SYNC_TOKEN}
```

## Development

Turborepo monorepo with Bun.

```bash
bun test                  # Run all tests
bun run typecheck         # Type check all packages
bun run lint              # Lint all packages
bun test plugins/blog/    # Test a single package
```

### Metrics

- 77 packages
- 15 entity types, 24 service plugins, 6 interfaces, 10 themes
- ~144k lines of TypeScript
- 301 test files

## Deployment

```bash
# Docker (recommended)
./scripts/build-release.sh professional-brain
docker build -t brain -f deploy/docker/Dockerfile.prod .
docker run -d -p 3333:3333 --env-file .env brain
```

Currently deployed on Hetzner Cloud with Docker + Caddy. See [Deployment Guide](docs/deployment.md) and [Roadmap](docs/roadmap.md) for the Kamal migration plan.

## Documentation

- [Architecture Overview](docs/architecture-overview.md)
- [Plugin System](docs/plugin-system.md) | [Quick Reference](docs/plugin-quick-reference.md)
- [Entity Model](docs/entity-model.md)
- [Brain Models](docs/brain-model.md)
- [Theming Guide](docs/theming-guide.md)
- [Messaging System](docs/messaging-system.md)
- [Roadmap](docs/roadmap.md)

## License

MIT
