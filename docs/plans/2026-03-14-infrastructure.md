# Infrastructure: Varlock + Cloudflare CDN

## Overview

Two infrastructure improvements that benefit all brain instances. These are prerequisites for new deployments (mylittlephoney.com) but also improve existing ones (yeehaa.io, rizom.ai, recall.rizom.ai).

## 1. Varlock Env Management

Replace raw `.env` files with [varlock](https://varlock.dev/) for schema-driven env var management across the monorepo.

### Why

- Multiple apps (`professional-brain`, `collective-brain`, `team-brain`, + new instances) each have their own `.env` with overlapping secrets
- No validation — typos or missing vars only discovered at runtime
- AI agents (Claude) can't see config context without exposing secrets
- No secret scanning in pre-commit hooks

### Tasks

- [ ] Install varlock (`bun add -d varlock` at root)
- [ ] Create `.env.schema` at repo root with `@env-spec` annotations for shared vars (`ANTHROPIC_API_KEY`, `GITHUB_TOKEN`)
- [ ] Create per-app `.env.schema` files for app-specific vars (bot tokens, CDN keys)
- [ ] Configure `turbo.json` `globalEnv`/`env` keys for strict mode compatibility
- [ ] Add `varlock scan` to pre-commit hooks
- [ ] Migrate existing `.env` files to use varlock
- [ ] Update `example.env` / docs

## 2. Cloudflare CDN/DNS Provider

Add Cloudflare as an alternative CDN/DNS provider alongside Bunny. See `docs/plans/cloudflare-migration.md` for detailed Terraform implementation.

### Why

- Free tier (CDN, DNS, SSL) vs Bunny's per-GB pricing
- Larger edge network (300+ PoPs)
- DDoS protection included
- Single dashboard for DNS + CDN + security

### Tasks

- [ ] Create `deploy/providers/hetzner/terraform/modules/cloudflare-cdn-dns/` module
  - DNS records (proxied for CDN)
  - SSL settings (full strict)
  - Transform rules (MCP redirect)
- [ ] Add `cdn_provider` variable to `variables.tf` (default: `cloudflare`)
- [ ] Update `main.tf` with conditional module selection (Cloudflare vs Bunny)
- [ ] Update deployment docs with Cloudflare setup instructions
- [ ] Test with mylittlephoney.com domain first, then optionally migrate existing sites

## Suggested Order

1. **Varlock** first — improves DX for all subsequent work
2. **Cloudflare** second — needed before any new deployment
