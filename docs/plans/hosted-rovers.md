# Plan: Hosted Rover Instances

## Vision

A user signs up, gets a personal Rover running on Rizom infrastructure, and talks to it via Discord — no bot setup, no tokens, no developer portal.

## Architecture

```
Ranger (brain) — onboarding, directory, Discord gateway
  ↓ POST /rovers (HTTP)
Cluster (service) — spawns/monitors/scales rover processes
  ↓ Bun.spawn()
Rover (brain) — running, handling conversations
```

### Separation of concerns

| Component | What it is            | Purpose                                | Does NOT do          |
| --------- | --------------------- | -------------------------------------- | -------------------- |
| Rover     | Brain (personal)      | Content, conversation, identity        | Infrastructure       |
| Relay     | Brain (team)          | Shared knowledge, team collaboration   | Hosting              |
| Ranger    | Brain (collective)    | Discovery, onboarding, Discord gateway | Process management   |
| Cluster   | Service (not a brain) | Process lifecycle, health, scaling     | User-facing anything |

### Why cluster is a service, not a brain

Cluster has no identity, no knowledge, no conversation ability. It's pure infrastructure — spawn processes, monitor health, manage ports. It doesn't need the brain stack (shell, AI service, conversation service, identity, plugins). It's a lightweight Bun process with a simple HTTP API:

- Plain REST API — no A2A, no agent protocol (cluster takes orders, it doesn't think)
- Lives in `services/cluster` (not `brains/`)
- Single purpose, minimal runtime footprint
- Ranger calls it like any other HTTP service

## Decisions

### Instance Model

- **One child process per rover** — spawned by cluster on its host
- Each rover is an independent Bun process with its own memory space and crash boundary
- Subdomain `{name}.rover.rizom.ai`, custom domains later
- Database: Turso (libSQL) — one database per rover, no local volume management
- brain-data: git repo per rover (already exists for content sync)

### Why child processes, not containers

| Concern       | Containers (Docker/Fly)               | Child processes                                  |
| ------------- | ------------------------------------- | ------------------------------------------------ |
| Provisioning  | Docker API / Fly Machines API         | `Bun.spawn()`                                    |
| Isolation     | Full (filesystem, network)            | Process-level (separate memory, crash boundary)  |
| Overhead      | ~50-100MB per container               | ~0 overhead beyond the process itself            |
| Orchestration | Docker daemon / Fly infra             | Cluster manages directly                         |
| Complexity    | Container images, registries, volumes | Just spawn the same binary with different config |
| Cost at scale | $4-7.50/rover/month                   | $0 marginal (one VPS hosts many rovers)          |

### Database: Turso (libSQL)

Each rover gets its own Turso database. Turso is SQLite-compatible (libSQL), so the brain's Drizzle ORM queries work with minimal changes.

**Why Turso over local SQLite:**

- No persistent volume management — database lives in the cloud
- Built-in replication and backup
- Embedded replicas: local SQLite file syncs to cloud (fast reads, durable writes)
- Ranger can create/delete databases via API — no filesystem coordination
- Free tier: 500 databases, 9GB storage. Scaler ($29/month): 10,000 databases

**Per-rover setup:**

1. Ranger creates Turso database via API: `rovers-{name}`
2. Ranger generates brain.yaml with Turso connection URL
3. Ranger tells cluster to run the rover
4. Rover process connects using libSQL driver (drop-in SQLite replacement)

### On-demand spawning

Most rovers are idle most of the time. Clusters only run rovers that are actively in use.

- **Active rover**: running process, ~200MB
- **Idle rover**: no process, just Turso DB + git repo ($0)
- Message arrives for idle rover → cluster spawns process (~2-5 seconds cold start) → rover handles conversation → after N minutes idle, cluster kills process

At 1,000 users with 5-10% concurrency:

- ~50-100 concurrent rovers
- ~10-20GB RAM
- 2-3 Hetzner hosts

### Cost at scale

| Users | Concurrent | Hosts         | Database           | Total      |
| ----- | ---------- | ------------- | ------------------ | ---------- |
| 10    | 5          | 1x CX33 ($7)  | Turso free         | ~$7/month  |
| 50    | 10         | 1x CX33 ($7)  | Turso free         | ~$7/month  |
| 200   | 20         | 1x CX43 ($14) | Turso free         | ~$14/month |
| 500   | 50         | 2x CX33 ($14) | Turso scaler ($29) | ~$43/month |
| 1,000 | 100        | 3x CX33 ($21) | Turso scaler ($29) | ~$50/month |

AI API costs will dwarf infrastructure: 1,000 users × 5 conversations/month × ~$0.10 = ~$500/month.

### Preset

- Start with **minimal preset only** (system, note, link, wishlist, directory-sync, mcp, a2a)
- No Discord in the rover itself — ranger handles Discord for hosted rovers
- Ranger is preset-aware — can offer different presets later

### Configuration

- Ranger **generates brain.yaml** — user never touches it
- `preset: minimal` hardcoded initially
- Instance-specific config: subdomain, Turso database URL, git repo, AI endpoint

### Discord — Shared Bot Gateway

One shared "Rover" Discord bot application (like MEE6/Carl-bot model):

- **One bot, many servers** — users click an invite link to add the Rover bot to their Discord server
- **Ranger is the gateway** — ranger's Discord bot receives all messages, looks up which rover owns that server, and proxies via A2A
- **Per-server mapping** — ranger stores: Discord server ID → rover A2A endpoint (via cluster)
- **Zero setup for users** — no bot tokens, no developer portal, just click "Add Rover"
- **Two modes**:
  - **Managed Discord** (default for hosted) — ranger proxies Discord ↔ rover via A2A
  - **Own Discord** (upgrade/self-hosted) — rover runs its own bot with its own token, full control

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

## Ranger's Role

Ranger (`@brains/ranger`) handles the user-facing side:

- **`rover-provisioning`** plugin — high-level lifecycle:
  - `create_rover` — create Turso DB, git repo, brain.yaml, assign to cluster
  - `delete_rover` — tell cluster to stop, delete DB and repo
  - `list_rovers` — list all rovers with status (queries clusters via HTTP)
  - `get_rover_status` — health check (queries cluster via HTTP)
- **`rover-gateway`** plugin — Discord ↔ A2A proxy:
  - Maintains mapping: Discord server → rover name → cluster host
  - Intercepts messages meant for rovers (not ranger itself)
  - Forwards via A2A, posts responses back
  - `link_server` — associate a Discord server with a rover instance
  - `unlink_server` — remove association
- Conversational management: "Hey Ranger, set me up with a rover" in Discord

## Cluster's Role

Cluster (`services/cluster`) is a lightweight HTTP service that handles infrastructure:

- **REST API**:
  - `run_rover` — spawn rover process with given brain.yaml
  - `stop_rover` — graceful shutdown (SIGTERM)
  - `restart_rover` — stop + run
  - `list_running` — list active rover processes with resource usage
  - `get_status` — health of a specific rover (A2A ping)
- **Process lifecycle**:
  - Spawn: `Bun.spawn()` with rover-specific brain.yaml and port
  - Health: periodic A2A ping, restart on failure
  - Graceful shutdown: SIGTERM → rover cleans up → process exits
  - Crash recovery: monitors child processes, restarts on unexpected exit
  - Idle timeout: kill process after N minutes of inactivity
  - On-demand spawn: wake rover when A2A request arrives for idle instance
- **Resource management**:
  - OS-level per-process memory limits (cgroups)
  - Port allocation for rover A2A/MCP endpoints
  - Reports capacity to ranger (how many more rovers can fit)
- **Plain HTTP** — ranger calls cluster REST endpoints, no agent protocol needed

## Onboarding Flow

```
1. User talks to Ranger in Discord: "I want a rover"
2. Ranger collects: name, bio, email
3. Ranger provisions: Turso database, git repo, brain.yaml with preset: minimal
4. Ranger picks a cluster (least loaded) and calls: POST /rovers
5. Cluster spawns rover process
6. Ranger seeds identity (anchor profile, brain character, site info) via A2A to rover
7. Ranger sends user the bot invite link: "Add Rover to your server"
8. User clicks invite → Rover bot joins their Discord server
9. Ranger maps: user's server ID → rover name → cluster host
10. User mentions @Rover in their server → ranger proxies via A2A to rover
```

## Scaling

### Single cluster (start here)

One Hetzner VPS running ranger + one cluster. Cluster spawns rovers as child processes. Handles up to ~50 concurrent rovers.

### Multi-cluster

Add more VPS instances, each running a cluster. Ranger load-balances across clusters:

```
Ranger (host A)
  ├── Cluster-1 (host A, local) — 30 active rovers
  ├── Cluster-2 (host B, HTTP) — 25 active rovers
  └── Cluster-3 (host C, HTTP) — 40 active rovers
```

Ranger picks cluster for new rovers based on reported capacity. Rover migration between clusters = stop on old, start on new (Turso DB is cloud-hosted, no data to move).

### Versioning & Upgrades

- **Single binary per cluster**: all rovers on a cluster run the same `brains` binary
- **Upgrades are per-cluster**: deploy new version to the VPS, cluster restarts active rovers
- **Rolling upgrade across clusters**: upgrade one cluster at a time
- **No per-rover versioning initially** — all rovers on a cluster share the version

### DNS + CDN

Each rover subdomain goes through Cloudflare (same as core brains):

- `{name}.rover.rizom.ai` → Cloudflare (proxied) → cluster host IP
- Cluster reverse-proxies to the rover's A2A/MCP port
- CDN caches static assets, bypasses API routes
- DNS automation via Cloudflare API (same pattern as Kamal deploy hooks)

## Prerequisites

1. **Enable-based presets** — ranger needs to write `preset: minimal` in brain.yaml (done)
2. **A2A protocol** — rovers must accept incoming agent requests (done)
3. **Media sidecar** — brain process needs to be lightweight (~200MB per rover)
4. **Chat SDK** — drop Matrix native crypto to shrink runtime
5. **Agent directory** — rover discovery by name
6. **Kamal deploy** — core brains on Kamal first, shared DNS/CDN automation patterns
7. **Turso integration** — libSQL driver as alternative to local SQLite in entity-service
8. **Cluster service** — lightweight HTTP service in `services/cluster` for process management

## Open Questions (for later)

- Billing model — free tier? Usage-based? Flat monthly?
- Per-process resource limits (memory, CPU)
- Monitoring and alerting dashboard for clusters
- User migration path from hosted to self-hosted (and vice versa)
- Git repo strategy at scale (per-repo vs monorepo with branches vs self-hosted Gitea)
- MCP access for hosted rovers (HTTP endpoint needed, minimal preset has no webserver)
- Idle timeout duration — how long before killing an idle rover?
- Cold start optimization — warm pool of pre-spawned rovers?
- Turso vs local SQLite — should self-hosted rovers also use Turso, or keep local SQLite as default?
- Cluster auto-provisioning — should ranger spin up new Hetzner VPS + cluster service automatically?
