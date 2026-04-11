# Package Structure

## Overview

The Brains repository is a monorepo with 8 workspace directories. Each directory has a clear role in the architecture.

```
brains/
├── shell/              # Core infrastructure & services
├── shared/             # Shared utilities, themes, UI components
├── entities/           # Content type definitions (entity plugins)
├── plugins/            # Service plugins (tools + integrations)
├── interfaces/         # User interaction layers (chat, web, MCP)
├── sites/              # Structural site packages (composition + routes + plugins)
├── brains/             # Brain model definitions
└── packages/           # Standalone npm packages (brain-cli → @rizom/brain)
```

`apps/` is **not** a workspace category. Each `apps/<name>/` is a lightweight instance package centered on `brain.yaml`, with conventional support files like `.env`, `.env.example`, `.gitignore`, `tsconfig.json`, `package.json`, and optional deploy artifacts, consumed by the `brain` CLI at runtime against the brain model package it references.

## Shell (Core Infrastructure)

| Package                      | Purpose                                                   |
| ---------------------------- | --------------------------------------------------------- |
| `shell/core`                 | Plugin lifecycle, daemon registry, initialization         |
| `shell/app`                  | Brain resolver, CLI runner, brain.yaml parsing            |
| `shell/plugins`              | Base plugin classes, context types, test harnesses        |
| `shell/entity-service`       | Entity CRUD, search, vector embeddings, frontmatter       |
| `shell/ai-service`           | Agent state machine, conversation routing, tool execution |
| `shell/content-service`      | Template rendering, content formatting                    |
| `shell/conversation-service` | Chat history, conversation storage                        |
| `shell/identity-service`     | Brain character, anchor profile                           |
| `shell/mcp-service`          | MCP tool + resource registry, permission filtering        |
| `shell/messaging-service`    | Pub/sub event bus                                         |
| `shell/job-queue`            | Background job scheduling, progress events                |
| `shell/templates`            | Template system, permission checks                        |
| `shell/ai-evaluation`        | Eval runner, test cases, LLM judge                        |

## Shared

| Package                       | Purpose                                                |
| ----------------------------- | ------------------------------------------------------ |
| `shared/utils`                | Zod, slugify, markdown, YAML, logging                  |
| `shared/ui-library`           | Preact components (Header, Footer, Cards, CTA)         |
| `shared/theme-base`           | `composeTheme()`, shared CSS utilities, Tailwind setup |
| `shared/theme-default`        | Rizom default theme (blue/orange)                      |
| `shared/theme-brutalist`      | CRT/neon green theme                                   |
| `shared/theme-*`              | Additional themes (editorial, swiss, geometric, etc.)  |
| `shared/product-site-content` | Product page layouts and templates                     |
| `shared/image`                | Image schema, adapter, utilities                       |
| `shared/mcp-bridge`           | Base class for upstream MCP integration                |
| `shared/test-utils`           | Mock factories, test harnesses                         |

## Entities (EntityPlugin — content type definitions)

Entity plugins define content types with schemas, adapters, generation handlers, and datasources. They expose no tools — all CRUD goes through `system_create/update/delete`.

| Package                    | Purpose                              |
| -------------------------- | ------------------------------------ |
| `entities/note`            | Knowledge capture (base entity type) |
| `entities/blog`            | Essays and articles                  |
| `entities/decks`           | Presentations                        |
| `entities/link`            | Curated bookmarks + URL capture      |
| `entities/portfolio`       | Case studies                         |
| `entities/products`        | Product listings                     |
| `entities/topics`          | AI-powered tagging                   |
| `entities/summary`         | AI summaries                         |
| `entities/social-media`    | Social media posts                   |
| `entities/wishlist`        | Feature request tracking             |
| `entities/newsletter`      | Email newsletters                    |
| `entities/image`           | AI-generated images                  |
| `entities/series`          | Derived from posts                   |
| `entities/prompt`          | Editable AI prompts                  |
| `entities/site-info`       | Site metadata                        |
| `entities/agent-discovery` | Agent + skill entities (A2A)         |

## Plugins (ServicePlugin — tools + infrastructure)

Plugins that provide MCP tools, orchestration, or infrastructure operations.

| Package                    | Purpose                            |
| -------------------------- | ---------------------------------- |
| `plugins/site-builder`     | SSR static site generation, CMS    |
| `plugins/content-pipeline` | Publish orchestration, scheduling  |
| `plugins/buttondown`       | Buttondown subscriber + newsletter |
| `plugins/analytics`        | Cloudflare analytics + query tool  |
| `plugins/dashboard`        | Widget system                      |
| `plugins/directory-sync`   | File + git sync                    |
| `plugins/obsidian-vault`   | Obsidian template generation       |
| `plugins/notion`           | MCP bridge to Notion               |
| `plugins/hackmd`           | MCP bridge to HackMD               |
| `plugins/stock-photo`      | Unsplash stock photo search        |

Note: system tools (create/update/delete/search/status) are registered directly on the shell, not a plugin. See `shell/core/src/system/`.

## Interfaces

| Package                | Purpose                                                      |
| ---------------------- | ------------------------------------------------------------ |
| `interfaces/cli`       | Terminal REPL interface plumbing                             |
| `interfaces/chat-repl` | Interactive Ink-based chat REPL                              |
| `interfaces/discord`   | Discord chat bot                                             |
| `interfaces/mcp`       | Model Context Protocol (stdio + HTTP)                        |
| `interfaces/webserver` | In-process Hono server: static site + API routes + `/health` |
| `interfaces/a2a`       | Agent-to-Agent JSON-RPC (Agent Card, non-blocking tasks)     |

## Sites

Site packages are structural-only bundles: layouts, routes, site plugins, entity display metadata, and static assets. Themes live separately under `shared/theme-*` and are selected alongside the site in `brain.yaml`.

| Package              | Purpose                                                                                                  |
| -------------------- | -------------------------------------------------------------------------------------------------------- |
| `sites/default`      | Default structural site for rover, typically paired with `@brains/theme-default`                         |
| `sites/personal`     | Personal site composition, blog-focused                                                                  |
| `sites/professional` | Professional site composition, editorial + portfolio + decks                                             |
| `sites/yeehaa`       | Yeehaa structural site built on the default composition, typically paired with `@brains/theme-brutalist` |
| `sites/rizom`        | Rizom multi-variant structural site, typically paired with `@brains/theme-rizom`                         |

Multi-variant site packages (like `sites/rizom`) accept a `variant` argument from `brain.yaml` and switch templates / structure per instance. Theme selection remains independent via `site.theme`.

## Brains

Brain models define what a brain IS — capabilities, interfaces, presets, identity.

| Package         | Purpose                                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------------------------ |
| `brains/rover`  | Reference brain model. Personal knowledge + professional content. Published as docker image and npm package. |
| `brains/ranger` | Internal brain model used by `apps/rizom-ai`. Public source, no published artifacts.                         |
| `brains/relay`  | Internal brain model used by `apps/rizom-foundation`. Public source, no published artifacts.                 |

## Packages

Standalone published packages.

| Package              | Purpose                                                                                                                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/brain-cli` | `@rizom/brain` — the published CLI: `brain init`, `brain start`, `brain diagnostics`, `brain eval`, `brain pin`. Bundles the runtime so app instances need no `package.json` of their own. |

## Apps (lightweight instance packages, NOT a workspace category)

App instances are deployment configurations, not workspace members. Each directory is a `brain.yaml` + `.env` + optional `deploy/` bundle that the `brain` CLI loads at runtime.

| Directory               | Purpose                                                                     |
| ----------------------- | --------------------------------------------------------------------------- |
| `apps/rizom-ai`         | Marketing site for the framework (ranger model + sites/rizom variant ai).   |
| `apps/rizom-foundation` | Manifesto / foundation site (relay model + sites/rizom variant foundation). |
