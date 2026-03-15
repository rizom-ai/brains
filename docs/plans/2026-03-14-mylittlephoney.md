# mylittlephoney.com — New Rover Instance

## Overview

Create a new rover brain instance for mylittlephoney.com. This requires restructuring the existing rover setup:

1. **Rename current rover → rover-pro** — the full-featured professional brain with blog, portfolio, newsletter, social media, etc.
2. **Create new rover** — a simpler brain model focused on core knowledge management (notes, links, decks, topics)
3. **Deploy rover as mylittlephoney** — Discord-only, custom theme, Cloudflare

**Prerequisites:** [Infrastructure plan](./2026-03-14-infrastructure.md) (Varlock + Cloudflare) should be completed first.

## Decisions

| Decision      | Choice                                                           |
| ------------- | ---------------------------------------------------------------- |
| Brain models  | `@brains/rover` (simple) + `@brains/rover-pro` (full)            |
| App directory | `apps/mylittlephoney/`                                           |
| Content repo  | `rizom-ai/mylittlephoney-content` (already created)              |
| Interfaces    | Discord + A2A (no Matrix, no webserver)                          |
| CDN/DNS       | Cloudflare (via infrastructure plan)                             |
| Theme         | Custom `shared/theme-mylittlephoney/` — girly pink unicorn candy |
| Anchor users  | New (to be created)                                              |
| Social media  | Instagram (new platform, in addition to LinkedIn)                |
| Domain        | mylittlephoney.com (DNS not yet configured)                      |
| A2A           | Trusted peer of yeehaa.io rover-pro                              |

## Brain Model Split

### rover-pro (rename of current rover)

Full professional brain with all plugins. Used by yeehaa.io.

**Plugins:**

- system, image, dashboard
- blog, decks, note, link, portfolio, topics
- content-pipeline, social-media, newsletter
- obsidian-vault, wishlist
- git-sync, analytics
- professional-site, site-builder

**Rename steps:**

- [ ] `brains/rover/` → `brains/rover-pro/`
- [ ] Update `package.json` name to `@brains/rover-pro`
- [ ] Update brain definition name
- [ ] Update yeehaa.io `brain.yaml` to use `@brains/rover-pro`
- [ ] Update CI/deploy scripts if they reference rover by name

### rover (new, simpler)

Core knowledge management brain. Used by mylittlephoney and other personal instances.

**Plugins:**

- system, image, dashboard
- note, link, decks, topics
- content-pipeline
- git-sync
- site-builder (with a simpler layout)

**No:** blog, portfolio, newsletter, social-media, obsidian-vault, wishlist, professional-site, analytics

**Create steps:**

- [ ] Create `brains/rover/` with new `package.json` (`@brains/rover`)
- [ ] Create brain definition with reduced plugin set
- [ ] Create seed content (brain-character, anchor-profile, site-info)
- [ ] Create `.env.schema`

## Work Packages

### 1. Brain Model Split

- [ ] Rename `brains/rover/` → `brains/rover-pro/`
- [ ] Create new `brains/rover/` with simple plugin set
- [ ] Verify both build and typecheck
- [ ] Update existing brain.yaml files

### 2. Discord Bot Setup

- [ ] Create Discord application at discord.com/developers
- [ ] Create bot user, get bot token
- [ ] Identify anchor user's Discord ID
- [ ] Set up Discord server for the bot (or add to existing)

### 3. Theme: `shared/theme-mylittlephoney/`

Design direction: girly pink unicorn candy.

- [ ] Create package scaffolding (`package.json`, `tsconfig.json`, `src/index.ts`)
- [ ] Define palette tokens (pinks, purples, candy pastels, sparkle accents)
- [ ] Define semantic tokens (light + dark mode)
- [ ] Register in `@theme inline` block
- [ ] Test both light and dark modes

### 4. App Instance: `apps/mylittlephoney/`

- [ ] Create `brain.yaml`:

  ```yaml
  brain: "@brains/rover"
  domain: mylittlephoney.com

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
- [ ] Create seed content

### 5. A2A Peering

- [ ] Generate shared tokens for rover ↔ rover-pro
- [ ] Configure yeehaa.io brain.yaml with mylittlephoney trusted tokens
- [ ] Configure mylittlephoney brain.yaml with yeehaa trusted tokens
- [ ] Test: mylittlephoney asks yeehaa rover-pro to generate a blog post

### 6. Instagram + Threads Platform Support

(Unchanged from original plan — see social media plugin work)

### 7. DNS Configuration

- [ ] Add mylittlephoney.com to Cloudflare account
- [ ] Note Zone ID for config
- [ ] Update domain nameservers at registrar to Cloudflare
- [ ] Verify propagation

### 8. Codebase Housekeeping

- [ ] Update `docs/codebase-map.html` with new brain models + app
- [ ] Verify `bun install` resolves all workspace dependencies
- [ ] Run full typecheck and lint

## Suggested Order

1. **Brain model split** — rename rover → rover-pro, create new rover
2. **Discord bot** — can start immediately after split
3. **Theme** — no code dependencies, can parallel with 2
4. **App instance** — depends on rover brain + theme
5. **A2A peering** — after both brains can run
6. **Instagram platform** — independent, benefits all instances
7. **DNS** — after Cloudflare provider is working
8. **Housekeeping** — final step
