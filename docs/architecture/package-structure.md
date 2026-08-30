# Package Structure

## Overview

The Brains repository is a monorepo with seven workspace directories (`shell/`, `shared/`, `entities/`, `plugins/`, `interfaces/`, `sites/`, and `packages/`). Each directory has a clear role.

```
brains/
├── shell/              # Core infrastructure & services
├── shared/             # Shared utilities, themes, UI components
├── entities/           # Content type definitions (entity plugins)
├── plugins/            # Service plugins (tools + integrations)
├── interfaces/         # User interaction layers (chat, web, MCP)
├── sites/              # Structural site packages (composition + routes + plugins)
└── packages/           # Published packages; brain-cli owns the canonical definition
```

A running brain is driven by a lightweight _instance directory_ centered on `brain.yaml`, with conventional support files like `.env`, `.env.example`, `.gitignore`, `tsconfig.json`, `package.json`, and optional deploy artifacts. The CLI resolves its explicit bundles against the canonical definition. Standalone instances are scaffolded with `brain init`; package-owned posture fixtures live under `packages/brain-cli/test-apps`.

## Shell (Core Infrastructure)

| Package                      | Purpose                                                                 |
| ---------------------------- | ----------------------------------------------------------------------- |
| `shell/core`                 | Plugin lifecycle, daemon registry, initialization                       |
| `shell/app`                  | Brain resolver, CLI runner, brain.yaml parsing                          |
| `shell/plugins`              | Base plugin classes, context types, test harnesses                      |
| `shell/entity-service`       | Entity CRUD, search, vector embeddings, frontmatter                     |
| `shell/ai-service`           | Agent state machine, conversation routing, tool execution               |
| `shell/content-service`      | Template rendering, content formatting                                  |
| `shell/conversation-service` | Chat history, conversation storage                                      |
| `shell/identity-service`     | Brain character, anchor profile                                         |
| `shell/mcp-service`          | MCP tool + resource registry, permission filtering                      |
| `shell/messaging-service`    | Pub/sub event bus                                                       |
| `shell/runtime-state`        | Runtime state store service (`RuntimeStateService`/`RuntimeStateStore`) |
| `shell/job-queue`            | Background job scheduling, progress events                              |
| `shell/templates`            | Template system, permission checks                                      |
| `shell/ai-evaluation`        | Eval runner, test cases, LLM judge                                      |

## Shared

| Package                    | Purpose                                                                    |
| -------------------------- | -------------------------------------------------------------------------- |
| `shared/utils`             | Zod, slugify, markdown, YAML, logging, IDs, and other low-level primitives |
| `shared/contracts`         | Shared result, job progress, and publish contracts                         |
| `shared/ui-library`        | React components (Header, Footer, Cards, CTA)                              |
| `shared/site-composition`  | Shared site composition contract and merge helpers                         |
| `shared/site-engine`       | Renderer-agnostic site build engine utilities                              |
| `shared/theme-base`        | `composeTheme()`, shared CSS utilities, Tailwind setup                     |
| `shared/theme-default`     | Simplified editorial default theme (warm neutrals)                         |
| `shared/theme-rizom`       | Rizom brand theme — amber + purple bioluminescent palette                  |
| `shared/image`             | Image schema, adapter, utilities                                           |
| `shared/deploy-support`    | Canonical deploy templates, script helpers, env parsing, and cert support  |
| `shared/test-utils`        | Mock factories, test harnesses                                             |
| `shared/eslint-config`     | Shared ESLint config                                                       |
| `shared/typescript-config` | Shared TS configs (root, library, instance)                                |

## Entities (EntityPlugin — content type definitions)

Entity plugins define content types with schemas, adapters, generation handlers, and datasources. They expose no tools — all CRUD goes through `system_create/update/delete`. If an entity type has exactly one operating service plugin and is not independently reused, it may live inside that service plugin as a compound package under `plugins/` instead of appearing here.

| Package                        | Purpose                                             |
| ------------------------------ | --------------------------------------------------- |
| `entities/note`                | Knowledge capture (note entity type)                |
| `entities/blog`                | Essays and articles                                 |
| `entities/decks`               | Presentations                                       |
| `entities/link`                | Curated bookmarks + URL capture                     |
| `entities/portfolio`           | Case studies                                        |
| `entities/topics`              | AI-powered tagging                                  |
| `entities/conversation-memory` | Conversation summaries, decisions, and action items |
| `entities/social-media`        | Social media posts                                  |
| `entities/wishlist`            | Feature request tracking                            |
| `entities/image`               | AI-generated images                                 |
| `entities/series`              | Derived from posts                                  |
| `entities/prompt`              | Editable AI prompts                                 |
| `entities/site-info`           | Site metadata                                       |
| `entities/agent-discovery`     | Agent + skill entities (A2A)                        |
| `entities/assessment`          | Derived assessment outputs (SWOT)                   |
| `entities/doc`                 | Generic docs entity backing `/docs`                 |
| `entities/document`            | Generated PDFs and publishable document attachments |

## Plugins (ServicePlugin — tools + infrastructure)

Plugins that provide MCP tools, orchestration, or infrastructure operations.

| Package                    | Purpose                                                          |
| -------------------------- | ---------------------------------------------------------------- |
| `plugins/site-builder`     | SSR static site generation                                       |
| `plugins/studio`           | Browser authoring routes + Studio config                         |
| `plugins/content-pipeline` | Publish orchestration, scheduling                                |
| `plugins/newsletter`       | Compound newsletter entity + Buttondown-backed service           |
| `plugins/playbooks`        | Compound playbook entity + runtime orchestration service         |
| `plugins/analytics`        | Cloudflare analytics + query tool                                |
| `plugins/dashboard`        | Widget system                                                    |
| `plugins/directory-sync`   | File + git sync                                                  |
| `plugins/obsidian-vault`   | Obsidian template generation                                     |
| `plugins/stock-photo`      | Unsplash stock photo search                                      |
| `plugins/site-content`     | Site section content generation                                  |
| `plugins/atproto`          | AT Protocol identity, publishing, discovery, feeds               |
| `plugins/atproto-registry` | Canonical Rizom AT Protocol lexicon registry                     |
| `plugins/notifications`    | Notification routing for transactional + administrative messages |

Note: system tools (create/update/delete/search/status) are registered directly on the shell, not a plugin. See `shell/core/src/system/`.

## Interfaces

| Package                | Purpose                                                                                             |
| ---------------------- | --------------------------------------------------------------------------------------------------- |
| `interfaces/chat-repl` | Interactive Ink-based chat REPL                                                                     |
| `interfaces/chat`      | Discord + Slack chat bot via the Chat SDK                                                           |
| `interfaces/email`     | Outbound-first Email interface with configurable Resend transport                                   |
| `interfaces/mcp`       | Model Context Protocol (stdio + HTTP)                                                               |
| `interfaces/web-chat`  | Bundled in-browser chat surface (default route `/chat`)                                             |
| `interfaces/webserver` | In-process Hono server: site pages, dashboard/Studio routes, API routes, and split health endpoints |
| `interfaces/a2a`       | Agent-to-Agent JSON-RPC (Agent Card, non-blocking tasks)                                            |

## Sites

Site definitions are structural-only bundles: layouts, routes, schema-first sections, initial content, entity display metadata, head scripts, and static assets. Themes live separately under `shared/theme-*` and are selected alongside the site in `brain.yaml`.

| Package              | Purpose                                                               |
| -------------------- | --------------------------------------------------------------------- |
| `sites/default`      | Default structural site, typically paired with `@rizom/theme-default` |
| `sites/personal`     | Personal site composition, blog-focused                               |
| `sites/professional` | Professional site composition, editorial + portfolio + decks          |
| `sites/rizom-ai`     | Consolidated Rizom brand site and its package-local chrome/runtime    |

## Canonical brain

`packages/brain-cli` owns the one built-in definition, ordered catalog, eight capability bundles plus policy-only `team`, recipe assets, test apps, and eval suites. Identity and deployment choices remain instance-owned.

## Packages

Standalone published packages.

| Package               | Purpose                                                                                                                                                                                                          |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/brain-cli`  | `@rizom/brain` — the published CLI: `brain init`, `brain start`, `brain diagnostics`, `brain eval`, `brain pin`. Bundles the runtime while `brain init` scaffolds the instance-local support files an app needs. |
| `packages/brains-ops` | `@rizom/ops` — operator CLI for private fleets: wildcard TLS bootstrap, age-encrypted per-user secrets, content repo auto-create, and multi-user deploy management.                                              |

## App instances (lightweight instance directories, NOT a workspace category)

Deployable Rizom app instances live in standalone repos (`rizom.ai`, `rizom.foundation`, `rizom.work`, `mylittlephoney`, and `yeehaa.io`). Shared site/theme/model packages stay in this monorepo and are consumed by those app repos through the published runtime packages. An app instance is a lightweight directory centered on `brain.yaml`; the monorepo does not currently ship an `apps/` directory.
