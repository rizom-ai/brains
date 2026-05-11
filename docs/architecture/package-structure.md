# Package Structure

## Overview

The Brains repository is a monorepo with 8 workspace directories (`shell/`, `shared/`, `entities/`, `plugins/`, `interfaces/`, `sites/`, `brains/`, `packages/`). Each directory has a clear role in the architecture.

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

| Package                       | Purpose                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------- |
| `shared/utils`                | Zod, slugify, markdown, YAML, logging, IDs, progress (overloaded — see roadmap) |
| `shared/ui-library`           | Preact components (Header, Footer, Cards, CTA)                                  |
| `shared/rizom-ui`             | `@rizom/ui` — Rizom-brand UI primitives shared across app-owned Rizom variants  |
| `shared/site-composition`     | Shared site composition contract and merge helpers                              |
| `shared/site-engine`          | Renderer-agnostic site build engine utilities                                   |
| `shared/theme-base`           | `composeTheme()`, shared CSS utilities, Tailwind setup                          |
| `shared/theme-default`        | Simplified editorial default theme (warm neutrals)                              |
| `shared/theme-rizom`          | Rizom brand theme — amber + purple bioluminescent palette                       |
| `shared/cms-config`           | Shared CMS config types consumed by the `cms` plugin                            |
| `shared/product-site-content` | Product page layouts and templates                                              |
| `shared/image`                | Image schema, adapter, utilities                                                |
| `shared/mcp-bridge`           | Base class for upstream MCP integration                                         |
| `shared/deploy-support`       | Canonical deploy templates, script helpers, env parsing, and cert support       |
| `shared/test-utils`           | Mock factories, test harnesses                                                  |
| `shared/eslint-config`        | Shared ESLint config                                                            |
| `shared/typescript-config`    | Shared TS configs (root, library, instance)                                     |

## Entities (EntityPlugin — content type definitions)

Entity plugins define content types with schemas, adapters, generation handlers, and datasources. They expose no tools — all CRUD goes through `system_create/update/delete`.

| Package                        | Purpose                                                           |
| ------------------------------ | ----------------------------------------------------------------- |
| `entities/note`                | Knowledge capture (base entity type)                              |
| `entities/blog`                | Essays and articles                                               |
| `entities/decks`               | Presentations                                                     |
| `entities/link`                | Curated bookmarks + URL capture                                   |
| `entities/portfolio`           | Case studies                                                      |
| `entities/products`            | Product listings                                                  |
| `entities/topics`              | AI-powered tagging                                                |
| `entities/conversation-memory` | Conversation summaries, decisions, and action items               |
| `entities/social-media`        | Social media posts                                                |
| `entities/wishlist`            | Feature request tracking                                          |
| `entities/newsletter`          | Email newsletters                                                 |
| `entities/image`               | AI-generated images                                               |
| `entities/series`              | Derived from posts                                                |
| `entities/prompt`              | Editable AI prompts                                               |
| `entities/site-info`           | Site metadata                                                     |
| `entities/agent-discovery`     | Agent + skill entities (A2A)                                      |
| `entities/assessment`          | Derived assessment outputs (SWOT)                                 |
| `entities/doc`                 | Generic docs entity backing `/docs`                               |
| `entities/rizom-ecosystem`     | Entity-backed Rizom ecosystem section used by Rizom site variants |

## Plugins (ServicePlugin — tools + infrastructure)

Plugins that provide MCP tools, orchestration, or infrastructure operations.

| Package                    | Purpose                                                      |
| -------------------------- | ------------------------------------------------------------ |
| `plugins/site-builder`     | SSR static site generation                                   |
| `plugins/cms`              | Browser authoring routes + CMS config                        |
| `plugins/content-pipeline` | Publish orchestration, scheduling                            |
| `plugins/buttondown`       | Buttondown subscriber + newsletter                           |
| `plugins/newsletter`       | Composite plugin bundling the newsletter entity + buttondown |
| `plugins/analytics`        | Cloudflare analytics + query tool                            |
| `plugins/dashboard`        | Widget system                                                |
| `plugins/directory-sync`   | File + git sync                                              |
| `plugins/obsidian-vault`   | Obsidian template generation                                 |
| `plugins/notion`           | MCP bridge to Notion                                         |
| `plugins/hackmd`           | MCP bridge to HackMD                                         |
| `plugins/stock-photo`      | Unsplash stock photo search                                  |
| `plugins/site-content`     | Site section content generation                              |
| `plugins/examples`         | Reference plugin patterns (`@brains/plugin-examples`)        |

Note: system tools (create/update/delete/search/status) are registered directly on the shell, not a plugin. See `shell/core/src/system/`.

## Interfaces

| Package                | Purpose                                                                             |
| ---------------------- | ----------------------------------------------------------------------------------- |
| `interfaces/cli`       | Terminal REPL interface plumbing                                                    |
| `interfaces/chat-repl` | Interactive Ink-based chat REPL                                                     |
| `interfaces/discord`   | Discord chat bot                                                                    |
| `interfaces/mcp`       | Model Context Protocol (stdio + HTTP)                                               |
| `interfaces/webserver` | In-process Hono server: site pages, dashboard/CMS routes, API routes, and `/health` |
| `interfaces/a2a`       | Agent-to-Agent JSON-RPC (Agent Card, non-blocking tasks)                            |

## Sites

Site packages are structural-only bundles: layouts, routes, site plugins, entity display metadata, and static assets. Themes live separately under `shared/theme-*` and are selected alongside the site in `brain.yaml`.

| Package              | Purpose                                                                          |
| -------------------- | -------------------------------------------------------------------------------- |
| `sites/default`      | Default structural site for rover, typically paired with `@brains/theme-default` |
| `sites/personal`     | Personal site composition, blog-focused                                          |
| `sites/professional` | Professional site composition, editorial + portfolio + decks                     |
| `sites/rizom`        | Shared Rizom site core composed by the Rizom app instances                       |

## Brains

Brain models define what a brain IS — capabilities, interfaces, presets, identity.

| Package         | Purpose                                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------------------------ |
| `brains/rover`  | Reference brain model. Personal knowledge + professional content. Published as docker image and npm package. |
| `brains/ranger` | Internal brain model used by the extracted `rizom.ai` app. Public source, no published artifacts.            |
| `brains/relay`  | Internal brain model used by the extracted `rizom.foundation` app. Public source, no published artifacts.    |

## Packages

Standalone published packages.

| Package               | Purpose                                                                                                                                                                                                          |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/brain-cli`  | `@rizom/brain` — the published CLI: `brain init`, `brain start`, `brain diagnostics`, `brain eval`, `brain pin`. Bundles the runtime while `brain init` scaffolds the instance-local support files an app needs. |
| `packages/brains-ops` | `@rizom/ops` — operator CLI for managing rover-pilot fleets: wildcard TLS bootstrap, age-encrypted per-user secrets, content repo auto-create, multi-user deploy management.                                     |

## Apps (lightweight instance packages, NOT a workspace category)

Deployable Rizom app instances live in standalone repos (`rizom.ai`, `rizom.foundation`, `rizom.work`, `mylittlephoney`, and `yeehaa.io`). Shared site/theme/model packages stay in this monorepo and are consumed by those app repos through the published runtime packages. The `apps/<name>/` directories that remain here hold local runtime data (caches, brain-data) for development against extracted instances; they are not workspace packages.
