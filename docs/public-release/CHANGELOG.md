# Changelog

All notable changes to `brains` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows pre-1.0 versioning as documented in [STABILITY.md](STABILITY.md): minor versions can include breaking changes; patch versions are reserved for bug fixes and additive changes.

## [0.1.0] — Initial public release

The first public release of `brains`, after roughly a year of private development. The framework is feature-complete enough to run real personal AI agents in production, but the API surface is explicitly pre-stable. Expect breaking changes between minor versions until `1.0`.

### What ships in v0.1.0

#### Core framework

- **Shell** — orchestrator with plugin lifecycle, dependency injection, message bus, and shutdown handling
- **Entity service** — CRUD over typed markdown entities, SQLite storage with libSQL or better-sqlite3, full-text search, vector search, Drizzle ORM
- **AI service** — model-agnostic generation via Vercel AI SDK (Anthropic, OpenAI, OpenAI-compatible providers)
- **Job queue** — background job processing with batching, retries, and per-handler concurrency
- **Messaging service** — typed event-driven pub/sub
- **MCP service** — Model Context Protocol server with tools, resources, resource templates, and prompts
- **Identity service** — brain character and anchor profile, exposed via MCP resources
- **Templates** — view and template registry with content resolution
- **Plugins shell** — base classes for entity, service, interface, and bridge plugins, with a typed context hierarchy

#### Brain model

- **`@brains/rover`** — reference personal-knowledge brain model, including blog, links, decks, projects, notes, portfolio, topics, and social-media entities; site-builder, directory-sync, dashboard, analytics, content-pipeline, stock-photo, and example plugins; MCP, A2A, Discord, webserver, and CLI interfaces

#### Entity types

- `@brains/blog` — long-form posts with frontmatter, series support, AI generation
- `@brains/link` — bookmarks with title/description/topics, automatic URL capture
- `@brains/decks` — slide decks (markdown → HTML)
- `@brains/note` — free-form markdown notes
- `@brains/portfolio` — case-study entries with images
- `@brains/products` — product catalog entries
- `@brains/wishlist` — wishlist items
- `@brains/social-media` — multi-platform social posts
- `@brains/topics` — topic taxonomy with parent-child structure
- `@brains/series` — content groupings derived from blog posts
- `@brains/summary` — AI-generated content summaries
- `@brains/site-info` — singleton site identity
- `@brains/agent-discovery` — remote agent directory entries
- `@brains/image` — image entities with sharp-based variants
- `@brains/newsletter-entity` — newsletter content
- `@brains/prompt` — editable prompt entities (defaults materialize from code)

#### Service plugins

- `@brains/site-builder-plugin` — static site generation from entities, with theme + layout composition, image variants, and preview/production modes
- `@brains/directory-sync` — bidirectional markdown ↔ filesystem sync, optional git auto-commit/push, debounced batching
- `@brains/notion` — bridge plugin importing from Notion via MCP
- `@brains/obsidian-vault` — Obsidian vault export with bases and fileClasses
- `@brains/hackmd` — HackMD bridge plugin
- `@brains/buttondown` — Buttondown newsletter integration
- `@brains/analytics` — Cloudflare Web Analytics integration
- `@brains/dashboard` — admin dashboard interface for entity management
- `@brains/content-pipeline` — multi-stage content generation flows
- `@brains/stock-photo` — Unsplash/Pexels integration for image entities
- `@brains/site-content` — site content (about, contact) as singleton entities
- `@brains/plugin-examples` — minimal reference implementations

#### Interfaces

- `@brains/mcp` — MCP server with HTTP and stdio transports, anchored auth tokens
- `@brains/a2a` — Agent-to-Agent JSON-RPC interface with non-blocking task flow, agent cards, bearer token auth
- `@brains/discord` — Discord bot interface with slash commands and conversation state
- `@brains/webserver` — built-in HTTP server with site preview/production routing, image serving, dashboard mounting
- `@brains/chat-repl` — terminal chat REPL

#### CLI

- **`brain`** — command-line tool (`@brains/brain-cli`):
  - `brain init <name>` — scaffold a new brain instance
  - `brain start` — run the configured brain
  - `brain list <type>` — list entities
  - `brain get <type> <id>` — fetch an entity by ID/slug/title
  - `brain build` — produce a deployable Docker image
  - `brain deploy` — deploy to a configured provider
  - `--remote <url>` — execute against a remote brain via MCP

#### System tools (stable surface)

- `system_create` — create or AI-generate any entity
- `system_update` — modify an entity with confirmation flow
- `system_delete` — delete an entity with confirmation flow
- `system_get` / `system_list` / `system_search` — read access
- `system_extract` — derive entities from existing content
- `system_status` / `system_insights` — runtime introspection

#### Sites and layouts

- `@brains/site-default` — generic out-of-box site package
- `sites/personal` — simple blog-focused site
- `sites/professional` — editorial site composing blog, decks, and profile

#### Themes

- 7 generic themes: default, base, editorial, geometric, swiss, neo-retro, brutalist

#### Deployment

- Hetzner Cloud reference recipe (Terraform + Kamal-style deploy script)
- Single-process Docker image with bundled Caddy reverse proxy
- ARM64 and x64 builds

### Known limitations

- The plugin context shapes (`EntityPluginContext`, `ServicePluginContext`, `InterfacePluginContext`) are explicitly **unstable** and will change before `1.0`. Build third-party plugins with that in mind.
- Embedding model and FTS scoring weights may change between minor versions.
- Logging schema is not stable.
- Multi-tenant deployment is not supported. One brain per process.
- Windows is supported only via WSL2.

### Notes

- Apache-2.0 licensed throughout
- Pre-1.0: minor versions may include breaking changes (see [STABILITY.md](STABILITY.md) for what's stable today)
- Maintainer-only development mode (see [CONTRIBUTING.md](CONTRIBUTING.md))

[0.1.0]: https://github.com/rizom-ai/brains/releases/tag/v0.1.0
