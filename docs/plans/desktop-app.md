# Plan: Desktop App (Electrobun)

## Context

The brain is a Bun process. Electrobun's main process runs on Bun. These are the same thing — the brain _is_ the Electrobun main process. No server, no Docker, no deployment. Just a desktop app.

Replaces the standalone binary plan with something strictly better: the binary plus a native control panel with CMS.

## Presets and Interfaces Are Orthogonal

Presets control **what the brain can do** (plugins). Interfaces control **how you interact** with it. Any preset works with any interface combination.

| Preset  | Plugins                                                       |
| ------- | ------------------------------------------------------------- |
| minimal | system, note, link, wishlist, directory-sync                  |
| default | + blog, decks, portfolio, social-media, topics, series, image |
| pro     | + newsletter, analytics, content-pipeline, site-builder       |

| Interface  | What it provides                                 |
| ---------- | ------------------------------------------------ |
| mcp-stdio  | Claude Desktop, Cursor, terminal                 |
| electrobun | Tray icon, dashboard, config, CMS, optional chat |
| webserver  | Public site, preview                             |
| mcp-http   | Remote MCP access                                |
| a2a        | Agent-to-agent                                   |
| discord    | Discord bot                                      |

### Typical combinations

```yaml
# Desktop app — minimal brain with native UI
preset: core

# Desktop app — full brain
preset: full

# Headless CLI — servers, automation
preset: core
# no electrobun, mcp-stdio only

# Deployed web brain
preset: full
domain: yeehaa.io
```

## Architecture

```
Electrobun App (~12MB)
  ├── Main process (Bun) = Brain runtime
  │   ├── Shell (EntityService, AIService, JobQueue, etc.)
  │   ├── Plugins (depends on preset)
  │   └── MCP server (stdio — always available)
  └── Native UI (system webview)
      ├── Tray icon — brain status, start/stop
      ├── Dashboard — entity stats, sync status, plugin health
      ├── Config — visual brain.yaml editor, preset selector
      ├── CMS — edit content directly against local brain-data
      └── Chat — talk to brain without external client
```

## CMS in the Desktop App

Currently CMS requires a deployed webserver + GitHub OAuth. In the desktop app, CMS works directly against the local brain-data directory — no OAuth, no server, no deploy.

Sveltia CMS is a client-side SPA. Point it at the local git repo instead of the GitHub API and it runs entirely offline. The Electrobun webview loads the CMS, the brain watches for file changes via directory-sync.

The desktop is where the owner _creates_ content. The deployed site is where the public _reads_ it. CMS is more useful here than on the web.

### How it works

1. Electrobun serves Sveltia CMS from the app bundle (no network)
2. CMS reads/writes markdown files in brain-data directory (local git backend, no GitHub API)
3. Directory-sync watches for file changes → imports to entity service
4. If git-sync is configured, changes push to remote repo
5. If site-builder is active, site rebuilds automatically

No OAuth flow. No server. Files on disk.

## Native UI

Not a website viewer. A control panel for the brain owner.

### Tray icon

Brain runs in background. Status indicator (green/yellow/red). Click to open control panel. Right-click: Dashboard, CMS, Chat, Quit.

### Dashboard

Entity stats, sync status, plugin health, recent activity. Lightweight Preact app using Electrobun RPC.

### Config

Visual brain.yaml editor. Preset selector, plugin toggles, domain config. Saves brain.yaml, brain reloads.

### Chat

Native chat to the brain via agent service. Alternative to Claude Desktop for users who don't have it. Conversation history via conversation service.

### RPC surface

| Method               | What it does                              |
| -------------------- | ----------------------------------------- |
| `getStatus()`        | Brain health, active plugins, sync status |
| `getEntityCounts()`  | Entity stats for dashboard                |
| `getConfig()`        | Current brain.yaml                        |
| `updateConfig(yaml)` | Write brain.yaml, reload                  |
| `chat(message)`      | Send message to agent                     |
| `getBuildStatus()`   | Site build progress                       |
| `getPluginHealth()`  | Per-plugin health                         |
| `getCmsConfig()`     | CMS collection definitions for Sveltia    |

## Build & Distribution

### Build pipeline

```
bun run build          → brain bundle
electrobun build       → native app (brain + control panel + CMS)
electrobun distribute  → platform installers
```

### Platforms

- **macOS**: `.app` bundle (Intel + Apple Silicon), ~12MB
- **Windows**: `.exe` installer (Edge WebView2), ~12MB
- **Linux**: AppImage or .deb (WebKitGTK or bundled CEF)

### Updates

Electrobun differential updates (bsdiff — as small as 14KB). Brain-data stays on disk.

### brain.yaml location

- **macOS**: `~/Library/Application Support/Rover/brain.yaml`
- **Windows**: `%APPDATA%/Rover/brain.yaml`
- **Linux**: `~/.config/rover/brain.yaml`

## Relationship to Other Plans

| Plan              | Relationship                                                    |
| ----------------- | --------------------------------------------------------------- |
| Standalone binary | **Replaced** — Electrobun is the binary + UI + CMS              |
| Media sidecar     | Still needed — ONNX/Sharp in separate process                   |
| Chat SDK          | Complements — Chat SDK for Discord/Slack, Electrobun for native |
| Kamal deploy      | Web tier only                                                   |
| Hosted rovers     | K8s, headless — no Electrobun                                   |

## Prerequisites

1. **Plugin hierarchy simplification** — InterfacePlugin extends BasePlugin directly
2. **Media sidecar** — brain must be lightweight for desktop (~200MB)
3. **Chat SDK migration** — drop Matrix native crypto

## Steps

### Phase 1: CLI binary

1. `bun build --compile` produces `./rover` binary
2. Reads brain.yaml from CWD or platform-standard path
3. MCP stdio works with Claude Desktop
4. All presets work headless

### Phase 2: Electrobun wrapper + tray

1. Create `interfaces/electrobun/` InterfacePlugin
2. Main process loads brain, starts shell
3. Tray icon with status
4. RPC bridge to UI
5. macOS first

### Phase 3: CMS

1. Bundle Sveltia CMS in the app
2. Local git backend — reads/writes brain-data directly
3. CMS config generated from entity schemas (reuse existing `generateCmsConfig()`)
4. File change → directory-sync → entity service (existing flow)

### Phase 4: Dashboard + Config

1. Dashboard — entity stats, sync status, plugin health
2. Config — brain.yaml editor, preset selector, plugin toggles
3. Platform tray integration

### Phase 5: Chat

1. Native chat via agent service
2. Conversation history
3. Streaming responses

### Phase 6: Distribution

1. Windows + Linux builds
2. Auto-update via differential patches
3. First-run wizard (name, bio → brain.yaml + seed identity)

## Verification

1. `./rover` runs headless with MCP stdio
2. App shows tray icon, brain starts in background
3. CMS opens, creates/edits entities in brain-data directory
4. Edits trigger entity import + site rebuild
5. Dashboard shows entity stats and plugin health
6. Config editor saves brain.yaml, brain reloads
7. Chat sends messages, gets agent responses
8. MCP stdio works alongside native UI
9. Any preset works with or without Electrobun
10. App binary < 50MB
