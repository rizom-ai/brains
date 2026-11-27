# Interface Setup Guide

Interfaces are how users, tools, web clients, and peer agents talk to a running brain. Built-in interfaces include MCP, operator web chat, multi-platform chat through Discord or Slack, A2A, and the local chat REPL. The runtime itself serves HTTP: the site, Studio, dashboard and every interface's routes share one listener.

Interfaces are selected by the active capability bundles, then refined with `add` / `remove` and configured under `plugins:` in `brain.yaml`.

## Quick reference

| Interface | Plugin id  | Local surface                        | Common use                                          |
| --------- | ---------- | ------------------------------------ | --------------------------------------------------- |
| MCP       | `mcp`      | `http://localhost:8080/mcp` or stdio | Claude Desktop, Cursor, CLI remote/tooling          |
| Web chat  | `web-chat` | `http://localhost:8080/ask`          | Guest-facing browser surface; currently fail-closed |
| Chat      | `chat`     | Discord, Slack and/or Matrix         | Community, team, and authenticated chat             |
| A2A       | `a2a`      | `http://localhost:8080/a2a`          | Agent-to-agent communication                        |
| Chat REPL | command    | `brain chat`                         | Local terminal chat                                 |

## Shared setup

Start from a generated instance:

```bash
bun add -g @rizom/brain
brain init mybrain
cd mybrain
cp .env.example .env
# set OPENAI_API_KEY in .env
brain start
```

Most interfaces also need permissions. The common identity forms are:

- `cli:*`
- `mcp:stdio`
- `mcp:http`
- `discord:<user-id>`
- `slack:<user-id>`
- `web-chat:<session-or-user-id>`
- `a2a:<agent-id-or-domain>`

Example permission config:

```yaml
permissions:
  anchors:
    - "cli:*"
    - "mcp:stdio"
  trusted:
    - "discord:123456789012345678"
    - "slack:U0123456789"
  rules:
    - pattern: "mcp:http"
      level: public
    - pattern: "discord:*"
      level: public
    - pattern: "slack:*"
      level: public
    - pattern: "a2a:*"
      level: public
```

Use `admin` access for identities that can administer the brain. Configure `anchors` separately for caller identities that represent the brain's owner/subject in chat. Use `public` for surfaces that should be able to ask ordinary questions but not perform privileged actions.

## MCP

MCP is the main assistant/tooling interface. Its default surface routes clients through the brain agent; an Admin-only debug mode exposes raw tools for operator inspection.

### HTTP MCP

The default MCP transport is HTTP when the brain serves HTTP. It is mounted on the shared HTTP host at `/mcp`.

Start the brain:

```bash
brain start
```

Local URL:

```text
http://localhost:8080/mcp
```

Deployed URL:

```text
https://your-domain.com/mcp
```

When `auth-service` is enabled, HTTP MCP is protected by the brain's built-in OAuth provider:

1. First boot prints a one-shot `/setup` URL.
2. The first Admin opens that URL locally and registers a passkey; on a personal brain, that person's subject becomes the Anchor.
3. OAuth-capable MCP clients discover metadata from the brain, identify themselves through a Client ID Metadata Document (or deprecated Dynamic Client Registration fallback), open a browser authorization flow, and request the `mcp` scope.
4. The brain verifies the passkey-backed auth session and issues MCP-scoped bearer tokens.

`MCP_AUTH_TOKEN` is a static token for local development only; a production brain refuses it at boot, so deployed brains use OAuth. If `plugins.mcp.authToken` or `MCP_AUTH_TOKEN` is set, clients must send that value as `Authorization: Bearer <token>` and the OAuth path is bypassed for MCP.

```yaml
plugins:
  # Static MCP token, local development only; a production brain refuses it:
  # mcp:
  #   authToken: ${MCP_AUTH_TOKEN}
```

### MCP tool modes

MCP defaults to `basic` mode. In `basic`, clients see only:

- `chat` for reads, commands, writes, and reasoning requests routed through the brain agent
- `confirm` for approving or denying pending actions returned by `chat`

Raw tools are not advertised in `basic`. After a write, `chat`/`confirm` responses may include `toolResults` and `readYourWrites` handles with entity IDs and job IDs; ask through `chat` to observe those results.

Use `debug` mode only for local/operator inspection when you intentionally need raw tool access such as `system_search`, `system_get`, `system_list`, or `system_job_status`. It requires `admin` permissions and is refused for unauthenticated HTTP.

```yaml
plugins:
  mcp:
    mode: basic # default


# Local/debug only:
# plugins:
#   mcp:
#     transport: stdio
#     mode: debug
```

### Stdio MCP

Some clients prefer stdio. Configure MCP for stdio when the client launches the brain process directly:

```yaml
plugins:
  mcp:
    transport: stdio
```

Claude Desktop-style config:

```json
{
  "mcpServers": {
    "mybrain": {
      "command": "brain",
      "args": ["start"],
      "cwd": "/absolute/path/to/mybrain"
    }
  }
}
```

Stdio clients should run from the instance directory that contains `brain.yaml`.

### Useful MCP checks

```bash
brain tool system_status
brain tool system_search '{"query":"what content exists?"}'

# Static-token mode, local development only; a production brain refuses it:
brain --remote http://localhost:8080 --token "$MCP_AUTH_TOKEN" status
```

## HTTP host

The runtime's HTTP host is the shared HTTP surface for the site, Studio, dashboard, MCP HTTP, A2A, health routes, and plugin API routes. Account and administration presentation lives inside Studio. A brain serves HTTP when its bundles include `web`; it listens on `port` (default `8080`), and the preview site shares that port, chosen by a `preview.` or `-preview.` host.

Common local URLs:

```text
http://localhost:8080/           # public site or dashboard route, depending on bundle/config
http://localhost:8080/studio     # Studio when enabled
http://localhost:8080/studio/workspaces/studio%3Aaccount # self-service Account workspace
http://localhost:8080/studio/workspaces/admin%3Apeople # Admin-only People workspace
http://localhost:8080/dashboard  # dashboard when enabled
http://localhost:8080/chat       # authenticated native Studio Chat when enabled
http://localhost:8080/ask        # guest-facing Web Chat route; currently fail-closed
http://localhost:8080/mcp        # MCP HTTP when enabled
http://localhost:8080/a2a        # A2A when enabled
```

Relevant config fields:

```yaml
port: 8080
http:
  enabled: true # default: whether the selected bundles include web
  preview: true # default: whether a site builder runs
  hostname: 127.0.0.1 # bind address; default: all interfaces
  # Only for a site no site builder writes; a site builder's own output
  # directories are the ones served.
  productionDistDir: ./dist/site-production
  previewDistDir: ./dist/site-preview
  sharedImagesDir: ./dist/images
```

`plugins.webserver` is retired and refused: its port is top-level `port`, its other settings are under `http`.

The old separate internal preview/API listener model has converged on the shared HTTP host for normal app verification. Prefer testing through `http://localhost:8080` or through `brain --remote` against the running app.

## Multi-platform chat

The `chat` interface hosts Discord and Slack adapters in one Chat SDK runtime. Either adapter can run by itself, or both can run together.

Shared features include mentions, DMs, channel allowlists, subscribed-thread follow-ups, URL capture, confirmations, suggested actions, progress updates, permission-gated uploads, and native generated-artifact delivery.

### Discord adapter

Create a Discord application and bot in the [Discord Developer Portal](https://discord.com/developers/applications). Enable **Message Content Intent**, invite the bot with channel, message, thread, and history permissions, then configure all three application credentials:

```bash
DISCORD_BOT_TOKEN=...
DISCORD_PUBLIC_KEY=...
DISCORD_APPLICATION_ID=...
```

```yaml
plugins:
  chat:
    adapters:
      discord:
        botToken: ${DISCORD_BOT_TOKEN}
        publicKey: ${DISCORD_PUBLIC_KEY}
        applicationId: ${DISCORD_APPLICATION_ID}
        requireMention: true
        allowDMs: true
        useThreads: true
        allowedChannels: []
        captureUrls: true
```

Discord supports direct gateway operation and webhook delivery.

### Slack adapter

Slack supports one workspace through either Socket Mode or a public webhook.

For Socket Mode, provide a bot token and app-level token:

```bash
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...
```

```yaml
plugins:
  chat:
    adapters:
      slack:
        mode: socket
        botToken: ${SLACK_BOT_TOKEN}
        appToken: ${SLACK_APP_TOKEN}
        requireMention: true
        allowDMs: true
        allowedChannels: []
```

For webhook mode, replace `appToken` with `signingSecret: ${SLACK_SIGNING_SECRET}` and point Slack events at:

```text
POST /api/webhooks/chat/slack
```

Slack requires the configured app scopes for mentions, channel/DM history, users, file reads, file writes, and messages. Reinstall the app after changing its scopes.

### Matrix adapter

The chat interface talks on Matrix as the brain's bot. On someone else's homeserver, set its client API URL and the bot's account:

```bash
MATRIX_BASE_URL=https://brain.example.com
MATRIX_USER_ID=@_brain:brain.example.com
MATRIX_PASSWORD=...
```

With the brain's own homeserver (below), leave `MATRIX_PASSWORD` out: the brain provides it. The bot logs in with its password once and keeps its session and sync position in runtime state, so a restart resumes rather than logging in again. Matrix shows no cards: approvals arrive as text and are answered by typing yes or no. The bot joins a direct invite while `allowDMs` is on, and an invite to a room only from a peer brain's bot whose domain this brain trusts at `trusted`.

The `matrix` channel delivers on its own: invitations and notifications to a `matrix:` recipient open or reuse the bot's direct room with that person. A notification default can name a Matrix user:

```yaml
plugins:
  notifications:
    defaultRecipient:
      type: matrix
      address: "@me:brain.example.com"
```

### The brain's own homeserver

The `matrix` bundle adds the `matrix-server` plugin, which fronts a [Tuwunel](https://github.com/matrix-construct/tuwunel) homeserver at the brain's own domain. The brain forwards `/_matrix` and `/_tuwunel` to it and serves `/.well-known/matrix/server` and `/.well-known/matrix/client`, so federation and clients find the homeserver at the brain's domain. Nobody sets a Matrix secret. The brain writes the homeserver's configuration into a directory they share: on its first start with fresh secrets, and afterwards keeping the ones that file holds. That file, next to the homeserver's database, is the only place the secrets live, so a backup or a restore takes them together. When the brain is ready, the plugin registers the bot with the registration token, the only way registration is open, and registers the homeserver as the OAuth client people sign in through. The chat interface asks the plugin for the bot's password.

In a deploy, adding the `matrix` bundle to brain.yaml is the whole setup. The deploy runs Tuwunel as a Kamal accessory on `/opt/brain-matrix`, which the brain mounts too, and sets the values below from the brain's domain. On the first deploy the homeserver restarts until the brain has written its configuration, then starts on it. Later deploys restart the homeserver only when the brain has written it a new configuration, such as after a domain change. Before each deploy, the predeploy backup takes an online backup of the homeserver into `/opt/brain-matrix/backup`.

```bash
MATRIX_SERVER_NAME=brain.example.com
MATRIX_HOMESERVER_URL=http://brain-matrix:6167   # where the brain reaches the homeserver
MATRIX_DATA_DIR=/app/matrix                      # the directory the brain shares with it
# MATRIX_PUBLIC_URL defaults to https://<MATRIX_SERVER_NAME>
```

People sign in to the homeserver with their brain account: Matrix clients show "your brain" as the sign-in, and the brain's passkey sign-in follows. A person's Matrix id is `@<username>:<server>`, with a username the brain fixes on their first sign-in and keeps through renames, and the brain records that id as a verified claim on the person. People have no Matrix password.

Someone who already has a Matrix id elsewhere is invited by that address. The invitation arrives as a DM over federation, and completing setup records the id as theirs, so no second account is created.

For each peer brain trusted at `trusted`, the plugin keeps a room aliased by the peer's domain, open over federation only to this server and the peer's, and invites the peer's bot. Revoking the trust removes the peer's bot and closes the room to its server, keeping the history. Rooms the brain creates are unencrypted.

The `matrix` test app runs the bundle locally. From `packages/brain-cli`, with the `MATRIX_*` values from `test-apps/matrix/brain.yaml` exported, start the homeserver with `bun ../../plugins/matrix-server/scripts/local-homeserver.ts`, then the app with `sh scripts/start-test-app.sh matrix`.

### Chat permissions and safety

Permissions remain platform-scoped:

```yaml
permissions:
  rules:
    - pattern: "discord:*"
      level: trusted
    - pattern: "slack:*"
      level: trusted
    - pattern: "matrix:*"
      level: trusted
```

Recommended production settings:

- keep `requireMention: true` unless all channel messages should reach the brain;
- restrict `allowedChannels` where appropriate;
- disable `allowDMs` unless direct messages are intentional;
- grant `trusted` or `admin` only to users who may supply reusable uploads or perform writes.

Public users can chat, but their platform attachments are not downloaded or passed to the agent. Discord and Slack keep subscriptions and uploads in separate runtime namespaces.

## A2A

A2A enables brain-to-brain communication.

It serves:

- Agent Card: `/.well-known/agent-card.json`
- JSON-RPC endpoint: `/a2a`

Local URLs:

```text
http://localhost:8080/.well-known/agent-card.json
http://localhost:8080/a2a
```

Deployed URLs:

```text
https://your-domain.com/.well-known/agent-card.json
https://your-domain.com/a2a
```

Basic config:

```yaml
plugins:
  a2a:
    organization: "Your Organization"
```

A2A can verify an exact domain for a one-shot call without saving it. To create a durable approved outbound contact, connect the remote brain by domain or URL and complete the returned confirmation:

```bash
brain tool agent_connect '{"source":{"kind":"url","url":"remote.example.com"}}'
```

List saved agents:

```bash
brain tool system_list '{"entityType":"agent"}'
```

Call an approved contact:

```bash
brain tool agent_call '{"agent":"remote.example.com","message":"What can you help with?"}'
```

Inbound trust is separate from outbound contact approval, and `agent_set_standing` sets each: `contact` (`approved` or `archived`) for whether this brain may contact the peer, `level` (`trusted` or `public`) for what the peer may read here. Trusted calls use RFC 9421 HTTP Message Signatures and peer keys published through `/.well-known/jwks.json`.

A2A also exposes the approved public directory at `/.well-known/agent-directory.json`. `agent_scan_directories` can walk approved peers' directories one hop and save unapproved second-order sightings for review.

`network_ask` asks the network as a whole: it picks the approved peers whose skills fit a question (at most three, or the two nearest when none fit), or, with `askAllApproved: true` under `plugins.agents`, every approved peer whatever its skills (the nearest first, still three at most), asks them in parallel with a 30 s budget each (`networkAskTimeoutMs`; a peer's answer is a model turn with retrieval, 15–25 s on the fleet), and returns every answer with its sources attributed to the brain that gave it. Each peer is asked for a brief answer from its own public content with citations. It is public and side-effect free, so a site visitor's guest turn may use it; a peer answers at public level and its answer's sources travel back as a `sources` task artifact.

Being asked is bounded. Public A2A callers answer under a daily allowance kept in runtime state: `a2a.publicAsks` sets `perCallerPerDay` (60) and `tokensPerCallerPerDay` (300000) per caller domain, `perDay` (600) and `tokensPerDay` (3000000) for all public callers together, and `enabled` as the switch that stops answering public questions at all. Unsigned callers share one anonymous allowance; trusted callers are not counted. A caller over its allowance gets a failed task whose message says why, which an asking brain treats as no answer.

Manual smoke test:

```bash
curl http://localhost:8080/.well-known/agent-card.json | jq
```

## Chat REPL

Use `brain chat` for a local terminal conversation loop:

```bash
cd mybrain
brain chat
```

The chat REPL is useful for quick local testing because it runs against the same content, tools, permissions, and AI configuration as the brain instance.

## Troubleshooting

| Symptom                      | Check                                                                                                                                                      |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MCP HTTP 404                 | Ensure the brain serves HTTP (the `web` bundle or `http.enabled`) and `mcp` is enabled. MCP HTTP mounts on the shared HTTP host.                           |
| MCP HTTP unauthorized        | For OAuth clients, clear stale client auth and repeat the browser/passkey flow. For local-only static-token mode, pass `MCP_AUTH_TOKEN` as a bearer token. |
| Discord bot does not respond | Check all three Discord credentials, Message Content Intent, bot permissions, `requireMention`, and `allowedChannels`.                                     |
| Slack app does not respond   | Check bot/app or signing-secret credentials, installed scopes, Socket Mode/webhook setup, `requireMention`, and `allowedChannels`.                         |
| A2A card missing             | Ensure `a2a` is enabled and the brain serves HTTP, on its domain or locally.                                                                               |
| Remote CLI command fails     | Use `brain --remote <url> --token <token> ...` and verify `/mcp` is reachable.                                                                             |

## Related docs

- [Getting Started](../packages/brain-cli/docs/getting-started.md)
- [brain.yaml Reference](../packages/brain-cli/docs/brain-yaml-reference.md)
- [CLI Reference](../packages/brain-cli/docs/cli-reference.md)
- [A2A interface README](../interfaces/a2a/README.md)
- [Multi-platform chat README](../interfaces/chat/README.md)
