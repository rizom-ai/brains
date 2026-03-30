# Brains Project Roadmap

Last Updated: 2026-03-30

---

## Completed

### Professional-Brain v1.0 (2026-01)

Site builder, blog (17 essays, 3 series), decks, portfolio (8 case studies), topics, links, notes, social media, newsletter, analytics, dashboard, Discord/MCP/A2A interfaces, git sync, CMS, Hetzner deploy, 7 themes.

### Codebase Refactor (2026-02 — 2026-03)

Brain model/instance split (`defineBrain()` + `brain.yaml`), layouts workspace, BaseGenerationJobHandler, BaseEntityDataSource, EntityMutations extraction, theme-base, barrel export cleanup, lint cleanup. ~2,860 lines eliminated.

### Site Packages (2026-03)

Extracted theme + layout + routes into reusable packages: site-default, site-yeehaa, site-ranger, site-mylittlephoney. Brain models reference a default site; instances override via `brain.yaml`.

### Enable-Based Presets (2026-03)

Replaced `disable: [list]` with `preset: minimal | default | pro` + `add`/`remove`. Brain models define curated plugin subsets. Implemented for rover, ranger, relay.

### Git-Sync Merge (2026-03)

Merged `@brains/git-sync` into `@brains/directory-sync`. Single plugin handles file sync + git ops. Serialized with `withLock()`, `LeadingTrailingDebounce`, filesystem cache.

### Unified Entity Tools (2026-03)

Consolidated create/generate tools into `system_create` with prompt-driven routing. Plugin handlers own domain logic (series, dedup, URL capture). Standardized job types as `{entityType}:generation`. Removed ~8 plugin-specific tools, added `system_update` and `system_delete` with confirmation flows.

### Image Performance (2026-03)

Lazy loading + decode hints on image components. Sharp-based WebP conversion + responsive variants at build time. Shared images directory with filesystem cache. Custom image renderer in markdown pipeline.

### Unified Domain Config (2026-03)

Single top-level `domain` in brain.yaml replaces per-plugin URL duplication. Identity service derives productionUrl, previewUrl, A2A endpoint, CMS base_url.

### EntityPlugin + Entity Consolidation (2026-03)

New base class for content plugins. Migrated all content plugins to EntityPlugin: blog, decks, note, link, portfolio, wishlist, products, social-media, topics, summary. Added `derive()` for event-driven entities + `system_extract` tool. Extracted series from blog into standalone EntityPlugin with derive(). Moved entity plugins from `plugins/` to `entities/` workspace.

### MCP Bridge (2026-03)

`MCPBridgePlugin` base class for bridging upstream MCP servers into the brain. Spawns child process, discovers tools, prefixes + isolates errors. Notion and HackMD plugins validate the pattern.

### Other (2026-03)

- A2A interface (Agent Card, JSON-RPC, task manager, client tool)
- A2A authentication phase 1 (bearer tokens)
- Agent state machine (xstate conversations with confirmation)
- Varlock env validation
- Consistent secret handling (all secrets in brain.yaml)
- CMS excludes base notes (free-form markdown with `---`)
- Rover default site + seed content
- Obsidian bases/fileClasses integration
- Pre-compiled hydration for site builds
- mylittlephoney.com deployed to Hetzner
- MockShell migration (test harness replaces direct shell access)
- MCP resources (entity://{type}/{id}, brain://identity, brain://profile) + prompts + resource templates

### A2A Non-Blocking Messages (2026-03)

Default to async task flow — return "working" immediately, caller polls `tasks/get`. Stale task protection. Client polls transparently.

### System Tools as Framework (2026-03)

Moved system plugin from a plugin into shell-level registration (`shell/core/src/system/`). Tools, resources, prompts, instructions register directly on shell services. Removed the only plugin that needed `ai.query()` on context.

### Prompts as Entities (2026-03)

Prompts became a `prompt` entity type with EntityPlugin. Defaults materialize from code on first startup, then become editable. AI generation resolves prompt entities automatically. Phase 3 complete.

### Eval Overhaul (2026-03)

`mode: eval` replaces `preset: eval` — layers on any preset, brain models define `evalDisable`. Plugin eval configs replaced with one-line `eval.yaml`. Three-tier test case loading (shell → brain model → app instance) with ID deduplication. Markdown + comparison reporters with `--compare` and `--baseline` flags. ([plan](./plans/eval-overhaul.md))

### Plugin Hierarchy Simplification (2026-03)

All entity types in `entities/` as EntityPlugins (14 total). Types renamed (`Tool`, `Resource`, `Prompt`, `JobsNamespace`). `createTool` + `findEntityByIdentifier` in canonical packages. Duplicate job helpers deleted. Three sibling contexts (`BasePluginContext` → `EntityPluginContext`, `ServicePluginContext`, `InterfacePluginContext`). CorePlugin deleted, consumers merged into ServicePlugin. AI only on EntityPluginContext, templates only on ServicePluginContext.

### Blocking I/O Elimination — Phases 1–2 (2026-03)

Async FS in directory-sync and webserver. Webserver moved to child process. Worker thread for site builds evaluated and parked (Preact rendering is fast, real bottleneck is sequential route processing). See site-builder decoupling plan for the actual performance fix.

### Sync Tools Simplification (2026-03)

Unified `directory-sync_sync` replaces 3 separate tools (sync + git_sync + git_status → sync + status). Non-blocking sync via job queue. Auto-export always enabled (entities durable without autoSync). Orphan cleanup on initial sync only. Sync mutex prevents concurrent batches. IGitSync + IDirectorySync interfaces for clean test mocks.

### Site Builder — Phase 1 (2026-03)

Parallel route rendering with `pLimit(4)`. Routes are independent — different paths, content, output files. Replaced sequential `for...of` with `pLimit(4)` + `Promise.all`. Tailwind runs after all routes complete (unchanged).

### Tool-to-Resource Migration (2026-03)

Removed 5 read-only tools (`system_get-identity`, `system_get-profile`, `system_get-status`, `site-builder_list_routes`, `site-builder_list_templates`), replaced with MCP resources. Profile and site info embedded in agent system prompt. Agent invalidated on identity/profile/site-info entity changes.

### Target Entity Pattern (2026-03)

Promoted `targetEntityType`/`targetEntityId` from `options` bag to first-class fields on `system_create`. Enables "create X and attach to Y" as a general pattern. Removed the untyped `options` field.

### Deprecate Matrix (2026-03)

Removed Matrix interface entirely — code, Docker build layer (native binary), brain models, env schemas, docs. Chat SDK will replace it.

---

## Planned (Short-term)

Items at the same level can be done in parallel.

### In progress (other contributors)

- **Kamal Deploy** — replace Terraform + SSH + Caddy with Kamal on Hetzner. Blocked on Brain CLI for `brain init`. ([plan](./plans/deploy-kamal.md), [standalone plan](./plans/standalone-apps.md))
- **rizom.work** — new relay instance. Blocked on Kamal. ([plan](./plans/2026-03-14-rizom-work.md))

### Available

### ~~Deprecate Matrix~~ ✅

Removed. Matrix interface deleted from codebase, all brain models, Docker build, and docs.

### Brain CLI — Phase 1

Command-line tool for instance management and direct operations. `brain init` scaffolds standalone repos, `brain start` runs the brain, `brain list/get/sync/build` invoke tools without daemons. Prerequisite for standalone apps. ([plan](./plans/brain-cli.md))

### AT Protocol — Phases 1-2

Plugin skeleton, DID identity (`did:web`), outbound publishing (entities → PDS records), Bluesky cross-posting. Gives brains a Bluesky presence. ([plan](./plans/atproto-integration.md))

### Agent Directory — Phase 1

Agent contacts as entities with encrypted tokens. Manual discovery (Agent Card fetch). `a2a_call` resolves agent by name. Works without AT Protocol. ([plan](./plans/agent-directory.md))

### Eval Coverage Expansion

Add seed content to eval brain (posts, notes, links) so quality-dependent tests have data to work with. Add test cases for: system_update variations, system_search with filters, system_extract, conversation recall, error handling. Target: 90%+ pass rate with 70+ test cases.

### Search Quality — Phase 1

Tighten vector distance threshold, add FTS5 hybrid search (keyword + semantic). Immediate precision improvement. ([plan](./plans/search-quality.md))

### Content Insights

`system_insights` tool for topic distribution, publishing cadence, content health. Dashboard widget for visual overview. ([plan](./plans/content-insights.md))

### Entity History

`system_history` tool backed by git log. Show version history, retrieve old content, diff changes. No new storage — reads from existing git commits. ([plan](./plans/entity-history.md))

---

## Planned (Medium-term)

### Chat SDK Migration

Replace Discord + deprecated Matrix with unified ChatInterface using Vercel Chat SDK. ([plan](./plans/chat-interface-sdk.md))

### AT Protocol — Phases 3-6 + Agent Directory Phase 2

Inbound ingestion, decentralized discovery (replaces manual Agent Card fetch), cross-brain feeds, ambient federation. Agent directory auto-discovers peers via firehose. ([plan](./plans/atproto-integration.md), [agent directory plan](./plans/agent-directory.md))

### A2A Authentication (Phase 2+)

OAuth 2.0 Client Credentials, then Cloudflare mTLS. ([plan](./plans/2026-03-15-a2a-authentication.md))

### Multi-User & Permissions

User entities with cross-interface identity. Map Discord IDs, DIDs, emails to brain-level users with roles (anchor/trusted/public). Enables team brains, hosted rover ownership, audit trails. Backward compatible — single-owner brains unchanged. ([plan](./plans/multi-user.md))

### Hosted Rovers

Ranger provisions, Kubernetes runs. Hetzner K8s with Ingress-NGINX, scale-to-zero, Turso for per-rover databases. Shared Discord bot gateway. Wildcard DNS for `*.rover.rizom.ai`. ([plan](./plans/hosted-rovers.md))

### Local AI Runtime

Separate process for all AI/ML execution. Runs models locally (ONNX embeddings, Ollama/llama.cpp for text, Stable Diffusion for images, Sharp for optimization) or delegates to cloud APIs. Brain drops to ~200MB with zero native deps and zero API keys. Enables fully offline desktop brains and cheap hosted rovers. ([plan](./plans/embedding-service.md))

### npm Packages

Bundle brain models as publishable npm packages (`@brains/rover`, etc.). Single artifact with all workspace deps inlined, native deps as optionalDependencies. Enables desktop app and hosted rovers. Independent of Docker path. ([plan](./plans/npm-packages.md))

### Monitoring & Observability

Production monitoring for deployed brains. Health dashboard (polling `/health`), log aggregation (structured logs → central store), alerting (brain down, build failed, sync stuck). Builds on Kamal deploy — needed once instances run on subdomains.

### Search Quality — Phases 3-4

Better embedding model (bge-base-en-v1.5) + cross-encoder reranking. Depends on local AI runtime. ([plan](./plans/search-quality.md))

### Monetization

Open core + managed hosting. Free self-hosted, paid hosted rovers ($15-50/month). Stripe billing, auto-provisioning, admin dashboard. ([plan](./plans/monetization.md))

### Site Builder — Phases 2-4

Extract build engine into `@brains/site-engine` with renderer-agnostic `SiteEngineServices` interface. Plugin becomes thin orchestration. ([plan](./plans/site-builder-decoupling.md))

---

## Planned (Long-term)

### Astro Migration

Replace Preact builder with Astro behind `SiteEngineServices` interface. Content Collections from entity DB, island architecture for interactivity, native Tailwind + image optimization. Depends on site-builder Phases 2-4. ([plan](./plans/site-builder-decoupling.md))

### Desktop App (Electrobun)

Native desktop app via Electrobun (Bun-native framework). Brain IS the main process. Tray icon, dashboard, config editor, local CMS (Sveltia against brain-data, no OAuth), optional chat. ([plan](./plans/desktop-app.md))

### Ranger as Agent Registry

Central discovery: brains search ranger for agents by capability. Builds on AT Protocol discovery + hosted rovers.

### Web UI

Browser interface beyond static site.

### Obsidian Community Plugin

Chat, publish, generate from inside Obsidian via MCP HTTP.

---

## Dependency Graph

```
Short-term:
  brain-cli phase 1 → kamal-deploy → rizom.work
  atproto phases 1-2 (independent)
  agent-directory phase 1 (independent)
  eval-coverage (independent)
  search-quality phase 1-2 (independent)
  content-insights (independent)
  entity-history (independent)

Medium-term:
  atproto phases 3-6 + agent-directory phase 2
  multi-user (independent — enables team brains)
  chat-sdk (replaces discord)
  monetization (after kamal)
  search-quality phases 3-4 (after ai-runtime)
  site-builder phases 2-4
  npm-packages (parallel to docker)
  monitoring (after kamal)
  chat-sdk + atproto + ai-runtime ──→ hosted-rovers

Long-term:
  site-builder phases 2-4 → astro-migration
  npm-packages + chat-sdk + ai-runtime ──→ desktop-app
```
