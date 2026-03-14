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
| Social media  | Instagram (new platform, in addition to LinkedIn)                |
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

### 4. Instagram + Threads Platform Support

Add Instagram and Threads as social media platforms in `plugins/social-media/`. The plugin already supports multiple platforms via the `PublishProvider` interface (LinkedIn is the only one currently). Both use Meta's Graph API and can share auth/client infrastructure.

**Shared Meta infrastructure:**

- [ ] Add `"instagram"` and `"threads"` to `platformSchema` enum in `src/schemas/social-post.ts`
- [ ] Add `metaConfigSchema` to `src/config.ts` (shared access token, Business account ID)
- [ ] Implement base `MetaClient` in `src/lib/meta-client.ts` (shared auth, token refresh)
- [ ] Add `META_ACCESS_TOKEN` to `.env.schema`

**Instagram:**

- [ ] Implement `InstagramClient` extending `MetaClient` in `src/lib/instagram-client.ts`
  - Image upload required (Instagram is image-first)
  - Two-step publish: create media container → publish
  - Carousel support (optional, future)
- [ ] Add Instagram AI template in `src/templates/instagram-template.ts`
  - Short captions, hashtag-heavy, emoji-friendly, image-required

**Threads:**

- [ ] Implement `ThreadsClient` extending `MetaClient` in `src/lib/threads-client.ts`
  - Text posts (up to 500 chars), images, video
  - Two-step publish: create media container → publish
- [ ] Add Threads AI template in `src/templates/threads-template.ts`
  - Concise, conversational, 500 char limit

**Registration:**

- [ ] Register both providers + templates in plugin initialization
- [ ] Update generation tool/handler to support new platforms

**Note:** Requires a Meta Business/Creator account with Instagram + Threads connected via Facebook Page.

### 5. DNS Configuration

- [ ] Add mylittlephoney.com to Cloudflare account
- [ ] Note Zone ID for config
- [ ] Update domain nameservers at registrar to Cloudflare
- [ ] Verify propagation

### 6. Codebase Housekeeping

- [ ] Update `docs/codebase-map.html` with new app + theme
- [ ] Verify `bun install` resolves all workspace dependencies
- [ ] Run full typecheck and lint

## Suggested Order

1. **Discord bot** — can start immediately, no code dependencies
2. **Theme** — no code dependencies, can parallel with 1
3. **Instagram platform** — independent of instance setup, benefits all rover/ranger instances
4. **App instance** — depends on theme package existing
5. **DNS** — after Cloudflare provider is working (from infrastructure plan)
6. **Housekeeping** — final step
