# Plan: Monetization

## Context

The brain system is open source. Anyone can run a brain on their own infrastructure. But hosted rovers (brains we run for users) need a business model.

## Model: Open Core + Managed Hosting

**Free**: the brain software. Docker images, npm packages, monorepo — all open source. Self-host on your own Hetzner, AWS, laptop. No artificial limits.

**Paid**: hosted rovers. We run your brain for you at `{name}.rover.rizom.ai`. You get: zero-ops deployment, automatic updates, managed backups, monitoring, CDN, SSL, custom domains.

This is the Supabase/PostHog/GitLab model — open source core, managed service for those who don't want to operate infrastructure.

## Why this works for brains

- **AI costs are the user's** — bring your own Anthropic/OpenAI API key. We don't pay for tokens, users do. Our cost is just compute + storage.
- **Per-brain cost is low** — a brain is a single Bun process + SQLite database. No Kubernetes per user (initially). Hetzner VPS at ~$5-10/month per brain.
- **The value is in the product, not the hosting** — site builder, AI generation, entity management, publishing pipeline. Users pay because the brain does useful work, not because servers are hard.
- **Self-hosting is a feature, not a leak** — self-hosters validate the product, contribute to the ecosystem, and some convert to hosted when they don't want to maintain it.

## Tiers

### Free (self-hosted)

Everything. No limits. Run your own brain on your own infra.

- Docker image / npm package
- All plugins, all interfaces
- Full AI capabilities (your API keys)
- Community support (GitHub, Discord)

### Starter ($15/month per brain)

Hosted rover with basics.

- Brain running at `{name}.rover.rizom.ai`
- 1 GB storage (brain-data)
- Daily git backups
- SSL + CDN
- Bring your own API keys
- Email support

### Pro ($30/month per brain)

Everything in Starter plus:

- Custom domain
- 10 GB storage
- Priority builds
- Analytics dashboard
- Discord/Bluesky interfaces included
- Priority support

### Team ($50/month per brain)

Everything in Pro plus:

- Multi-user (up to 5 anchors)
- Audit trail
- Team brain features (shared content, role-based access)
- API access

### Add-ons

- **Extra storage**: $2/GB/month
- **Extra users**: $10/user/month (beyond 5)
- **AI tokens included**: $20/month for bundled Anthropic tokens (so users don't need their own key)

## Cost structure

Per hosted brain (our cost):

| Item                               | Monthly cost |
| ---------------------------------- | ------------ |
| Hetzner VPS (shared, 2 vCPU, 4 GB) | ~$5-8        |
| Storage (1 GB brain-data)          | ~$0.10       |
| CDN (Cloudflare free tier)         | $0           |
| Git backup (GitHub private repo)   | $0           |
| DNS (Cloudflare)                   | $0           |
| Monitoring                         | ~$1-2        |
| **Total**                          | **~$7-10**   |

At $15/month Starter, margin is ~$5-8/brain. At $30/month Pro, margin is ~$20+/brain.

With scale (multiple brains per VPS), per-brain cost drops to ~$3-5.

## Revenue targets

| Milestone | Brains | MRR      | Notes                            |
| --------- | ------ | -------- | -------------------------------- |
| Launch    | 5-10   | $150-300 | Friends, early adopters          |
| Traction  | 50     | $1,500   | Word of mouth, content marketing |
| Growth    | 200    | $6,000   | Self-serve signup, team brains   |
| Scale     | 1,000  | $30,000  | K8s hosting, auto-provisioning   |

## What needs to be built

Most of the infrastructure already exists or is planned:

| Capability        | Status      | Plan                  |
| ----------------- | ----------- | --------------------- |
| Docker images     | In progress | deploy-kamal Phase 1  |
| Standalone apps   | Planned     | standalone-apps.md    |
| Kamal deploys     | In progress | deploy-kamal.md       |
| Custom domains    | Planned     | deploy-kamal Phase 3  |
| Multi-user        | Planned     | multi-user.md         |
| Monitoring        | Planned     | roadmap (medium-term) |
| Auto-provisioning | Planned     | deploy-kamal Phase 2+ |

### New (monetization-specific)

| Capability          | What                                                                |
| ------------------- | ------------------------------------------------------------------- |
| **Signup flow**     | Landing page → select model → configure → deploy                    |
| **Billing**         | Stripe integration — subscription management, invoices              |
| **Usage tracking**  | Storage, build minutes, entity count per brain                      |
| **Admin dashboard** | Ranger manages hosted rovers — provision, monitor, bill             |
| **Onboarding**      | `brain init` with hosted option — scaffolds and deploys in one step |

## Phasing

### Phase 1: Manual hosting (now → launch)

- Accept customers manually (email/Discord)
- Provision via `brain init` + Kamal deploy
- Billing via Stripe manually
- 5-10 customers

### Phase 2: Self-serve (after launch)

- Signup page at rizom.ai
- Automated provisioning (Hetzner API)
- Stripe subscription integration
- Auto-deploy on signup

### Phase 3: Scale (with hosted rovers plan)

- K8s-based hosting (scale-to-zero)
- Multi-brain per cluster
- Usage-based billing refinements
- Team features

## Not now

- **Marketplace** — plugins/themes for sale. Too early.
- **AI token resale** — bundling Anthropic tokens adds complexity and margin risk. Bring-your-own-key is simpler.
- **Enterprise** — SSO, SLA, dedicated infrastructure. Not until there's demand.

## Pricing validation

Before building billing:

1. Get 5 people to pay $15/month for a manually hosted brain
2. If they stay for 3+ months, the value is real
3. Then build self-serve
