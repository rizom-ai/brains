# mylittlephoney.com — New Rover Instance

## Overview

Create a new rover brain instance for mylittlephoney.com. Same `@brains/rover` brain model, different instance config — disable unused plugins via `brain.yaml`, apply a custom theme, connect Discord + A2A.

**Prerequisites:** [Infrastructure plan](./2026-03-14-infrastructure.md) (Varlock + Cloudflare) should be completed first.

## Decisions

| Decision      | Choice                                                           |
| ------------- | ---------------------------------------------------------------- |
| Brain model   | `@brains/rover` (same as yeehaa.io)                              |
| App directory | `apps/mylittlephoney/`                                           |
| Content repo  | `rizom-ai/mylittlephoney-content` (already created)              |
| Interfaces    | Discord + A2A + webserver (no Matrix)                            |
| CDN/DNS       | Cloudflare (via infrastructure plan)                             |
| Theme         | Custom `shared/theme-mylittlephoney/` — girly pink unicorn candy |
| Anchor users  | New (to be created)                                              |
| Domain        | mylittlephoney.com (DNS not yet configured)                      |
| A2A           | Trusted peer of yeehaa.io                                        |

## Plugin Selection

Same rover brain, just disable what's not needed:

| Plugin            | Include | Notes                       |
| ----------------- | ------- | --------------------------- |
| system            | ✅      | Core — every brain needs it |
| image             | ✅      |                             |
| dashboard         | ✅      |                             |
| blog              | ✅      |                             |
| note              | ✅      |                             |
| link              | ✅      |                             |
| obsidian-vault    | ✅      |                             |
| wishlist          | ✅      |                             |
| git-sync          | ✅      |                             |
| analytics         | ✅      |                             |
| professional-site | ✅      | Rethemed, no layout changes |
| site-builder      | ✅      |                             |
| decks             | ❌      |                             |
| portfolio         | ❌      |                             |
| topics            | ❌      |                             |
| content-pipeline  | ❌      |                             |
| social-media      | ❌      |                             |
| newsletter        | ❌      |                             |

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

- [ ] Create `brain.yaml`:

  ```yaml
  brain: "@brains/rover"
  domain: mylittlephoney.com

  disable:
    - decks
    - portfolio
    - topics
    - content-pipeline
    - social-media
    - newsletter

  plugins:
    a2a:
      organization: rizom.ai
      trustedTokens:
        ${A2A_TOKEN_YEEHAA}: yeehaa
      outboundTokens:
        yeehaa.io: ${A2A_OUTBOUND_TOKEN_YEEHAA}

  permissions:
    anchors:
      - "cli:*"
      - "discord:ANCHOR_DISCORD_ID"
    rules:
      - pattern: "a2a:yeehaa"
        level: trusted
      - pattern: "a2a:*"
        level: public
  ```

- [ ] Create `.env` with required secrets
- [ ] Create `.env.schema` with varlock annotations
- [ ] Create seed content (brain-character, anchor-profile, site-info)

### 4. A2A Peering

- [ ] Generate shared tokens for rover ↔ rover (yeehaa ↔ mylittlephoney)
- [ ] Configure yeehaa brain.yaml with mylittlephoney trusted tokens
- [ ] Configure mylittlephoney brain.yaml with yeehaa trusted tokens
- [ ] Test: mylittlephoney asks yeehaa rover to generate a blog post

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
3. **App instance** — depends on theme package existing
4. **A2A peering** — after both instances can run
5. **DNS** — after Cloudflare provider is working
6. **Housekeeping** — final step
