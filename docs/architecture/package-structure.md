# Package Structure

## Overview

The Brains repository is a monorepo with 9 workspace directories. Each directory has a clear role in the architecture.

```
brains/
├── shell/              # Core infrastructure & services
├── shared/             # Shared utilities, themes, UI components
├── entities/           # Content type definitions (entity plugins)
├── plugins/            # Feature plugins with tools (service + core plugins)
├── interfaces/         # User interaction layers (chat, web, MCP)
├── layouts/            # Page layout components (professional, personal)
├── sites/              # Site packages (theme + layout + routes bundles)
├── brains/             # Brain model definitions
└── apps/               # Deployed brain instances
```

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

## Shared

| Package                       | Purpose                                                |
| ----------------------------- | ------------------------------------------------------ |
| `shared/utils`                | Zod, slugify, markdown, YAML, logging                  |
| `shared/ui-library`           | Preact components (Header, Footer, Cards, CTA)         |
| `shared/theme-base`           | `composeTheme()`, shared CSS utilities, Tailwind setup |
| `shared/theme-default`        | Rizom default theme (blue/orange)                      |
| `shared/theme-brutalist`      | CRT/neon green theme                                   |
| `shared/theme-*`              | Additional themes (editorial, swiss, geometric, etc.)  |
| `shared/default-site-content` | Default layouts, templates, routes                     |
| `shared/product-site-content` | Product page layouts and templates                     |

## Entities (EntityPlugin — content type definitions)

Entity plugins define content types with schemas, adapters, generation handlers, and datasources. They expose no tools — all CRUD goes through `system_create/update/delete`.

| Package                 | Purpose                              |
| ----------------------- | ------------------------------------ |
| `entities/note`         | Knowledge capture (base entity type) |
| `entities/blog`         | Essays and articles                  |
| `entities/decks`        | Presentations                        |
| `entities/link`         | Curated bookmarks + URL capture      |
| `entities/portfolio`    | Case studies                         |
| `entities/products`     | Product listings                     |
| `entities/topics`       | AI-powered tagging                   |
| `entities/summary`      | AI summaries                         |
| `entities/social-media` | Social media posts                   |
| `entities/wishlist`     | Feature request tracking             |

## Plugins (ServicePlugin — tools + infrastructure)

Plugins that provide MCP tools, orchestration, or infrastructure operations.

| Package                       | Purpose                             |
| ----------------------------- | ----------------------------------- |
| `plugins/system`              | Entity CRUD tools + search + status |
| `plugins/image-plugin`        | Image upload, generate, set-cover   |
| `plugins/site-builder-plugin` | SSR static site generation, CMS     |
| `plugins/site-content`        | Site pages and navigation           |
| `plugins/content-pipeline`    | Publish orchestration, scheduling   |
| `plugins/newsletter`          | Buttondown subscriber management    |
| `plugins/analytics`           | Cloudflare analytics + query tool   |
| `plugins/dashboard`           | Widget system                       |
| `plugins/directory-sync`      | File + git sync                     |
| `plugins/obsidian-vault`      | Obsidian integration                |

## Interfaces

| Package                | Purpose                                 |
| ---------------------- | --------------------------------------- |
| `interfaces/cli`       | Terminal REPL interface                 |
| `interfaces/matrix`    | Matrix chat bot                         |
| `interfaces/discord`   | Discord chat bot                        |
| `interfaces/mcp`       | Model Context Protocol (stdio + HTTP)   |
| `interfaces/webserver` | Static site preview + production server |
| `interfaces/a2a`       | Agent-to-Agent protocol                 |

## Layouts

| Package                | Purpose                                           |
| ---------------------- | ------------------------------------------------- |
| `layouts/professional` | Blog + decks + profile layout, editorial homepage |
| `layouts/personal`     | Blog + profile layout, personal homepage          |

## Sites

Site packages bundle a theme + layout + routes + site plugin into a deployable unit.

| Package                | Purpose                               |
| ---------------------- | ------------------------------------- |
| `sites/default`        | Default theme + default layout        |
| `sites/yeehaa`         | Brutalist theme + professional layout |
| `sites/ranger`         | Default theme + community CTA layout  |
| `sites/mylittlephoney` | Pink theme + personal layout          |

## Brains

Brain models define what a brain IS — capabilities, interfaces, presets, identity.

| Package         | Purpose                                           |
| --------------- | ------------------------------------------------- |
| `brains/rover`  | Professional brain (blog, portfolio, newsletters) |
| `brains/ranger` | Collective brain (community, products)            |
| `brains/relay`  | Team brain (topics, summaries, links)             |

## Apps

Deployed instances of brain models with instance-specific `brain.yaml` and `.env`.

| Package                   | Purpose                           |
| ------------------------- | --------------------------------- |
| `apps/professional-brain` | Yeehaa's Rover instance           |
| `apps/collective-brain`   | Rizom's Ranger instance           |
| `apps/team-brain`         | Rizom's Relay instance            |
| `apps/mylittlephoney`     | mylittlephoney.com Rover instance |
