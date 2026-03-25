# Brains Project Roadmap

Last Updated: 2026-03-25

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

---

## In Progress

### Entity Consolidation — Remaining

Newsletter split (entity + buttondown integration) and image migration (entity registration from shell into plugin, image_set-cover → system_set-cover). ([plan](./plans/entity-consolidation.md))

---

## Planned (Short-term)

Short-term items are ordered by dependency. Items at the same level can be done in parallel.

### 1. System Tools to Framework

Move system plugin from a plugin into shell-level registration. Tools, resources, prompts, instructions, and dashboard widgets register directly on shell services. Removes the only plugin that needed `ai.query()` on context. ([plan](./plans/system-to-framework.md))

### 2. Plugin Hierarchy Simplification

Replace 4 plugin classes with 3 siblings: IntegrationPlugin (tools), EntityPlugin (content + derive), InterfacePlugin (transports). One unified PluginContext. Delete CorePlugin, ServicePlugin, and three context types. ([plan](./plans/plugin-hierarchy-simplification.md))

### 3. Eval Overhaul

Replace `preset: eval` with `mode: eval` that layers on any preset. Two runners: agent (full brain) and handler (lightweight, no brain). Move 84% of agent evals to brain model level. Repo-level result store with markdown reports and comparison against baselines. ([plan](./plans/eval-overhaul.md))

### 4. Chat SDK Migration

Replace Matrix + Discord interfaces with single ChatInterface using Vercel Chat SDK. Depends on plugin hierarchy simplification (InterfacePlugin base class must be stable). Phase 1: deprecate Matrix. Phase 2: build `@brains/chat`. Must be compatible with hosted rovers' shared Discord gateway. ([plan](./plans/chat-interface-sdk.md))

### Agent Directory

Local agent contacts as entities. Encrypted outbound tokens. Discovery via Agent Card fetch. A2A client resolves agents by name. ([plan](./plans/agent-directory.md))

### Blocking I/O Elimination

Replace sync FS calls with async in webserver and directory-sync. Move site builds to worker thread so MCP/Discord stay responsive during builds. ([plan](./plans/blocking-io-elimination.md))

### rizom.work

New relay instance with Discord, rizom theme variations. ([plan](./plans/2026-03-14-rizom-work.md))

---

## Planned (Medium-term)

### A2A Authentication (Phase 2+)

OAuth 2.0 Client Credentials, then Cloudflare mTLS. ([plan](./plans/2026-03-15-a2a-authentication.md))

### Kamal Deploy (Core Brains)

Replace Terraform + SSH + Caddy with Kamal on Hetzner. Zero-downtime deploys, automatic SSL, DNS + CDN automation via Cloudflare/Route 53 hooks. One command: `kamal deploy`. Same cost (~$20/month for 3 instances). ([plan](./plans/deploy-kamal.md))

### Hosted Rovers

Ranger provisions, Kubernetes runs. Hetzner K8s with Ingress-NGINX, scale-to-zero, Turso for per-rover databases. Shared Discord bot gateway. Wildcard DNS for `*.rover.rizom.ai`. ([plan](./plans/hosted-rovers.md))

### Media Sidecar

Extract ONNX (embeddings) + Sharp (images) into single sidecar process. Brain drops to ~1GB. Enables affordable per-rover hosting and desktop app. ([plan](./plans/embedding-service.md))

---

## Planned (Long-term)

### Desktop App (Electrobun)

Native desktop app via Electrobun (Bun-native framework). Brain IS the main process. Tray icon, dashboard, config editor, local CMS (Sveltia against brain-data, no OAuth), optional chat. Presets and interfaces are orthogonal — any preset works with any interface. Replaces standalone binary plan. ([plan](./plans/desktop-app.md))

### Ranger as Agent Registry

Central discovery: brains search ranger for agents by capability. Builds on agent directory plugin + hosted rovers.

### Web UI

Browser interface beyond static site.

### Obsidian Community Plugin

Chat, publish, generate from inside Obsidian via MCP HTTP.

---

## Dependency Graph

```
entity-consolidation (remaining: newsletter split, image migration)
     ↓
1. system-to-framework (system tools → shell, removes AI from PluginContext)
     ↓
2. plugin-hierarchy-simplification (IntegrationPlugin + unified PluginContext)
     ↓
3. eval-overhaul (mode: eval, two runners, result store)
     ↓
4. chat-sdk (depends on stable InterfacePlugin hierarchy)

agent-directory ────────────────┐
                                ├──→ hosted-rovers (K8s)
chat-sdk + media-sidecar ──────┘
                    ↓
              desktop-app (Electrobun)

kamal-deploy (independent)
blocking-io (independent)
rizom.work (independent)
```
