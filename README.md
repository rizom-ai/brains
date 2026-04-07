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
- **Brain models** — presets (`core`, `default`, `full`) define which plugins load
- **Composite plugins** — a single capability id can register multiple sub-plugins (e.g. `@brains/newsletter` bundles entity + service)

## Project Structure

```
shell/                   Core infrastructure (workspace)
  ├── app/               Brain resolver, CLI entrypoint, brain.yaml parsing
  ├── core/              Shell orchestrator, system tools, plugin lifecycle
  ├── entity-service/    Entity CRUD, hybrid search, embedding DB
  ├── ai-service/        AI generation via Vercel AI SDK (OpenAI / Anthropic / Google)
  ├── mcp-service/       MCP server, tool/resource/template/prompt registration
  ├── job-queue/         Background job processing with batching
  ├── plugins/           Plugin base classes, three sibling contexts
  ├── messaging-service/ Event-driven pub/sub
  ├── identity-service/  Brain character + anchor profile
  ├── conversation-service/  Conversation memory
  ├── content-service/   Template-based generation
  ├── templates/         Template registry
  └── ai-evaluation/    Eval runner, test cases, LLM judge
entities/                Entity plugins (16): blog, note, link, portfolio, topics, ...
plugins/                 Service plugins (13): site-builder, directory-sync, notion, ...
interfaces/              Interface plugins (5): mcp, discord, a2a, chat-repl, webserver
layouts/                 Layout building blocks (personal, professional)
sites/                   Site packages (default, rizom, yeehaa)
brains/                  Brain model packages (rover, ranger, relay)
packages/                Standalone npm packages (brain-cli → @rizom/brain)
shared/                  Shared utilities + themes
  ├── utils/             Logging (JSON mode + log file), markdown, Zod, hashing
  ├── mcp-bridge/        Base class for upstream MCP server integrations
  ├── ui-library/        Preact components for site rendering
  ├── image/             Image schema + adapter
  ├── theme-*/           11 themes (base + 7 generic + 3 branded)
  └── test-utils/        Mock factories, fixtures, harnesses
apps/                    Brain instances — config-only directories (brain.yaml + .env),
                         NOT a workspace category. Consumed by the brain CLI at runtime.
```

## Getting Started

```bash
# Clone and install (development against the monorepo)
git clone https://github.com/rizom-ai/brains.git
cd brains
bun install

# Run an existing app instance via the in-tree brain CLI
cd apps/yeehaa.io
cp .env.example .env       # add AI_API_KEY at minimum
bun --filter @rizom/brain run dev
```

Once `@rizom/brain` is published, the same flow becomes:

```bash
bun add -g @rizom/brain
brain init mybrain         # interactive scaffold (model, domain, content repo)
cd mybrain && brain start
```

### Connecting via MCP

Add to your Claude Desktop or Cursor config:

```json
{
  "mcpServers": {
    "brain": {
      "command": "brain",
      "args": ["start", "--mcp-stdio"],
      "cwd": "/path/to/your/brain-instance"
    }
  }
}
```

### Creating a Brain Instance

App instances are config-only directories — no `package.json`, no source code. The simplest path is `brain init`, which writes a minimal `brain.yaml` + `.env.example`:

```yaml
# brain.yaml
brain: rover
domain: mybrain.example.com
preset: core

anchors: []

plugins:
  # Uncomment to enable git-backed sync of brain content:
  # directory-sync:
  #   git:
  #     repo: my-org/brain-content
  #     authToken: ${GIT_SYNC_TOKEN}
  mcp:
    authToken: ${MCP_AUTH_TOKEN}
```

To override the bundled site or use a multi-variant site package, pass an object form:

```yaml
site:
  package: "@brains/site-rizom"
  variant: ai
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

- 79 packages
- 16 entity types, 13 service plugins, 5 interfaces, 11 themes
- 3 brain models (rover, ranger, relay), 3 site packages (default, rizom, yeehaa)

## Deployment

```bash
# Build a brain model image
deploy/scripts/build-docker-image.sh rover latest

# Or, on a host with Kamal installed:
cd apps/<your-instance>
brain init . --deploy   # one-time scaffold of deploy.yml + Kamal hooks
kamal deploy
```

Single container with built-in Caddy handles TLS, path-based routing, and static file serving on a per-host setup. Production deployments target Hetzner Cloud. See [deploy/README.md](deploy/README.md) and [Kamal migration plan](docs/plans/deploy-kamal.md).

## Documentation

- [Architecture Overview](docs/architecture-overview.md)
- [Brain Models](docs/brain-model.md)
- [Entity Model](docs/entity-model.md)
- [Plugin Quick Reference](docs/plugin-quick-reference.md) | [Plugin Development Patterns](docs/plugin-development-patterns.md)
- [Tech Stack](docs/tech-stack.md)
- [Theming Guide](docs/theming-guide.md)
- [Development Workflow](docs/development-workflow.md)
- [Roadmap](docs/roadmap.md)

## License

Apache-2.0
