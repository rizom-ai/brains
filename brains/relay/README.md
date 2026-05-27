# @brains/relay

> Internal-use brain model. This source ships publicly so the architecture stays inspectable, but `@brains/rover` is the public reference model for adoption, extension, and standalone app authoring.

`@brains/relay` is the collaborative team brain model: capture → synthesize → share. Its presets progress from private team memory to a public knowledge hub, following the same `core` → `default` → `full` shape as Rover.

## Presets

- **`core`** — private team capture + synthesis without the public site layer
- **`default`** — `core` plus the minimal public-site stack
- **`full`** — `default` plus existing team-knowledge surfaces (`docs`, `decks`)

## Capabilities

| Plugin           | Purpose                                     |
| ---------------- | ------------------------------------------- |
| `prompt`         | editable prompt/template entities           |
| `directory-sync` | markdown + optional git-backed content sync |
| `note`           | free-form team notes                        |
| `link`           | URL capture and metadata extraction         |
| `topics`         | topic extraction and organization           |
| `summary`        | durable conversation summaries              |
| `agents`         | peer-brain discovery entities               |
| `auth-service`   | OAuth/passkey operator auth                 |
| `cms`            | CMS surface                                 |
| `dashboard`      | operator dashboard widgets                  |
| `web-chat`       | operator web chat UI                        |
| `image`          | image handling for site-facing instances    |
| `site-info`      | site identity metadata                      |
| `site-content`   | durable route/section copy                  |
| `site-builder`   | static-site generation                      |
| `docs`           | docs entity/routes for full instances       |
| `decks`          | deck/presentation entities for full         |

System tools such as create, update, search, extract, and status are framework-level surfaces provided by the shell.

## Mutation permissions

Relay separates collaborator writes from owner/operator writes:

- trusted teammates can create and update normal team-authored memory such as notes, links, decisions, action items, images, docs, and decks;
- deletes default to owner/operator (`anchor`) permission;
- derived/system-maintained or identity/config records (`summary`, `topic`, `agent`, `skill`, `swot`, `prompt`, `site-info`, `site-content`, `anchor-profile`, `brain-character`) are owner/operator-only by default;
- extraction/rebuild actions for derived records such as `topic`, `summary`, `skill`, and `swot` require owner/operator permission.

Instances can override these defaults with `permissions.entityActions` in `brain.yaml`.

## Interfaces

| Interface   | Purpose                                              |
| ----------- | ---------------------------------------------------- |
| `mcp`       | Model Context Protocol                               |
| `discord`   | team chat interface with URL capture                 |
| `a2a`       | agent-to-agent RPC surface                           |
| `webserver` | HTTP host for site, CMS, dashboard, chat, and health |
| `web-chat`  | browser chat surface for operators                   |

## Eval coverage

Relay evals live in `test-cases/` and use the Relay-specific corpus in `eval-content/`. They cover plugin handlers, system-tool routing, public/shared/operator permission flows, and real user scenarios such as onboarding, demo prep, support triage, team-meeting capture, protocol research synthesis, browsing team memory, prompt review, image capture, preview site builds, sync-status checks, and save-first peer-brain contact flows.

Run local validation with:

```bash
bun run test
```

Run model-backed evals with:

```bash
bun run eval
```

## Seed content

Default identity and starter content live in `seed-content/`:

- `brain-character/` — brain identity
- `anchor-profile/` — owner/team profile
- `site-info/` — site title and metadata
- `deck/` — example decks
- root `.md` files — supporting reference docs

Seed content is copied on first boot when `brain-data/` is empty. After that, the markdown content directory becomes the durable source of truth, with the runtime indexing it into SQLite and optionally syncing it to git.

## Usage

### 1. Create an instance directory

```text
apps/my-team/
├── brain.yaml
├── .env
├── tsconfig.json
└── package.json
```

### 2. Configure `brain.yaml`

```yaml
brain: relay
preset: default

plugins:
  directory-sync:
    git:
      repo: your-org/brain-content
  webserver:
    productionDomain: https://your-site.com
```

To enable the full team-knowledge tier:

```yaml
preset: full
```

You can also opt individual full-tier plugins into smaller presets:

```yaml
add: [docs, decks]
```

### 3. Configure `.env`

```bash
AI_API_KEY=your-api-key-here
DISCORD_BOT_TOKEN=your-discord-token
GIT_SYNC_TOKEN=ghp_...
# Deprecated static fallback for non-OAuth MCP clients:
# MCP_AUTH_TOKEN=your-mcp-token
```

Relay includes `auth-service`, so first boot prints a one-shot `/setup` URL for passkey registration. OAuth-capable MCP clients should use the browser/passkey authorization flow against `/mcp`; keep `MCP_AUTH_TOKEN` only for older clients that cannot do OAuth.

### Permissions UX

Relay treats people in configured shared spaces as collaborators (`trusted`) while anchors remain owners. By default, collaborators can create/update normal team memory, but deletes and system-maintained records stay owner-only.

```yaml
anchors:
  - "discord:OWNER_USER_ID"

spaces:
  - "discord:TEAM_CHANNEL_ID"
```

Relay's built-in entity action policy allows collaborators to create/update general team content such as notes, links, decisions, action items, docs, decks, and images. Deletes require owner/anchor permission. Protected entities such as prompts, site content, topics, summaries, agents, skills, and SWOTs require owner/anchor permission for create/update/delete. Singleton identity/config entities — site-info, anchor-profile, and brain-character — cannot be deleted through system tools at all; reset them through plugin or directory-sync paths.

Instances can override individual actions in `brain.yaml`:

```yaml
permissions:
  entityActions:
    doc:
      delete: trusted
    summary:
      update: trusted
```

Denials are explicit, for example: `Update summary requires Owner/anchor permission; your current permission is Collaborator/trusted.`

### 4. Run the instance

```bash
bunx brain start
```

## Architecture

- **Brain model** (`src/index.ts`) — plugin selection, presets, interfaces, permissions
- **`brain.yaml`** — per-instance config and overrides
- **`.env`** — secrets only
- **`seed-content/`** — first-boot starter content

See also:

- [Relay preset plan](../../docs/plans/relay-presets.md)
- [Brain model architecture](../../docs/brain-model.md)
- [Repository README](../../README.md)
