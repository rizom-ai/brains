# Plan: Deploy mylittlephoney to Hetzner

## Context

Deploy mylittlephoney.com using the existing Hetzner deploy pipeline. Domain, CDN, Caddy all handled by the script. DNS is on AWS Route 53 (manual step).

## Prerequisites

`apps/mylittlephoney/deploy/.env.production` — brain secrets (ANTHROPIC_API_KEY, OPENAI_API_KEY, DISCORD_BOT_TOKEN, GIT_SYNC_TOKEN).

Everything else exists: `deploy/brain.yaml` has `domain: mylittlephoney.com`, `config.env` has Bunny CDN + Hetzner + Docker registry keys.

## Resource requirements

Measured in Docker: idle 1.85GB, spike 3.65GB. Dedicated CX22 VPS (4GB RAM, ~€7/mo).

## Steps

1. Create `apps/mylittlephoney/deploy/.env.production`
2. `deploy/providers/hetzner/deploy.sh mylittlephoney` — provisions VPS, builds + pushes Docker image, starts Caddy + brain container, creates Bunny CDN pull zone
3. Note the output: VPS IP and/or Bunny CDN hostname
4. In AWS Route 53, add records for `mylittlephoney.com`:
   - Without CDN: A record → VPS IP
   - With CDN: CNAME → Bunny CDN hostname
   - Also: `preview.mylittlephoney.com` → same target
5. Wait for DNS propagation — Caddy auto-provisions SSL on first request

## Verification

1. Site live at `mylittlephoney.com`
2. Preview + CMS at `preview.mylittlephoney.com`
3. Discord bot responds
4. Content syncs to GitHub
