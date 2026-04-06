# Brains Project Roadmap

Last Updated: 2026-04-06

---

## Completed

### Rover v0.1 — yeehaa.io (2026-01)

Site builder, blog (17 essays, 3 series), decks, portfolio (8 case studies), topics, links, notes, social media, newsletter, analytics, dashboard, Discord/MCP/A2A interfaces, git sync, CMS, Hetzner deploy, 7 themes.

### Codebase Refactor (2026-02 — 2026-03)

Brain model/instance split (`defineBrain()` + `brain.yaml`), layouts workspace, BaseGenerationJobHandler, BaseEntityDataSource, EntityMutations extraction, theme-base, barrel export cleanup, lint cleanup. ~2,860 lines eliminated.

### Site Packages (2026-03)

Extracted theme + layout + routes into reusable packages: site-default, site-yeehaa, site-ranger, site-mylittlephoney. Brain models reference a default site; instances override via `brain.yaml`.

### Enable-Based Presets (2026-03)

Replaced `disable: [list]` with `preset: core | default | full` + `add`/`remove`. Brain models define curated plugin subsets. Implemented for rover, ranger, relay.

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

`mode: eval` replaces `preset: eval` — layers on any preset, brain models define `evalDisable`. Plugin eval configs replaced with one-line `eval.yaml`. Three-tier test case loading (shell → brain model → app instance) with ID deduplication. Markdown + comparison reporters with `--compare` and `--baseline` flags.

### Plugin Hierarchy Simplification (2026-03)

All entity types in `entities/` as EntityPlugins (14 total). Types renamed (`Tool`, `Resource`, `Prompt`, `JobsNamespace`). `createTool` + `findEntityByIdentifier` in canonical packages. Duplicate job helpers deleted. Three sibling contexts (`BasePluginContext` → `EntityPluginContext`, `ServicePluginContext`, `InterfacePluginContext`). CorePlugin deleted, consumers merged into ServicePlugin. AI only on EntityPluginContext, templates only on ServicePluginContext.

### Blocking I/O Elimination — Phases 1–2 (2026-03)

Async FS in directory-sync and webserver. Webserver moved in-process (Hono via Bun.serve). Worker thread for site builds evaluated and parked (Preact rendering is fast, real bottleneck is sequential route processing). See site-builder decoupling plan for the actual performance fix.

### Sync Tools Simplification (2026-03)

Unified `directory-sync_sync` replaces 3 separate tools (sync + git_sync + git_status → sync + status). Non-blocking sync via job queue. Auto-export always enabled (entities durable without autoSync). Orphan cleanup on initial sync only. Sync mutex prevents concurrent batches. IGitSync + IDirectorySync interfaces for clean test mocks.

### Site Builder — Phase 1 (2026-03)

Parallel route rendering with `pLimit(4)`. Routes are independent — different paths, content, output files. Replaced sequential `for...of` with `pLimit(4)` + `Promise.all`. Tailwind runs after all routes complete (unchanged).

### Tool-to-Resource Migration (2026-03)

Removed 5 read-only tools (`system_get-identity`, `system_get-profile`, `system_get-status`, `site-builder_list_routes`, `site-builder_list_templates`), replaced with MCP resources. Profile and site info embedded in agent system prompt. Agent invalidated on identity/profile/site-info entity changes.

### Target Entity Pattern (2026-03)

Promoted `targetEntityType`/`targetEntityId` from `options` bag to first-class fields on `system_create`. Enables "create X and attach to Y" as a general pattern. Removed the untyped `options` field.

### Stock Photo Plugin (2026-03)

ServicePlugin (`plugins/stock-photo/`) with provider abstraction (`StockPhotoProvider` interface). Unsplash as first provider. Two tools: `stock-photo_search` and `stock-photo_select`. Deduplication by sourceUrl, optional cover image targeting, download tracking per Unsplash ToS. Graceful degradation when API key absent. Registered in rover `full` preset.

### Deprecate Matrix (2026-03)

Removed Matrix interface entirely — code, Docker build layer (native binary), brain models, env schemas, docs. Chat SDK will replace it.

### Content Insights (2026-03)

Extensible `system_insights` tool with `InsightsRegistry` pattern. Core provides generic insights (overview, publishing-cadence, content-health). Plugins register domain-specific handlers: topics registers `topic-distribution`, analytics registers `traffic-overview`. One tool answers "how is my brain doing?" ([plan](./plans/content-insights.md))

### Entity History (2026-03)

`directory-sync_history` tool backed by git log. `log()` and `show()` methods on `IGitSync`. List commit history for any entity, retrieve content at specific version. No new storage — reads from existing git commits. ([plan](./plans/entity-history.md))

### Naming Cleanup (2026-03)

Removed "Personal Brain" from 60+ files across source code, READMEs, package.json descriptions, and docs. Deleted 4 obsolete deployment docs (Terraform/Caddy era).

### Documentation — Phase 1 (2026-03)

User-facing docs: getting started guide, brain.yaml reference, CLI reference, deployment guide. ([plan](./plans/documentation.md))

### Changesets + Package Versioning (2026-04)

Changesets for automated versioning, changelogs, and npm publishing. Marked 62 internal `@brains/*` packages as `private: true`. GitHub Actions release workflow creates "Version Packages" PRs and publishes `@rizom/brain` to npm on merge. Packages can be flipped to public later for plugin ecosystem.

### Agent Discovery + Skills (2026-04)

Agent directory merged into single `entities/agent-discovery/` package with two EntityPlugins (agent + skill). Agent Card extension for anchor profiles. Auto-create agents on A2A call. Skill entities derived from topics, served in Agent Card instead of raw tool names.

### Topics Simplification (2026-04)

Removed source tracking from topics (no merge logic, no contentHash bookkeeping). Batched `deriveAll()` — groups entities into batches, one LLM call per batch instead of per entity. 100 entities ≈ 5-7 calls instead of 100. Topics added to core preset.

### Unified AI Config (2026-04)

Single `AI_API_KEY` env var replaces `ANTHROPIC_API_KEY`/`OPENAI_API_KEY`/`GOOGLE_GENERATIVE_AI_API_KEY`. Provider auto-detected from model name. Default model: gpt-4.1 (OpenAI). `AI_IMAGE_KEY` for separate image generation key. Multi-model eval support with per-provider keys.

### MCP Tool Registry Fix (2026-04)

`registerTool()` always stores tools in the internal registry regardless of MCP transport permission level. Prevents interface `setPermissionLevel("public")` from silently dropping anchor tools. Same fix applied to `registerResource()`. Eval pass rate: 58.6% → 96.6%.

### Search & Embeddings (2026-04)

All 4 phases complete, removes the last native dep blocker for v0.1.0. Plan deleted on completion.

- **Phase 1** — Separate embedding database. Entity DB and embedding DB decoupled; legacy single-DB path removed.
- **Phase 2** — Online embedding provider. OpenAI `text-embedding-3-small` via `AI_API_KEY`. No local model download.
- **Phase 3** — FTS5 hybrid search. SQLite FTS5 virtual table joined with vector scores.
- **Phase 4** — Threshold tuning via `brain diagnostics search`.
- **ONNX/fastembed removed** — no native embedding deps in the bundle. Online embeddings only.

### Monitoring (2026-04)

All 3 phases complete. Production observability for deployed brains. Plan deleted on completion.

- **Phase 1 — Structured logging.** `Logger` gains JSON mode + optional log file (always JSON). All log output on stderr by default. Noisy "no handlers found" and job-progress messages dropped to debug. Eval judges use `Logger` instead of `console.error`. Configurable via `logging:` block in `brain.yaml`.
- **Phase 2 — Enriched health.** `/health` returns version, uptime, entity count, embedding count, AI provider/model, daemon statuses. Simplified `AppInfo` type — removed plugin/tool/interface lists (available via MCP resources).
- **Phase 3 — Usage tracking via logs.** `IEmbeddingService.generateEmbedding()` returns `{ embedding, usage }`. `AIService` and `EmbeddingJobHandler` log `ai:usage` structured events. `brain diagnostics usage` parses the log file, aggregates by provider/model.

### Composite Plugins (2026-04)

Last public-API change before v0.1.0 stabilizes. `CapabilityEntry` now accepts factories that return `Plugin | Plugin[]`; `brain-resolver` flattens arrays. One brain.yaml block configures an entity+service pair sharing one set of credentials. Reference composite `@brains/newsletter` bundles `@brains/newsletter-entity` + `@brains/buttondown` behind one `newsletter` capability id; rover migrated. Sub-plugins are gated by the composite's id, so add/remove from a preset enables or disables both at once.

---

## Rover 0.1 — First Public Release

The following items must be complete before the first public release:

| Item                       | Status        | Notes                                                                                                                                                                                                                              |
| -------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@rizom/brain` npm publish | Ready         | CLI, runtime, rover, polish items done. Needs: create @rizom npm org, publish. ([plan](./plans/npm-packages.md))                                                                                                                   |
| Search & Embeddings        | Done          | Separate embedding DB + OpenAI online embeddings + FTS5 hybrid + threshold tuning. ONNX/fastembed removed.                                                                                                                         |
| Rizom Sites                | In progress   | rizom.ai homepage prototype landed (single-file mock). Next: theme/site packages + apps/rizom-ai. ([plan](./plans/rizom-sites.md))                                                                                                 |
| Changesets + versioning    | Done          | Automated versioning, changelogs, npm publish workflow. 62 packages marked private.                                                                                                                                                |
| License                    | Done          | Apache-2.0. Maximum adoption for v0.1, can tighten later.                                                                                                                                                                          |
| Default AI model           | Done          | gpt-4.1 (OpenAI). One key for text + images.                                                                                                                                                                                       |
| Kamal Deploy (Phases 1-2)  | In progress   | Dockerfile.model + Caddy internal routing + health endpoint done. Needs: publish-images CI, instance CI pipeline.                                                                                                                  |
| Monitoring                 | Done          | Structured logging + enriched `/health` + usage tracking via logs.                                                                                                                                                                 |
| Eval pass rate ≥ 95%       | 96.6%         | 58 test cases. Claude haiku: 96.6%, GPT-4.1-mini: 89.7%. Multi-model eval support.                                                                                                                                                 |
| Naming cleanup             | Done          |                                                                                                                                                                                                                                    |
| Documentation — Phase 1    | Done          | Getting started, brain.yaml ref, deploy guide, CLI ref                                                                                                                                                                             |
| Public release cleanup     | Planned       | Orphan-commit clean tree to public repo. Includes README rewrite, CONTRIBUTING/SECURITY, STABILITY statement, end-to-end smoke test. ([plan](./plans/public-release-cleanup.md))                                                   |
| Composite plugins          | Done          | `CapabilityEntry` accepts factories returning `Plugin[]`. Reference composite `@brains/newsletter` bundles newsletter entity + buttondown service behind one capability id. Rover migrated. ([plan](./plans/composite-plugins.md)) |
| Stable API surface         | Mostly stable | brain.yaml schema, tools, entity types. Full surface documented in `STABILITY.md` (added during public release cleanup).                                                                                                           |

---

## Planned (Short-term)

Items at the same level can be done in parallel.

### In progress

- **@rizom/brain** — Single package: CLI + runtime + rover model. All polish items done. Blocked only on creating the `@rizom` npm org and running `npm publish`. ([plan](./plans/npm-packages.md))
- **Public release cleanup** — Orphan-commit the public-eligible subset of the monorepo into `rizom-ai/brains-temp`, double-rename to `rizom-ai/brains` once verified. Includes README rewrite, CONTRIBUTING/SECURITY/STABILITY content, fork-safe CI audit, and an end-to-end smoke test on a clean machine. ([plan](./plans/public-release-cleanup.md))
- **Kamal Deploy** — replace Terraform + SSH + Caddy with Kamal on Hetzner. `Dockerfile.model` + internal Caddy routing + `/health` already shipped. Next: publish-images workflow → first standalone instance via `brain init --deploy`. ([plan](./plans/deploy-kamal.md), [standalone plan](./plans/standalone-apps.md))
- **Rizom Sites** — split into rizom.ai (product, ranger), rizom.foundation (ideology, relay), rizom.work (commercial, ranger). rizom.ai homepage prototype landed (`docs/design/rizom-ai.html`), next step is theme-rizom-ai + sites/rizom-ai + apps/rizom-ai. rizom.ai on current infra, others via Kamal. ([plan](./plans/rizom-sites.md))

### External Plugin API

Public plugin API for `@rizom/brain`: library exports with .d.ts, runtime loading from brain.yaml, API version contract, `brain search`/`brain add` CLI, example plugin + docs. Enables third-party plugin ecosystem. ([plan](./plans/external-plugin-api.md))

### Composite Plugins

Composite factory functions that return multiple plugins from one config block. Fixes the newsletter + buttondown split: one capability ID, one brain.yaml override, two plugins registered. One-line resolver change. ([plan](./plans/composite-plugins.md))

### AT Protocol — Phases 1-2

Plugin skeleton, DID identity (`did:web`), outbound publishing (entities → PDS records), Bluesky cross-posting. Gives brains a Bluesky presence. ([plan](./plans/atproto-integration.md))

### Eval Coverage Expansion

---

## Planned (Medium-term)

### Chat SDK Migration

Replace Discord + deprecated Matrix with unified ChatInterface using Vercel Chat SDK. ([plan](./plans/chat-interface-sdk.md))

### AT Protocol — Phases 3-6 + Agent Directory Phase 2

Inbound ingestion, decentralized discovery (replaces manual Agent Card fetch), cross-brain feeds, ambient federation. Agent directory auto-discovers peers via firehose. ([plan](./plans/atproto-integration.md))

### A2A Authentication (Phase 2+)

OAuth 2.0 Client Credentials, then Cloudflare mTLS. ([plan](./plans/2026-03-15-a2a-authentication.md))

### Multi-User & Permissions

User entities with cross-interface identity. Map Discord IDs, DIDs, emails to brain-level users with roles (anchor/trusted/public). Enables team brains, hosted rover ownership, audit trails. Backward compatible — single-owner brains unchanged. ([plan](./plans/multi-user.md))

### Hosted Rovers

Ranger provisions, Kubernetes runs. Hetzner K8s with Ingress-NGINX, scale-to-zero, Turso for per-rover databases. Shared Discord bot gateway. Wildcard DNS for `*.rover.rizom.ai`. ([plan](./plans/hosted-rovers.md))

### Local AI Runtime

Separate process for all AI/ML execution. Runs models locally (ONNX embeddings, Ollama/llama.cpp for text, Stable Diffusion for images, Sharp for optimization) or delegates to cloud APIs. Brain drops to ~200MB with zero native deps and zero API keys. Enables fully offline desktop brains and cheap hosted rovers. ([plan](./plans/embedding-service.md))

### Compiled Binaries

Standalone executables via `bun build --compile`. CLI binary works now (101MB, no deps). Brain model binary needs path resolution fix. Alternative to npm for users who don't want Node/Bun. ([plan](./plans/compiled-binaries.md))

### Monitoring & Observability — Post-Release

Builds on Phases 1-2 (done) and Phase 3 (usage tracking). Health dashboard (polling enriched `/health`), log aggregation (JSON logs → central store), alerting (brain down, build failed, sync stuck, key expired, disk full), web dashboard showing usage charts and recent errors, remote heartbeat for fleet-wide view. Needed once instances run on subdomains via Kamal. ([plan](./plans/monitoring.md))

### Search Reranking

Cross-encoder re-scoring of top-N results on top of the completed FTS5 + vector hybrid search. Depends on local AI runtime for cost-effective reranking.

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
Rover 0.1 blockers:
  search & embeddings (done)
  monitoring phases 1-3 (done)
  eval pass rate ≥ 95% (done, 96.6%)
  documentation phase 1 (done)
  naming cleanup (done)
  ─────────────────────────
  REMAINING:
    public release cleanup (orphan commit + content prep + smoke test)
    @rizom/brain npm publish (manual: create org + publish)
    kamal-deploy phases 1-2 → rizom-sites (rizom.ai on current infra)

Short-term (parallel):
  kamal-deploy → rizom sites (foundation + work via Kamal)
  atproto phases 1-2 (independent)
  monitoring phase 3 (usage tracking, independent)

Medium-term:
  atproto phases 3-6 + agent-discovery phase 2
  multi-user (independent — enables team brains)
  chat-sdk (replaces discord)
  compiled-binaries (after npm packages)
  ai-runtime / sidecar (lightens brain model)
  monetization (after kamal)
  search reranking (after ai-runtime)
  site-builder phases 2-4
  monitoring post-release (after kamal + phase 3)
  chat-sdk + atproto + ai-runtime ──→ hosted-rovers

Long-term:
  site-builder phases 2-4 → astro-migration
  @rizom/brain + chat-sdk + ai-runtime ──→ desktop-app
```
