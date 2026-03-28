# Architecture Overview

The Personal Brain application features a modular, plugin-based architecture built around a core shell that provides essential infrastructure for knowledge management. Each "brain" is an independently deployable instance with its own identity, capabilities, and content.

## Core Architecture Principles

1. **MCP-First Design**: Every brain application is an MCP server, exposing all functionality through the Model Context Protocol
2. **Tool-First Architecture**: All functionality is exposed as self-describing tools with schemas
3. **Entity-Driven**: Content types are defined as EntityPlugins with schema, adapter, and optional derive/generate
4. **Schema-First Design**: All data structures use Zod schemas for validation and type safety
5. **Brain Model/Instance Separation**: Brain definitions (`brains/`) declare identity and capabilities; deployment instances provide environment config via brain.yaml
6. **Everything through `@brains/plugins`**: Plugins never import from shell packages directly

## Workspace Structure

The monorepo is managed by Turborepo with 9 workspace categories:

```
shell/          Core infrastructure — runtime, services, plugin framework
shared/         Reusable utilities, themes, UI components
entities/       Content type EntityPlugins — schema, adapter, generation, derive
plugins/        Integration plugins with tools — CRUD, orchestration, infrastructure
layouts/        Page layout components — datasources, templates, page structure
sites/          Site packages — theme + layout + routes bundles
interfaces/     Interaction channels — how users talk to a brain
brains/         Brain definitions — identity, capabilities, presets, content model
apps/           Deployment instances — brain.yaml + .env (moving to standalone repos)
```

### Shell Packages (Core Infrastructure)

| Package                      | Purpose                                                                      |
| ---------------------------- | ---------------------------------------------------------------------------- |
| `shell/app`                  | Brain resolver, CLI, brain.yaml parsing, `defineBrain()`                     |
| `shell/core`                 | Central shell with plugin management and lifecycle                           |
| `shell/ai-service`           | AI agent with xstate conversation state machine                              |
| `shell/content-service`      | Template-based content generation                                            |
| `shell/conversation-service` | Conversation and message management with memory                              |
| `shell/entity-service`       | Entity CRUD, search, mutations, queries with vector support                  |
| `shell/identity-service`     | Brain character + anchor profile management                                  |
| `shell/job-queue`            | Background job processing with progress tracking                             |
| `shell/mcp-service`          | MCP server — tool, resource, resource template, prompt registration          |
| `shell/messaging-service`    | Event-driven pub/sub messaging                                               |
| `shell/plugins`              | Plugin base classes (EntityPlugin, ServicePlugin, InterfacePlugin), contexts |
| `shell/templates`            | Template registry and management                                             |
| `shell/ai-evaluation`        | Eval runner, test cases, LLM judge                                           |

### Entity Packages (Content Types)

All content types live in `entities/` as EntityPlugins. Zero tools — entity CRUD goes through system tools.

| Package                 | Entity type   | Features                                 |
| ----------------------- | ------------- | ---------------------------------------- |
| `entities/blog`         | `post`        | Essays, RSS, generation handler          |
| `entities/decks`        | `deck`        | Presentations, generation handler        |
| `entities/note`         | `base`        | Knowledge capture, generation handler    |
| `entities/link`         | `link`        | URL capture with AI extraction           |
| `entities/portfolio`    | `project`     | Case studies, generation handler         |
| `entities/social-media` | `social-post` | LinkedIn posts, derive() from blog posts |
| `entities/newsletter`   | `newsletter`  | Email newsletters, publish pipeline      |
| `entities/wishlist`     | `wish`        | Unfulfilled user requests                |
| `entities/products`     | `product`     | Product listings                         |
| `entities/image`        | `image`       | AI image generation                      |
| `entities/series`       | `series`      | Derived from posts via derive()          |
| `entities/topics`       | `topic`       | AI-extracted tags via derive()           |
| `entities/summary`      | `summary`     | Conversation summaries via derive()      |
| `entities/prompt`       | `prompt`      | AI prompts as editable markdown entities |
| `entities/site-info`    | `site-info`   | Site metadata (title, description)       |

### Integration Plugins (Tools + Services)

| Package                    | Purpose                                                                                                        |
| -------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `plugins/directory-sync`   | File sync + git ops                                                                                            |
| `plugins/site-builder`     | Static site generation orchestration (tools, events, job queue). Build engine moving to `@brains/site-engine`. |
| `plugins/content-pipeline` | Publishing queue with scheduling and retry                                                                     |
| `plugins/dashboard`        | Extensible widget system                                                                                       |
| `plugins/analytics`        | Cloudflare analytics integration                                                                               |
| `plugins/buttondown`       | Buttondown subscriber management + API routes                                                                  |
| `plugins/notion`           | MCP bridge to Notion workspace                                                                                 |
| `plugins/hackmd`           | MCP bridge to HackMD                                                                                           |
| `plugins/obsidian-vault`   | Obsidian template generation                                                                                   |

### Shared Packages

| Package              | Purpose                                                                                   |
| -------------------- | ----------------------------------------------------------------------------------------- |
| `shared/utils`       | Logging, markdown, permissions, Zod re-export                                             |
| `shared/ui-library`  | Preact UI components (Header, Footer, ThemeToggle)                                        |
| `shared/mcp-bridge`  | Base class for upstream MCP server integration                                            |
| `shared/image`       | Image schema, adapter, utilities                                                          |
| `shared/theme-*`     | CSS themes (10 themes)                                                                    |
| `shared/site-engine` | Static site build engine (planned) — Preact/Astro rendering, Tailwind, image optimization |
| `shared/test-utils`  | Mock factories, harness helpers                                                           |

### Interface Packages

| Package                | Purpose                                                       |
| ---------------------- | ------------------------------------------------------------- |
| `interfaces/cli`       | Command-line interface                                        |
| `interfaces/discord`   | Discord bot interface                                         |
| `interfaces/matrix`    | Matrix bot interface (deprecating → Chat SDK)                 |
| `interfaces/mcp`       | MCP transport (stdio + HTTP)                                  |
| `interfaces/webserver` | Static site server (child process) + API routes (main thread) |
| `interfaces/a2a`       | A2A protocol (Agent Card, JSON-RPC tasks, non-blocking)       |

### Brain Definitions

| Package         | Brain        | Description                               |
| --------------- | ------------ | ----------------------------------------- |
| `brains/rover`  | Professional | Personal knowledge + professional content |
| `brains/relay`  | Team         | Team collaboration                        |
| `brains/ranger` | Collective   | Collective/organizational knowledge       |

Each brain uses `defineBrain()` to declare identity, capabilities, interfaces, presets, and permissions.

## Architectural Boundaries

```
brains/ ──imports──▶ entities/, plugins/, layouts/, interfaces/, shared/
entities/ ──imports──▶ shared/, shell/plugins  (NOT other entities or plugins)
layouts/ ──imports──▶ shared/, shell/
plugins/ ──imports──▶ shared/, shell/          (NOT other plugins or entities)
interfaces/ ──imports──▶ shared/, shell/       (NOT other interfaces)
shell/ ──imports──▶ shared/, other shell/
```

## Plugin System

**Three plugin types:**

- **EntityPlugin**: Content types — defines entity schema, adapter, generation handler, derive(). No tools.
- **ServicePlugin**: Integrations — provides tools, job handlers, API routes. No entities.
- **InterfacePlugin**: Transports — manages daemons, permissions, user interaction.

**EntityPlugin** is the most common type. All content plugins (blog, decks, note, link, etc.) are EntityPlugins.

**Key EntityPlugin features:**

- Auto-registers entity type, generation handler, templates, datasources
- `derive()` for event-driven derivation (topics from posts, series from posts)
- `deriveAll()` for batch reprocessing via `system_extract`
- Zero tools — entity CRUD goes through `system_create`, `system_update`, `system_delete`

**Registration Flow:**

1. PluginManager initializes plugins in dependency order
2. EntityPlugins auto-register entity types + handlers
3. ServicePlugins register tools + job handlers
4. InterfacePlugins register daemons

## Entity Model

All content follows a unified entity pattern:

```typescript
{
  id: string,
  entityType: string,           // "post", "deck", "note", etc.
  content: string,              // Markdown with YAML frontmatter
  metadata: { ... },            // Subset of frontmatter for fast DB queries
  contentHash: string,          // For change detection
  created: string,              // ISO datetime
  updated: string,              // ISO datetime
}
```

## Testing

- **Unit Tests**: Behavioral testing with Bun test runner
- **Plugin Testing**: `createPluginHarness()` — unified harness for all plugin types
- **Mock Utilities**: `createMockEntityService()`, `createSilentLogger()`, `createTestEntity()`, `createMockMessageSender()` from `@brains/test-utils`
- **Eval System**: Agent evals (full brain) + handler evals (lightweight, no brain)

## Deployment

- **Development**: `bun run` with hot reloading
- **Production**: Docker containers on Hetzner Cloud (migrating to Kamal)
- **Webserver**: Child process for static files, main thread for API routes
- **CI/CD**: GitHub Actions

## Documentation

- **Plugin Guidelines**: `plugins/CLAUDE.md`
- **Interface Guidelines**: `interfaces/CLAUDE.md`
- **Theming Guide**: `docs/theming-guide.md`
- **Plans**: `docs/plans/`
- **Roadmap**: `docs/roadmap.md` + `docs/roadmap-visual.html`
- **Codebase Map**: `docs/codebase-map.html`
