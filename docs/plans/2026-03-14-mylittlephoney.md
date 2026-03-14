# mylittlephoney.com — New Rover Instance

## Overview

Create a new rover brain instance for mylittlephoney.com with Discord-only messaging, a custom pink unicorn candy theme, and Cloudflare deployment.

**Prerequisites:** [Infrastructure plan](./2026-03-14-infrastructure.md) (Varlock + Cloudflare) should be completed first.

## Decisions

| Decision      | Choice                                                           |
| ------------- | ---------------------------------------------------------------- |
| Brain model   | `@brains/rover` (as-is)                                          |
| App directory | `apps/mylittlephoney/`                                           |
| Content repo  | `rizom-ai/mylittlephoney-content` (already created)              |
| Interfaces    | Discord only (no Matrix)                                         |
| CDN/DNS       | Cloudflare (via infrastructure plan)                             |
| Theme         | Custom `shared/theme-mylittlephoney/` — girly pink unicorn candy |
| Anchor users  | New (to be created)                                              |
| Domain        | mylittlephoney.com (DNS not yet configured)                      |

## Work Packages

### 1. Discord Bot Setup

- [ ] Create Discord application at discord.com/developers
- [ ] Create bot user, get bot token
- [ ] Identify anchor user's Discord ID
- [ ] Set up Discord server for the bot (or add to existing)

### 2. Theme: `shared/theme-mylittlephoney/`

Design direction: girly pink unicorn candy.

- [ ] Create package scaffolding (`package.json`, `tsconfig.json`, `src/index.ts`)
- [ ] Define palette tokens (pinks, purples, candy pastels, sparkle accents)
- [ ] Define semantic tokens (light + dark mode)
- [ ] Register in `@theme inline` block
- [ ] Test both light and dark modes

### 3. App Instance: `apps/mylittlephoney/`

- [ ] Create `package.json` with `@brains/rover` dependency
- [ ] Create `brain.yaml` (local dev config):
  - Brain: `@brains/rover`
  - Discord interface only (disable Matrix)
  - Git-sync to `rizom-ai/mylittlephoney-content`
  - Cloudflare deployment (`cdn_provider: cloudflare`)
  - Theme: `@brains/theme-mylittlephoney`
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

### 4. DNS Configuration

- [ ] Add mylittlephoney.com to Cloudflare account
- [ ] Note Zone ID for config
- [ ] Update domain nameservers at registrar to Cloudflare
- [ ] Verify propagation

### 5. Codebase Housekeeping

- [ ] Update `docs/codebase-map.html` with new app + theme
- [ ] Verify `bun install` resolves all workspace dependencies
- [ ] Run full typecheck and lint

## Suggested Order

1. **Discord bot** — can start immediately, no code dependencies
2. **Theme** — no code dependencies, can parallel with 1
3. **App instance** — depends on theme package existing
4. **DNS** — after Cloudflare provider is working (from infrastructure plan)
5. **Housekeeping** — final step
