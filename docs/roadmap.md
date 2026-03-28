# Brains Project Roadmap

Last Updated: 2026-03-28

---

## Completed

### Professional-Brain v1.0 (2026-01)

Site builder, blog (17 essays, 3 series), decks, portfolio (8 case studies), topics, links, notes, social media, newsletter, analytics, dashboard, Matrix/Discord/MCP interfaces, git sync, CMS, Hetzner deploy, 7 themes.

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

---

## Planned (Short-term)

Short-term items are ordered by dependency. Items at the same level can be done in parallel.

### Site Builder Decoupling

Parallel route rendering with `pLimit` (immediate perf win). Extract build engine into `@brains/site-engine` with renderer-agnostic `SiteEngineServices` interface. Plugin becomes thin orchestration. Enables future Astro evaluation as alternative rendering engine. ([plan](./plans/site-builder-decoupling.md))

### Chat SDK Migration

Replace Matrix + Discord interfaces with single ChatInterface using Vercel Chat SDK. Phase 1: deprecate Matrix. Phase 2: build `@brains/chat`. Must be compatible with hosted rovers' shared Discord gateway. InterfacePlugin already extends BasePlugin directly — no dependency on hierarchy simplification. ([plan](./plans/chat-interface-sdk.md))

### AT Protocol Integration

Federated content distribution, portable identity (DIDs), Bluesky presence, inbound content ingestion, decentralized brain discovery, cross-brain feeds. Replaces planned agent directory with protocol-native discovery. A2A stays for directed RPC. ([plan](./plans/atproto-integration.md))

### rizom.work

New relay instance with Discord, rizom theme variations. ([plan](./plans/2026-03-14-rizom-work.md))

---

## Planned (Medium-term)

### A2A Authentication (Phase 2+)

OAuth 2.0 Client Credentials, then Cloudflare mTLS. ([plan](./plans/2026-03-15-a2a-authentication.md))

### Kamal Deploy + Standalone Apps

Replace Terraform + SSH + Caddy with Kamal on Hetzner. DNS + CDN automation via Cloudflare/Route 53 hooks. Publish brain model images to GHCR. Apps become standalone repos (brain.yaml + deploy.yml) — no monorepo workspace. Same pattern as hosted rovers and desktop app. ([plan](./plans/deploy-kamal.md))

### Hosted Rovers

Ranger provisions, Kubernetes runs. Hetzner K8s with Ingress-NGINX, scale-to-zero, Turso for per-rover databases. Shared Discord bot gateway. Wildcard DNS for `*.rover.rizom.ai`. ([plan](./plans/hosted-rovers.md))

### Local AI Runtime

Separate process for all AI/ML execution. Runs models locally (ONNX embeddings, Ollama/llama.cpp for text, Stable Diffusion for images, Sharp for optimization) or delegates to cloud APIs. Brain drops to ~200MB with zero native deps and zero API keys. Enables fully offline desktop brains and cheap hosted rovers. ([plan](./plans/embedding-service.md))

### Astro Migration

If spike succeeds (site-builder Phase 5), replace Preact builder with Astro behind `SiteEngineServices` interface. Content Collections from entity DB, island architecture for interactivity, native Tailwind + image optimization. Depends on site-builder decoupling Phases 2-4. ([plan](./plans/site-builder-decoupling.md))

---

## Planned (Long-term)

### Desktop App (Electrobun)

Native desktop app via Electrobun (Bun-native framework). Brain IS the main process. Tray icon, dashboard, config editor, local CMS (Sveltia against brain-data, no OAuth), optional chat. Presets and interfaces are orthogonal — any preset works with any interface. Replaces standalone binary plan. ([plan](./plans/desktop-app.md))

### Ranger as Agent Registry

Central discovery: brains search ranger for agents by capability. Builds on AT Protocol discovery + hosted rovers.

### Web UI

Browser interface beyond static site.

### Obsidian Community Plugin

Chat, publish, generate from inside Obsidian via MCP HTTP.

---

## Dependency Graph

```
site-builder-decoupling (parallel routes → engine extraction → Astro eval)

atproto (identity + publishing → discovery → federation)
  └──→ replaces agent-directory for brain discovery

atproto + chat-sdk + ai-runtime ──→ hosted-rovers (K8s)
                    ↓
              desktop-app (Electrobun)

chat-sdk (independent — InterfacePlugin already stable)
kamal-deploy (independent)
rizom.work (independent)
```
