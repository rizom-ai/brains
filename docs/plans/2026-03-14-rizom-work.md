# rizom.work — New Relay Instance

## Overview

Create a new relay brain instance for rizom.work with Discord-only messaging, Cloudflare deployment, and a theme that's a playful variation of the default theme (visually related to rizom.ai but distinct).

**Prerequisites:** Varlock + Cloudflare infrastructure (completed 2026-03).

## Decisions

| Decision      | Choice                                                      |
| ------------- | ----------------------------------------------------------- |
| Brain model   | `@brains/relay` (remove summary plugin)                     |
| App directory | `apps/rizom-work/`                                          |
| Content repo  | To be created (e.g. `rizom-ai/rizom-work-content`)          |
| Interfaces    | Discord only (no Matrix, CLI for local dev)                 |
| CDN/DNS       | Cloudflare (via infrastructure plan)                        |
| Theme         | New `shared/theme-rizom-work/` — variation of default theme |
| Anchor users  | New (to be created)                                         |
| Domain        | rizom.work (DNS not yet configured)                         |

## Changes to Relay Brain Model

- [ ] Remove `summary` plugin from relay's plugin list (outdated, needs future refactor)

## Work Packages

### 1. Theme: Rizom Variations

rizom.ai and rizom.work should look and feel the same but playfully different — shared base, per-site accent variations.

- [ ] Create `shared/theme-rizom-ai/` (extract current rizom.ai styling from default theme)
- [ ] Create `shared/theme-rizom-work/` (variation with different accents)
- [ ] Both extend `theme-default` as a base
- [ ] Ensure visual kinship while being distinct
- [ ] Update `collective-brain` (`apps/collective-brain/`) to use `@brains/theme-rizom-ai` instead of default theme

### 2. Discord Bot Setup

- [ ] Create Discord application at discord.com/developers (separate from mylittlephoney)
- [ ] Create bot user, get bot token
- [ ] Identify anchor user's Discord ID
- [ ] Set up Discord server for the bot (or add to existing)

### 3. Content Repo

- [ ] Create `rizom-ai/rizom-work-content` on GitHub

### 4. App Instance: `apps/rizom-work/`

- [ ] Create `package.json` with `@brains/relay` dependency
- [ ] Create `brain.yaml` (local dev config):
  - Brain: `@brains/relay`
  - Discord interface only
  - Git-sync to `rizom-ai/rizom-work-content`
  - Cloudflare deployment (`cdn_provider: cloudflare`)
  - Theme: `@brains/theme-rizom-work`
  - New anchor user (Discord ID)
- [ ] Create `deploy/brain.yaml` (production config)
- [ ] Create `.env.schema` with varlock annotations for required secrets:
  - `DISCORD_BOT_TOKEN`
  - `CLOUDFLARE_API_TOKEN`
  - `CLOUDFLARE_ZONE_ID`
  - `CLOUDFLARE_ACCOUNT_ID`
  - `GITHUB_TOKEN` (for git-sync)
  - `ANTHROPIC_API_KEY`
- [ ] Create seed content (`seed-content/brain-character.md`, `seed-content/site-info.md`)

### 5. DNS Configuration

- [ ] Add rizom.work to Cloudflare account
- [ ] Note Zone ID for config
- [ ] Update domain nameservers at registrar to Cloudflare
- [ ] Verify propagation

### 6. Codebase Housekeeping

- [ ] Update `docs/codebase-map.html` with new app + themes
- [ ] Verify `bun install` resolves all workspace dependencies
- [ ] Run full typecheck and lint

## Suggested Order

1. **Remove summary from relay** — quick prerequisite
2. **Content repo** — create on GitHub
3. **Discord bot** — can start immediately, no code dependencies
4. **Themes** (rizom-ai + rizom-work) — can parallel with 2-3
5. **App instance** — depends on theme + content repo
6. **DNS** — after Cloudflare provider is working (from infrastructure plan)
7. **Housekeeping** — final step
