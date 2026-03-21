# Plan: Hosted Rover Instances (managed by Ranger)

## Vision

Ranger (the collective brain) provisions and manages hosted Rover instances for users. A user signs up, gets a personal Rover running on Rizom infrastructure, and interacts with it via Discord and A2A.

## Decisions

### Instance Model

- **One container per rover** on Fly.io (Machines API)
- Subdomain assigned: `{name}.rizom.ai` — custom domains later
- Persistent volume per instance (brain-data + SQLite)
- Auto-stop idle machines for cost savings (Fly native)

### Preset

- Start with **minimal preset only** (9 plugins: system, note, link, wishlist, directory-sync, git-sync, mcp, discord, a2a)
- Ranger is preset-aware — can offer different presets later

### Configuration

- Ranger **generates brain.yaml** — user never touches it
- `preset: minimal` hardcoded initially
- Ranger writes instance-specific config: subdomain, Discord bot token, git repo, AI endpoint

### AI

- **Rizom AI gateway** by default (central key, usage metered per instance)
- User can bring own API key later for custom models

### Identity Setup

- **Hybrid**: collect basics at signup (name, one-liner bio, email), seed the rover
- User refines everything else via conversation with their rover

### Discord

- **Own Discord bot per rover**
- Created programmatically on **Rizom Discord server** initially
- Each rover gets its own channel
- "Bring your own server" as later upgrade

### Git

- **Ranger creates the repo** (GitHub, under rizom-ai org)
- "Bring your own repo" as advanced option for self-hosted migrants

### User Access

- User talks to rover **directly** via Discord, A2A, MCP
- Admin operations (upgrade preset, change config) through ranger

### Ranger's Role

- Ranger **is a brain** (`@brains/ranger`)
- Provisioning is a **plugin** (`rover-hosting`) with MCP tools:
  - `create_rover` — provision container, repo, Discord bot, brain.yaml
  - `delete_rover` — tear down instance and resources
  - `upgrade_rover` — redeploy instance with a newer image tag
  - `list_rovers` — list managed instances
  - `get_rover_status` — health check
- Conversational management: "create a rover for jane@example.com" in Ranger Discord

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
2. **Chat SDK migration** (`docs/plans/chat-interface-sdk.md`) — if we want programmatic Discord bot provisioning

## Open Questions (for later)

- Billing model — free tier? Usage-based? Flat monthly?
- Resource limits per instance (CPU, memory, storage)
- Backup/restore strategy
- Monitoring and alerting for managed instances
- User migration path from hosted to self-hosted (and vice versa)
