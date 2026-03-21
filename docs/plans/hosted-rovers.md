# Plan: Hosted Rover Instances (managed by Ranger)

## Vision

Ranger (the collective brain) provisions and manages hosted Rover instances for users. A user signs up, gets a personal Rover running on Rizom infrastructure, and talks to it via Discord — no bot setup, no tokens, no developer portal.

## Decisions

### Instance Model

- **One container per rover** on Fly.io (Machines API)
- Subdomain assigned: `{name}.rover.rizom.ai` — custom domains later
- Persistent volume per instance (brain-data + SQLite)
- Auto-stop idle machines for cost savings (Fly native)

### Preset

- Start with **minimal preset only** (8 plugins: system, note, link, wishlist, directory-sync, git-sync, mcp, a2a)
- No Discord in the rover itself — ranger handles Discord for hosted rovers
- Ranger is preset-aware — can offer different presets later

### Configuration

- Ranger **generates brain.yaml** — user never touches it
- `preset: minimal` hardcoded initially
- Ranger writes instance-specific config: subdomain, git repo, AI endpoint

### Discord — Shared Bot Gateway

One shared "Rover" Discord bot application (like MEE6/Carl-bot model):

- **One bot, many servers** — users click an invite link to add the Rover bot to their Discord server
- **Ranger is the gateway** — ranger's Discord bot receives all messages, looks up which rover owns that server, and proxies via A2A
- **Per-server mapping** — ranger stores: Discord server ID → rover A2A endpoint
- **Zero setup for users** — no bot tokens, no developer portal, just click "Add Rover"
- **Two modes**:
  - **Managed Discord** (default for hosted) — ranger proxies Discord ↔ rover via A2A
  - **Own Discord** (upgrade/self-hosted) — rover runs its own bot with its own token, full control

This means hosted rovers don't need a Discord plugin. They just need A2A. Messages arrive the same way regardless of source.

### AI

- **Rizom AI gateway** by default (central key, usage metered per instance)
- User can bring own API key later for custom models

### Identity Setup

- **Hybrid**: collect basics at signup (name, one-liner bio, email), seed the rover
- User refines everything else via conversation with their rover

### Git

- **Ranger creates the repo** (GitHub, under rizom-ai org)
- "Bring your own repo" as advanced option for self-hosted migrants

### User Access

- User talks to rover via **Discord** (through ranger's shared bot) or **A2A** (direct)
- Admin operations (upgrade preset, change config) through ranger

### Ranger's Role

- Ranger **is a brain** (`@brains/ranger`)
- Two new plugins:
  - **`rover-hosting`** — provisioning tools:
    - `create_rover` — provision container, repo, brain.yaml
    - `delete_rover` — tear down instance and resources
    - `upgrade_rover` — redeploy instance with a newer image tag
    - `list_rovers` — list managed instances
    - `get_rover_status` — health check
  - **`rover-gateway`** — Discord ↔ A2A proxy:
    - Maintains mapping: Discord server → rover A2A endpoint
    - Intercepts messages meant for rovers (not ranger itself)
    - Forwards via A2A, posts responses back
    - `link_server` — associate a Discord server with a rover instance
    - `unlink_server` — remove association
- Conversational management: "Hey Ranger, set me up with a rover" in Discord

### Onboarding Flow

```
1. User talks to Ranger in Discord: "I want a rover"
2. Ranger collects: name, bio, email
3. Ranger provisions: Fly container, git repo, brain.yaml with preset: minimal
4. Ranger seeds identity (anchor profile, brain character, site info)
5. Ranger sends user the bot invite link: "Add Rover to your server"
6. User clicks invite → Rover bot joins their Discord server
7. Ranger maps: user's server ID → rover A2A endpoint
8. User mentions @Rover in their server → ranger proxies → rover responds
```

### Lifecycle

- **Create + delete** to start
- Start/stop (suspend idle instances) added later if needed

### Versioning & Upgrades

- **Container image per release**: build and tag `ghcr.io/rizom-ai/rover:<version>` on each release
- **Ranger pins version per instance**: stores the image tag in instance metadata
- **`create_rover`** deploys the latest stable tag
- **`upgrade_rover`** tool redeploys an instance with a newer tag
- **No auto-upgrade** — upgrades are explicit, triggered through ranger
- **Rollback**: ranger can redeploy the previous tag if an upgrade breaks something
- **Version compatibility**: ranger checks that the target version supports the instance's preset/config before upgrading

## Prerequisites

1. **Enable-based presets** (`docs/plans/enable-presets.md`) — ranger needs to write `preset: minimal` in brain.yaml
2. **A2A protocol** — rovers must accept incoming agent requests for the gateway to work

## Open Questions (for later)

- Billing model — free tier? Usage-based? Flat monthly?
- Resource limits per instance (CPU, memory, storage)
- Backup/restore strategy
- Monitoring and alerting for managed instances
- User migration path from hosted to self-hosted (and vice versa)
- Git repo strategy at scale (per-repo vs monorepo with branches vs self-hosted Gitea)
- MCP access for hosted rovers (HTTP endpoint needed, minimal preset has no webserver)
