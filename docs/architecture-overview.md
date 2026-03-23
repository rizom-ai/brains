# Architecture Overview

The Personal Brain application features a modular, plugin-based architecture built around a core shell that provides essential infrastructure for knowledge management. Each "brain" is an independently deployable instance with its own identity, capabilities, and content.

## Core Architecture Principles

1. **MCP-First Design**: Every brain application is an MCP server, exposing all functionality through the Model Context Protocol
2. **Tool-First Architecture**: All functionality is exposed as self-describing tools with schemas
3. **Monolithic Shell with Plugin Support**: Core functionality lives in the shell package, with plugin interfaces for extensibility
4. **Functional Entity Model**: Uses factory functions and Zod schemas for entity creation, not classes
5. **Schema-First Design**: All data structures use Zod schemas for validation and type safety
6. **Component Interface Standardization**: Consistent singleton pattern across all major components
7. **Direct Registration Pattern**: PluginManager directly calls registry methods (no event-based registration)
8. **Brain Model/Instance Separation**: Brain definitions (`brains/`) declare identity and capabilities; deployment instances (`apps/`) provide environment config

## Workspace Structure

The monorepo is managed by Turborepo with 9 workspace categories:

```
shell/          Core infrastructure — runtime, services, plugin framework
shared/         Reusable utilities, themes, UI components
entities/       Content type definitions — schema, adapter, generation handler
plugins/        Feature plugins with tools — CRUD, orchestration, infrastructure
layouts/        Page layout components — datasources, templates, page structure
sites/          Site packages — theme + layout + routes bundles
interfaces/     Interaction channels — how users talk to a brain
brains/         Brain definitions — identity, capabilities, presets, content model
apps/           Deployment instances — brain.yaml + .env
```

### Shell Packages (Core Infrastructure)

| Package                      | Purpose                                                                       |
| ---------------------------- | ----------------------------------------------------------------------------- |
| `shell/app`                  | High-level application framework (`defineConfig`, `defineBrain`, `handleCLI`) |
| `shell/core`                 | Central shell with plugin management and lifecycle                            |
| `shell/ai-service`           | AI agent with xstate conversation state machine (idle→processing→confirming)  |
| `shell/content-service`      | Template-based content generation                                             |
| `shell/conversation-service` | Conversation and message management with memory                               |
| `shell/entity-service`       | Entity CRUD, search, mutations, queries with vector support                   |
| `shell/identity-service`     | Brain character + anchor profile management                                   |
| `shell/job-queue`            | Background job processing with progress tracking                              |
| `shell/mcp-service`          | MCP server, tool/resource registration                                        |
| `shell/messaging-service`    | Event-driven pub/sub messaging                                                |
| `shell/plugins`              | Plugin base classes, context types, controlled API surface                    |
| `shell/templates`            | Template registry and management                                              |

### Shared Packages

| Package                       | Purpose                                                                                   |
| ----------------------------- | ----------------------------------------------------------------------------------------- |
| `shared/utils`                | Logging, markdown, permissions, Zod re-export                                             |
| `shared/ui-library`           | Preact UI components for site rendering                                                   |
| `shared/default-site-content` | Shared layout components (Footer, etc.)                                                   |
| `shared/theme-*`              | CSS themes (7 themes: default, brutalist, editorial, geometric, neo-retro, swiss, yeehaa) |
| `shared/test-utils`           | Test factories, mock helpers, `createSilentLogger()`                                      |
| `shared/image`                | Image processing utilities                                                                |
| `shared/eslint-config`        | Shared ESLint configuration                                                               |
| `shared/typescript-config`    | Shared TypeScript configuration                                                           |

### Plugin Packages (Capabilities)

| Package                    | Purpose                                           |
| -------------------------- | ------------------------------------------------- |
| `plugins/blog`             | Blog posts with RSS feeds, series, and publishing |
| `plugins/decks`            | Slide deck / presentation management              |
| `plugins/note`             | Personal knowledge capture                        |
| `plugins/link`             | Web content capture with AI extraction            |
| `plugins/portfolio`        | Portfolio project case studies                    |
| `plugins/social-media`     | Multi-provider social media posting               |
| `plugins/newsletter`       | Buttondown newsletter integration                 |
| `plugins/image`            | AI-powered image generation                       |
| `plugins/topics`           | AI-powered topic extraction                       |
| `plugins/summary`          | AI-powered content summarization                  |
| `plugins/site-builder`     | Static site generation (Preact + Tailwind CSS v4) |
| `plugins/content-pipeline` | Publishing queue with scheduling and retry        |
| `plugins/directory-sync`   | Import/export entities to/from file system        |
| `plugins/git-sync`         | Sync entities with Git repositories               |
| `plugins/analytics`        | Cloudflare analytics integration                  |
| `plugins/dashboard`        | Extensible widget system                          |
| `plugins/system`           | System tools (search, list, get, status)          |
| `plugins/wishlist`         | Unfulfilled user request tracking                 |
| `plugins/obsidian-vault`   | Obsidian template generation                      |
| `plugins/products`         | Product entity management                         |
| `plugins/site-content`     | AI-generated site section content                 |

### Layout Packages

| Package                | Purpose                                 |
| ---------------------- | --------------------------------------- |
| `layouts/professional` | Blog + decks + profile editorial layout |
| `layouts/personal`     | Blog + profile personal layout          |

Layouts arrange content from plugins into pages. They define datasources, templates, and page structure.

### Site Packages

Site packages bundle a theme + layout + routes + site plugin into a single deployable unit. Brain models reference a default site package; instances can override via `site:` in brain.yaml.

| Package                | Theme     | Layout       |
| ---------------------- | --------- | ------------ |
| `sites/default`        | default   | default      |
| `sites/yeehaa`         | brutalist | professional |
| `sites/ranger`         | default   | default+CTA  |
| `sites/mylittlephoney` | pink      | personal     |

### Interface Packages

| Package                | Purpose                                   |
| ---------------------- | ----------------------------------------- |
| `interfaces/cli`       | Command-line interface                    |
| `interfaces/discord`   | Discord bot interface                     |
| `interfaces/matrix`    | Matrix bot interface                      |
| `interfaces/mcp`       | MCP transport (stdio + HTTP)              |
| `interfaces/webserver` | HTTP server for static sites              |
| `interfaces/a2a`       | A2A protocol (Agent Card, JSON-RPC tasks) |

### Brain Definitions

| Package         | Brain        | Description                               |
| --------------- | ------------ | ----------------------------------------- |
| `brains/rover`  | Professional | Personal knowledge + professional content |
| `brains/relay`  | Team         | Team collaboration                        |
| `brains/ranger` | Collective   | Collective/organizational knowledge       |

Each brain uses `defineBrain()` to declare identity, capabilities (`[id, factory, config]` tuples), interfaces (`[id, constructor, envMapper]` tuples), presets, and permissions. Deployment instances in `apps/` resolve a brain definition with environment variables and brain.yaml overrides.

## Architectural Boundaries

```
brains/ ──imports──▶ plugins/, layouts/, interfaces/, shared/
layouts/ ──imports──▶ plugins/, shared/, shell/
plugins/ ──imports──▶ shared/, shell/     (NOT other plugins)
interfaces/ ──imports──▶ shared/, shell/  (NOT other interfaces)
shell/ ──imports──▶ shared/, other shell/
```

Enforced by dependency-cruiser rules:

- `no-plugin-to-plugin-imports` — plugins cannot import from other plugins
- `no-plugin-to-layout-imports` — plugins cannot depend on layouts
- `no-interface-to-interface-imports` — interfaces cannot import from other interfaces

## Entity Model

All content follows a unified entity pattern:

```typescript
// BaseEntity — common to all entities
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

**Frontmatter** contains all domain fields (title, description, author, status, etc.) stored in the markdown content. **Metadata** duplicates key fields (title, slug, status, publishedAt) for fast database queries.

**WithData types** (e.g., `BlogPostWithData`, `DeckWithData`) extend the entity with parsed `frontmatter` and `body` — created by datasources for template rendering.

**Enriched types** extend WithData with `url`, `typeLabel`, `listUrl`, `listLabel` fields added by site-builder before template rendering.

## Key Components

### Plugin System

**Plugin Types:**

- **CorePlugin**: Read-only — provides tools and resources
- **ServicePlugin**: Read/write — manages entities, registers adapters/datasources/handlers
- **InterfacePlugin**: User interaction — CLI, chat bots, web
- **MessageInterfacePlugin**: Specialized for message-based interfaces (Matrix, Discord)

**Registration Flow:**

1. PluginManager initializes plugins in dependency order
2. Plugins receive context with all shell services
3. Plugins register capabilities directly with registries

### Job Queue System

Background processing for long-running operations:

- **BaseJobHandler**: Base class for all job handlers with validation, progress reporting
- **BaseGenerationJobHandler**: Specialized for AI content generation (extends BaseJobHandler)
- **BaseEntityDataSource**: Standardized list/detail pattern with pagination and navigation

### Site Builder Pipeline

1. **DataSource** fetches entities → returns raw data
2. **Schema validation** (Zod) → validates/strips data
3. **Enrichment** (`enrichWithUrls`) → adds url/typeLabel/listUrl/listLabel
4. **Template rendering** (Preact SSR) → generates HTML
5. **Static output** → writes HTML files

### Messaging System

Event-driven pub/sub for cross-plugin communication:

- `entity:created`, `entity:updated`, `entity:deleted`
- `publish:execute`, `publish:report:success`, `publish:report:failure`
- `generate:execute`, `generate:report:success`, `generate:report:failure`
- `site-builder:build:completed`

## Data Flow

1. **User Input**: Received through any interface (CLI, Matrix, Discord, MCP client, Web)
2. **Agent Processing**: AI agent routes to appropriate tools
3. **Tool Execution**: Processes through registered handlers
4. **Service Layer**: Accesses entities, AI, job queue
5. **Response**: Delivered through the originating interface

## Testing Strategy

- **Unit Tests**: Behavioral testing with Bun test runner (~3000+ tests)
- **Plugin Testing**: `createServicePluginHarness()` for standardized plugin testing
- **Mock Utilities**: `createMockEntityService()`, `createSilentLogger()`, `createTestEntity()` from `@brains/test-utils`
- **Test Constraints**: No `--no-verify`, no `eslint-disable`, no `as any` casts

## Deployment

- **Development**: `bun run` with hot reloading
- **Production**: Docker containers on Hetzner Cloud with Caddy reverse proxy
- **CI/CD**: GitHub Actions with Terraform-managed infrastructure

## Documentation

- **Plugin Quick Reference**: `docs/plugin-quick-reference.md`
- **Theming Guide**: `docs/theming-guide.md`
- **Entity Model**: `docs/entity-model.md`
- **Messaging System**: `docs/messaging-system.md`
- **Refactoring Plans**: `docs/plans/`
