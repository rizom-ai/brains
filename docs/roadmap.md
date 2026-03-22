# Brains Project Roadmap

Last Updated: 2026-03-22

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

---

## In Progress

### Entity Update & Delete Tools

Generic `entity_update` (with diff confirmation) and `entity_delete` (with title+preview confirmation) in system plugin. Tests first. ([plan](./plans/entity-update-delete.md))

---

## Planned (Short-term)

### Image Performance

Lazy loading, WebP conversion + resize with sharp, responsive srcset, fast `/images/*` serving path. Filesystem cache skips unchanged images. ([plan](./plans/image-performance.md))

### Agent Directory

Local agent contacts as entities. Encrypted outbound tokens. Discovery via Agent Card fetch. `agent_add`, `agent_list`, `agent_trust`, `agent_remove` tools. A2A client resolves agents by name. ([plan](./plans/agent-directory.md))

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
consistent-secrets ──────────────────────┐
                                         ▼
entity-update-delete                hosted-rovers
                                     ▲        ▲
deploy-mlp-hetzner              agent-dir  chat-sdk ──→ fly-migration
                                              ▲              ▲
image-performance ──→ media-sidecar ──────────┘              │
                                                    standalone-binary
```
