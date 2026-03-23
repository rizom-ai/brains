# Brains Project Roadmap

Last Updated: 2026-03-23

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

Merged `@brains/git-sync` into `@brains/directory-sync`. Single plugin handles file sync + git ops. Serialized with `withLock()`, `LeadingTrailingDebounce`, filesystem cache. ([plan](./plans/merge-git-into-directory-sync.md))

### Unified Entity Tools (2026-03)

Consolidated create/generate tools into `system_create` with prompt-driven routing. Plugin handlers own domain logic (series, dedup, URL capture). Standardized job types as `{entityType}:generation`. Removed ~8 plugin-specific tools, added `system_update` and `system_delete` with confirmation flows.

### Image Performance (2026-03)

Lazy loading + decode hints on image components. Sharp-based WebP conversion + responsive variants at build time. Shared images directory with filesystem cache. Custom image renderer in markdown pipeline.

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

---

## In Progress

### A2A Non-Blocking Messages

Default to async task flow — return "working" immediately, caller polls `tasks/get`. Prevents Caddy timeouts on long agent conversations. Client polls transparently. ([plan](./plans/a2a-async-messaging.md))

### EntityPlugin — Third Plugin Type

New base class for content plugins that define entity types but expose no tools. Separate `entities/` workspace directory. Declarative registration of schema, adapter, handler, templates, datasources. ([plan](./plans/entity-plugin.md))

---

## Planned (Short-term)

### Simplify Series

Replace series entity with computed view from blog posts. First post provides cover image + excerpt. Eliminates series schema, adapter, manager, subscriptions. ([plan](./plans/simplify-series.md))

### Eval Restructure

Move 84% of evals from app level to brain model level. Generic tool/agent tests go to `brains/rover/test-cases/`. Instance-specific voice/context tests stay per-app. ([plan](./plans/eval-restructure.md))

### Eval Mode

Replace `preset: eval` with `mode: eval` that layers on any preset. Brain model defines `evalDisable` list — plugins with external side effects. ([plan](./plans/eval-mode.md))

### Agent Directory

Local agent contacts as entities. Encrypted outbound tokens. Discovery via Agent Card fetch. A2A client resolves agents by name. ([plan](./plans/agent-directory.md))

### rizom.work

New relay instance with Discord, rizom theme variations. ([plan](./plans/2026-03-14-rizom-work.md))

---

## Planned (Medium-term)

### Chat SDK Migration

Replace Matrix + Discord interfaces with single ChatInterface using Vercel Chat SDK. Phase 1: deprecate Matrix (removes native crypto). Phase 2: build `@brains/chat`. Adds Slack, Teams, Telegram, WhatsApp. ([plan](./plans/chat-interface-sdk.md))

### A2A Authentication (Phase 2+)

OAuth 2.0 Client Credentials, then Cloudflare mTLS. ([plan](./plans/2026-03-15-a2a-authentication.md))

### Hosted Rovers

Ranger provisions rover instances on Fly.io. Shared Discord bot gateway. Subdomain `{name}.rover.rizom.ai`. Minimal preset, A2A only. Hybrid identity setup at signup. ([plan](./plans/hosted-rovers.md))

### Media Sidecar

Extract ONNX (embeddings) + Sharp (images) into single sidecar process. Brain drops to ~1GB. Enables 2GB Fly machines. ([plan](./plans/embedding-service.md))

### Fly.io Migration

Move deployments from Hetzner to Fly after runtime slimdown. Prerequisite: media sidecar + Matrix deprecation. ([plan](./plans/deploy-fly-migration.md))

---

## Planned (Long-term)

### Standalone Binary

`bun build --compile` produces single executable per platform. Requires: no native deps (media sidecar extracted), no Matrix crypto. `./rover` + `brain.yaml` = running brain. ([plan](./plans/standalone-binary.md))

### Ranger as Agent Registry

Central discovery: brains search ranger for agents by capability. Builds on agent directory plugin + hosted rovers.

### Web UI

Browser interface beyond static site.

### Obsidian Community Plugin

Chat, publish, generate from inside Obsidian via MCP HTTP.

---

## Dependency Graph

```
unified-entity-tools ──→ entity-plugin ──→ eval-restructure
                                      ──→ simplify-series

a2a-async ──→ agent-directory ──→ hosted-rovers
                                      ▲
image-perf ──→ media-sidecar ──→ chat-sdk ──→ fly-migration
                                                    ▲
                                           standalone-binary
```
