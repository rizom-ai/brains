# mylittlephoney.com — New Rover Instance

## Overview

Create a new rover brain instance for mylittlephoney.com. Same `@brains/rover` brain model, different instance config — disable unused plugins via `brain.yaml`, override the theme via package resolution, connect Discord + MCP + A2A.

## Decisions

| Decision      | Choice                                                                 |
| ------------- | ---------------------------------------------------------------------- |
| Brain model   | `@brains/rover` (same as yeehaa.io)                                    |
| App directory | `apps/mylittlephoney/`                                                 |
| Content repo  | `rizom-ai/mylittlephoney-content` (already created)                    |
| Interfaces    | Discord + MCP + A2A + webserver (no Matrix)                            |
| CDN/DNS       | Cloudflare (infrastructure ready)                                      |
| Theme         | `@brains/theme-mylittlephoney` — overridden via brain.yaml package ref |
| Domain        | mylittlephoney.com                                                     |
| A2A           | Trusted peer of yeehaa.io                                              |

## Plugin Selection

Same rover brain, disable what's not needed via `brain.yaml` disable list:

| Plugin           | Include | Notes                           |
| ---------------- | ------- | ------------------------------- |
| system           | ✅      | Core                            |
| image            | ✅      |                                 |
| dashboard        | ✅      |                                 |
| blog             | ✅      |                                 |
| note             | ✅      |                                 |
| link             | ✅      |                                 |
| obsidian-vault   | ✅      | Content authored in Obsidian    |
| wishlist         | ✅      |                                 |
| git-sync         | ✅      |                                 |
| analytics        | ✅      |                                 |
| site-content     | ✅      |                                 |
| site-builder     | ✅      | Theme overridden via brain.yaml |
| directory-sync   | ✅      |                                 |
| decks            | ❌      |                                 |
| portfolio        | ❌      |                                 |
| topics           | ❌      |                                 |
| content-pipeline | ❌      |                                 |
| social-media     | ❌      |                                 |
| newsletter       | ❌      |                                 |
| matrix           | ❌      |                                 |

## Work Packages

### 1. Discord Bot Setup (manual, no code)

- [ ] Create Discord application at discord.com/developers
- [ ] Create bot user, get bot token
- [ ] Identify anchor user's Discord ID
- [ ] Set up Discord server / add bot to server

### 2. Theme: `shared/theme-mylittlephoney/`

Design direction: girly pink unicorn candy.

- [ ] Create package scaffolding (`package.json`, `tsconfig.json`, `src/index.ts`)
- [ ] Define palette tokens (pinks, purples, candy pastels, sparkle accents)
- [ ] Define semantic tokens (light + dark mode)
- [ ] Register in `@theme inline` block
- [ ] Test both light and dark modes

### 3. Persona & Seed Content

Define the mylittlephoney character/voice for the brain.

- [ ] Define brain character (personality, voice, interests, tone)
- [ ] Create seed content: `brain-character.md`, `anchor-profile.md`, `site-info.md`
- [ ] Place in `brains/rover/seed-content/` or `apps/mylittlephoney/seed-content/`

### 4. App Instance: `apps/mylittlephoney/`

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
    - matrix

  plugins:
    site-builder:
      themeCSS: "@brains/theme-mylittlephoney"
    git-sync:
      repo: rizom-ai/mylittlephoney-content
      authorName: mylittlephoney
      authorEmail: phoney@rizom.ai
    discord: {}
    webserver:
      productionDomain: https://mylittlephoney.com
    a2a:
      organization: rizom.ai
      trustedTokens:
        ${A2A_TOKEN_YEEHAA}: yeehaa
      outboundTokens:
        yeehaa.io: ${A2A_OUTBOUND_TOKEN_YEEHAA}

  anchors:
    - "cli:*"
    - "discord:ANCHOR_DISCORD_ID"
    - "mcp:stdio"

  permissions:
    rules:
      - pattern: "a2a:yeehaa"
        level: trusted
      - pattern: "a2a:*"
        level: public
  ```

- [ ] Create `.env` with required secrets
- [ ] Create deploy config (`deploy/brain.yaml`, `deploy/.env.production`)

### 5. A2A Peering

- [ ] Generate shared tokens for rover ↔ rover (yeehaa ↔ mylittlephoney)
- [ ] Configure yeehaa brain.yaml with mylittlephoney trusted tokens
- [ ] Configure mylittlephoney brain.yaml with yeehaa trusted tokens
- [ ] Test: mylittlephoney asks yeehaa rover to generate a blog post

### 6. DNS + Deploy

- [ ] Add mylittlephoney.com to Cloudflare account
- [ ] Note Zone ID for terraform config
- [ ] Update domain nameservers at registrar to Cloudflare
- [ ] Verify propagation
- [ ] Deploy: `bun run brain:deploy mylittlephoney hetzner deploy`

### 7. Codebase Housekeeping

- [ ] Update `docs/codebase-map.html` with new app + theme
- [ ] Verify `bun install` resolves all workspace dependencies
- [ ] Run full typecheck and lint

## Suggested Order

1. **Discord bot** — manual, no code dependencies, can start immediately
2. **Theme** — no code dependencies, can parallel with 1
3. **Persona & seed content** — creative step, can parallel with 1+2
4. **App instance** — depends on theme package existing + persona defined
5. **A2A peering** — after both instances can run
6. **DNS + deploy** — after app instance is ready
7. **Housekeeping** — final step
