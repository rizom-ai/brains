# Rizom Sites — Three Domains, Three Brains

## Overview

Split Rizom's web presence into three focused sites:

| Site                 | Purpose                                           | Brain  | Deploy                         | Priority                  |
| -------------------- | ------------------------------------------------- | ------ | ------------------------------ | ------------------------- |
| **rizom.ai**         | Product — @rizom/brain landing, docs, install CTA | Ranger | Current infra (Hetzner/Docker) | 1st                       |
| **rizom.foundation** | Ideology — essays, vision, community              | Relay  | Kamal                          | 1st                       |
| **rizom.work**       | Commercial — consultancy, services                | Ranger | Kamal                          | 2nd (after the other two) |

All three share a Rizom theme family — visual kinship with per-site accents.

## Site-Ranger Split

The current `site-ranger` package has both product and community content. Split it:

- **Product half** (features, pricing, install CTA, docs links) → `site-rizom-ai`
- **Community/ideology half** (essays, vision, principles) → `site-rizom-foundation`

Both new packages start from site-ranger's existing code and diverge.

## Phase 1: rizom.ai (Product)

### Brain: Ranger

Ranger is the community/product brain — products, CTAs, onboarding. Fits the product landing page use case.

### Site: `@brains/site-rizom-ai`

Extract product-focused pages from site-ranger:

- Product overview / features
- Install CTA (`bun add -g @rizom/brain`)
- Getting started quick-link
- Documentation links
- Blog (product updates, releases)

### Theme: `@brains/theme-rizom-ai`

Rizom family base with product-specific accents. Shared visual language with foundation and work.

### Deploy: Current Hetzner/Docker infra

rizom.ai stays on the existing deployment pipeline. No Kamal dependency.

### Steps

1. Create `shared/theme-rizom-ai/` — Rizom family, product accents
2. Create `sites/rizom-ai/` — extract product half from site-ranger
3. Create app instance (brain.yaml, .env.schema, seed content)
4. Deploy to rizom.ai on existing infra
5. DNS: point rizom.ai to server

## Phase 2: rizom.foundation (Ideology)

### Brain: Relay

Relay is the team knowledge brain. Foundation shares knowledge, essays, vision.

### Site: `@brains/site-rizom-foundation`

Extract community/ideology pages from site-ranger:

- Essays, manifestos, principles
- Vision and mission
- Community content
- Knowledge base

### Theme: `@brains/theme-rizom-foundation`

Rizom family base with foundation-specific accents.

### Deploy: Kamal

First Kamal-deployed instance. Standalone instance repo.

### Steps

1. Create `shared/theme-rizom-foundation/` — Rizom family, foundation accents
2. Create `sites/rizom-foundation/` — extract community half from site-ranger
3. `brain init --model relay --deploy` → standalone instance repo
4. DNS: add rizom.foundation to Cloudflare
5. Deploy via Kamal

## Phase 3: rizom.work (Commercial)

### Brain: Ranger

Product/commercial brain for consultancy services.

### Deploy: Kamal

Second Kamal-deployed instance.

### Steps

1. Create `shared/theme-rizom-work/` — Rizom family, commercial accents
2. Create `sites/rizom-work/` — consultancy/services pages
3. `brain init --model ranger --deploy` → standalone instance repo
4. DNS: add rizom.work to Cloudflare
5. Deploy via Kamal

## Theme Architecture

All three themes extend a shared Rizom base:

```
shared/theme-rizom/         ← shared base (palette, typography, spacing)
  ├── theme-rizom-ai/       ← product accents
  ├── theme-rizom-foundation/ ← foundation accents
  └── theme-rizom-work/     ← commercial accents
```

## Prerequisites

- Kamal deploy working (for foundation + work)
- `brain init --deploy` scaffolding (done)
- DNS for all three domains managed (rizom.ai existing, foundation + work via Cloudflare)

## Order

1. Themes (shared base + ai + foundation)
2. site-rizom-ai (extract product half from site-ranger)
3. site-rizom-foundation (extract community half from site-ranger)
4. Deploy rizom.ai on current infra
5. Deploy rizom.foundation via Kamal
6. rizom.work (later — same pattern as foundation but with ranger)
