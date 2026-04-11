# Architecture Overview

Brains is a modular, plugin-based system for running AI-powered knowledge agents. Each running brain is an independently deployable MCP server with its own identity, content, capabilities, and interfaces.

At a high level:

```text
brain model + brain.yaml instance config = running brain
```

- **Brain model** (`brains/*`) decides what capabilities exist
- **Instance config** (`brain.yaml`) provides environment-specific settings
- **Shell packages** provide the runtime, services, and plugin framework
- **Plugins** add content types, integrations, and interfaces

## Core architecture principles

1. **MCP-first** — every brain is an MCP server and exposes tools, resources, prompts, and resource templates through the same core transport model.
2. **Entity-driven** — durable content lives as typed entities stored as markdown with frontmatter.
3. **Schema-first** — Zod schemas define config, entities, tool inputs, and API contracts.
4. **Plugin-based** — almost all product behavior is composed from EntityPlugins, ServicePlugins, and InterfacePlugins.
5. **Brain model / instance separation** — reusable models live in `brains/`; deployable instances live in `apps/` as lightweight instance packages centered on `brain.yaml`.
6. **Stable architectural boundaries** — plugin code should flow through `@brains/plugins` and shared packages rather than reaching directly into shell internals.

## Workspace structure

The monorepo is organized into 8 workspace categories:

```text
shell/          Core runtime, services, plugin framework
shared/         Reusable utilities, themes, UI components, test helpers
entities/       EntityPlugin packages for content types
plugins/        ServicePlugin packages for tools and integrations
sites/          Structural site packages (routes, plugins, inherited composition)
interfaces/     InterfacePlugin packages for transports and daemons
brains/         Brain model packages
packages/       Standalone distributable packages (for example @rizom/brain)
```

`apps/` is intentionally **not** a workspace category anymore. Each `apps/<name>/` directory is a lightweight instance package: `brain.yaml` plus conventional support files like `.env`, `.env.example`, `.gitignore`, `tsconfig.json`, `package.json`, `src/site.ts`, `src/theme.css`, and optional deploy artifacts, consumed by the CLI at runtime.

## Current package map

### Shell packages

| Package                      | Purpose                                                              |
| ---------------------------- | -------------------------------------------------------------------- |
| `shell/app`                  | Brain resolver, `defineBrain()`, instance loading, runtime bootstrap |
| `shell/core`                 | Core shell, lifecycle orchestration, system tools/resources/prompts  |
| `shell/ai-service`           | AI querying, orchestration, provider abstraction                     |
| `shell/content-service`      | Template-based content generation support                            |
| `shell/conversation-service` | Conversation state and message history                               |
| `shell/entity-service`       | Entity CRUD, indexing, search, embeddings                            |
| `shell/identity-service`     | Brain identity, anchor profile, URL derivation                       |
| `shell/job-queue`            | Background jobs, progress events, handler registration               |
| `shell/mcp-service`          | MCP tool/resource/prompt/template registration                       |
| `shell/messaging-service`    | Typed event bus used across plugins                                  |
| `shell/plugins`              | Base plugin classes, contexts, harnesses                             |
| `shell/templates`            | Template registry and resolution                                     |
| `shell/ai-evaluation`        | Eval runner, test cases, judges, reporting                           |

### Entity packages

Entity packages live in `entities/`. Most packages define one entity type; a few define more than one.

| Package                    | Entity type(s)                 | Notes                                 |
| -------------------------- | ------------------------------ | ------------------------------------- |
| `entities/blog`            | `post`                         | Essays, long-form publishing          |
| `entities/decks`           | `deck`                         | Presentation/deck content             |
| `entities/image`           | `image`                        | AI image generation                   |
| `entities/link`            | `link`                         | URL capture and extraction            |
| `entities/newsletter`      | `newsletter`                   | Newsletter content                    |
| `entities/note`            | `base`                         | General markdown notes / base notes   |
| `entities/portfolio`       | `project`                      | Case studies and portfolio entries    |
| `entities/products`        | `product`, `products-overview` | Product catalog content               |
| `entities/prompt`          | `prompt`                       | Editable AI prompt entities           |
| `entities/series`          | `series`                       | Derived post grouping                 |
| `entities/site-info`       | `site-info`                    | Site metadata                         |
| `entities/social-media`    | `social-post`                  | Social publishing content             |
| `entities/summary`         | `summary`                      | Conversation summaries                |
| `entities/topics`          | `topic`                        | Derived topic/tag entities            |
| `entities/wishlist`        | `wish`                         | Unfulfilled requests / backlog        |
| `entities/agent-discovery` | `agent`, `skill`               | Agent directory + discoverable skills |

### Service plugins

Service plugins live in `plugins/` and provide tools, handlers, routes, orchestration, or external integrations.

| Package                    | Purpose                               |
| -------------------------- | ------------------------------------- |
| `plugins/analytics`        | Analytics integration and insights    |
| `plugins/buttondown`       | Buttondown API integration            |
| `plugins/content-pipeline` | Publishing queue, scheduling, retries |
| `plugins/dashboard`        | Dashboard widgets and UI slots        |
| `plugins/directory-sync`   | File sync + git operations            |
| `plugins/hackmd`           | HackMD MCP bridge                     |
| `plugins/newsletter`       | Composite newsletter capability       |
| `plugins/notion`           | Notion MCP bridge                     |
| `plugins/obsidian-vault`   | Obsidian export/templates             |
| `plugins/site-builder`     | Static site build orchestration       |
| `plugins/site-content`     | Site section content generation       |
| `plugins/stock-photo`      | Stock-photo search and selection      |
| `plugins/examples`         | Reference patterns and examples       |

### Interface plugins

Interface packages live in `interfaces/`. Some chat-style interfaces use `MessageInterfacePlugin`, which is a specialized interface base class for conversational transports.

| Package                | Purpose                                               |
| ---------------------- | ----------------------------------------------------- |
| `interfaces/a2a`       | Agent-to-agent protocol, Agent Card, async tasks      |
| `interfaces/chat-repl` | Local chat REPL / development chat interface          |
| `interfaces/discord`   | Discord bot interface                                 |
| `interfaces/mcp`       | MCP transport over stdio and HTTP                     |
| `interfaces/webserver` | In-process web server for static files and API routes |

### Sites, themes, and brains

| Area             | Current packages                                                                                           |
| ---------------- | ---------------------------------------------------------------------------------------------------------- |
| `sites/`         | `default`, `personal`, `professional`, `yeehaa`, `rizom` (site compositions; may inherit from other sites) |
| `shared/theme-*` | `base`, `default`, `yeehaa`, `rizom`, `brutalist`, `editorial`, `geometric`, `neo-retro`, `swiss`          |
| `brains/`        | `rover`, `ranger`, `relay`                                                                                 |
| `packages/`      | `brain-cli` published as `@rizom/brain`                                                                    |

## Plugin model

Brains uses three primary plugin categories:

- **EntityPlugin** — defines an entity schema, markdown adapter, optional generation handler, optional derivation logic, templates, and datasources.
- **ServicePlugin** — provides tools, jobs, API routes, orchestration, and external service integrations.
- **InterfacePlugin** — provides user-facing transports and long-lived daemons.

### EntityPlugin behavior

Entity plugins are the default way content enters the system.

They can automatically register:

- entity type + schema + adapter
- generation handlers (`{entityType}:generation`)
- templates
- site datasources
- extract/derive handlers when `derive()` is implemented

Entity plugins intentionally do **not** expose their own CRUD tools. Creation, update, deletion, and extraction flow through shared system tools like `system_create`, `system_update`, `system_delete`, and `system_extract`.

### ServicePlugin behavior

Service plugins provide the system's operational surface area:

- external integrations
- background job handlers
- publishing pipelines
- MCP-bridged services
- specialized tools such as sync, stock photo search, or analytics insights

### InterfacePlugin behavior

Interface plugins are how users or other agents interact with a brain:

- MCP clients connect through `interfaces/mcp`
- chat users connect through `interfaces/discord` or `interfaces/chat-repl`
- browsers connect through `interfaces/webserver`
- peer agents connect through `interfaces/a2a`

## Runtime flow

A typical boot sequence looks like this:

1. `@rizom/brain` or the in-repo runtime loads a `brain.yaml`
2. `shell/app` resolves the referenced brain model from `brains/*`
3. The shell constructs core services (entities, jobs, MCP, identity, messaging, AI)
4. Plugins are instantiated and registered in dependency order
5. Entity types, tools, resources, prompts, datasources, and daemons are registered
6. Interfaces start their long-lived processes
7. The brain begins serving MCP, web, Discord, A2A, or local chat traffic

## Entity model

All durable content follows the same base pattern:

```ts
{
  id: string;
  entityType: string;
  content: string; // markdown, usually with YAML frontmatter
  metadata: object; // query-friendly subset of structured data
  contentHash: string;
  created: string; // ISO timestamp
  updated: string; // ISO timestamp
}
```

This makes it possible to share infrastructure across content types:

- one entity store
- one sync/export model
- one search pipeline
- one set of system CRUD tools
- one site-generation model

## Architectural boundaries

High-level dependency direction:

```text
brains/      -> entities/, plugins/, interfaces/, sites/, shared/
entities/    -> shared/, shell/plugins
plugins/     -> shared/, shell/plugins
interfaces/  -> shared/, shell/plugins
sites/       -> shared/, shell/*, other sites/ (explicit site composition and inheritance)
shell/       -> shared/, other shell/
```

Practical rule of thumb: when writing a plugin, prefer imports from `@brains/plugins` and shared packages instead of coupling directly to shell internals.

## Testing and quality

The project relies on:

- **Unit tests** with Bun
- **Plugin harnesses** for EntityPlugins, ServicePlugins, and InterfacePlugins
- **Mock helpers** from `@brains/test-utils`
- **Eval suites** for end-to-end agent behavior and multi-model comparisons
- **Type checking + linting** across the full monorepo via Turborepo

## Deployment model

Current deployment paths:

- **Local development** via Bun inside the monorepo
- **Published CLI** via `@rizom/brain`
- **Container deployment** for production brains
- **Hetzner-hosted deployments** today, with Kamal becoming the default deploy path

Each deployed instance stays lightweight at the source level: a brain model package plus a lightweight instance package centered on `brain.yaml`.

## Where to read next

- [Roadmap](./roadmap.md)
- [Brain model guide](./brain-model.md)
- [Entity model](./entity-model.md)
- [Theming guide](./theming-guide.md)
- [Plugin development patterns](./plugin-development-patterns.md)
- [Plugin quick reference](./plugin-quick-reference.md)
- [User-facing CLI docs](../packages/brain-cli/docs/getting-started.md)
