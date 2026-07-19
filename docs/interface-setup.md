# Interface Setup Guide

Interfaces are how users, tools, web clients, and peer agents talk to a running brain. Built-in interfaces include MCP, the webserver and operator web chat, multi-platform chat through Discord or Slack, A2A, and the local chat REPL.

Interfaces are selected by the active capability bundles, then refined with `add` / `remove` and configured under `plugins:` in `brain.yaml`.

## Quick reference

| Interface | Plugin id   | Local surface                        | Common use                                      |
| --------- | ----------- | ------------------------------------ | ----------------------------------------------- |
| MCP       | `mcp`       | `http://localhost:8080/mcp` or stdio | Claude Desktop, Cursor, CLI remote/tooling      |
| Webserver | `webserver` | `http://localhost:8080`              | Site, CMS, dashboard, Admin, shared HTTP routes |
| Web chat  | `web-chat`  | `http://localhost:8080/chat`         | Authenticated browser chat                      |
| Chat      | `chat`      | Discord and/or Slack                 | Community, team, and authenticated chat         |
| A2A       | `a2a`       | `http://localhost:8080/a2a`          | Agent-to-agent communication                    |
| Chat REPL | command     | `brain chat`                         | Local terminal chat                             |

## Shared setup

Start from a generated instance:

```bash
bun add -g @rizom/brain
brain init mybrain
cd mybrain
cp .env.example .env
# set AI_API_KEY in .env
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

MCP is the main assistant/tooling interface. It exposes raw read tools and agent-gated command tools to MCP clients.

### HTTP MCP

The default MCP transport is HTTP. It is mounted on the shared webserver at `/mcp`.

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
3. OAuth-capable MCP clients discover metadata from the brain, open a browser authorization flow, and request the `mcp` scope.
4. The brain verifies the passkey-backed auth session and issues MCP-scoped bearer tokens.

`MCP_AUTH_TOKEN` is still supported as a deprecated static fallback. Use it only for older clients that cannot complete OAuth. If `plugins.mcp.authToken` or `MCP_AUTH_TOKEN` is set, clients must send that value as `Authorization: Bearer <token>` and the OAuth path is bypassed for MCP.

```yaml
plugins:
  # Optional deprecated fallback for non-OAuth MCP clients:
  # mcp:
  #   authToken: ${MCP_AUTH_TOKEN}
```

### MCP tool modes

MCP defaults to `basic` mode. In `basic`, clients see:

- raw read-only query tools such as `system_search`, `system_get`, `system_list`, and `system_job_status`
- `chat` for commands, writes, and reasoning requests that should run through the brain agent
- `confirm` for approving or denying pending actions returned by `chat`

Raw write tools are not advertised in `basic`. After a write, `chat`/`confirm` responses may include `toolResults` and `readYourWrites` handles with entity IDs and job IDs; use `system_get` or `system_job_status` to observe those results.

Use `debug` mode only for local/operator inspection when you intentionally need raw tool access. It requires `admin` permissions and is refused for unauthenticated HTTP.

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

# Deprecated static-token fallback only:
brain --remote https://your-domain.com --token "$MCP_AUTH_TOKEN" status
```

## Webserver

The webserver is the shared HTTP surface for the site, CMS, dashboard, Admin console, MCP HTTP, A2A, health routes, and plugin API routes.

Common local URLs:

```text
http://localhost:8080/           # public site or dashboard route, depending on bundle/config
http://localhost:8080/cms        # CMS when enabled
http://localhost:8080/dashboard  # dashboard when enabled
http://localhost:8080/admin      # administration console; People section when enabled
http://localhost:8080/chat       # authenticated web chat when enabled
http://localhost:8080/mcp        # MCP HTTP when enabled
http://localhost:8080/a2a        # A2A when enabled
```

Relevant config fields:

```yaml
plugins:
  webserver:
    enablePreview: true
    previewDistDir: ./dist/site-preview
    productionDistDir: ./dist/site-production
    sharedImagesDir: ./dist/images
    productionPort: 8080
```

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

### Chat permissions and safety

Permissions remain platform-scoped:

```yaml
permissions:
  rules:
    - pattern: "discord:*"
      level: trusted
    - pattern: "slack:*"
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

Inbound trust is separate from outbound contact approval. Grant or revoke it with `agent_set_trust_level`. Trusted calls use RFC 9421 HTTP Message Signatures and peer keys published through `/.well-known/jwks.json`.

A2A also exposes the approved public directory at `/.well-known/agent-directory.json`. `agent_scan_directories` can walk approved peers' directories one hop and save unapproved second-order sightings for review.

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
| MCP HTTP 404                 | Ensure `webserver` and `mcp` are both enabled. MCP HTTP mounts on the shared webserver.                                                                    |
| MCP HTTP unauthorized        | For OAuth clients, clear stale client auth and repeat the browser/passkey flow. For deprecated static-token mode, pass `MCP_AUTH_TOKEN` as a bearer token. |
| Discord bot does not respond | Check all three Discord credentials, Message Content Intent, bot permissions, `requireMention`, and `allowedChannels`.                                     |
| Slack app does not respond   | Check bot/app or signing-secret credentials, installed scopes, Socket Mode/webhook setup, `requireMention`, and `allowedChannels`.                         |
| A2A card missing             | Ensure `a2a` and `webserver` are enabled and the brain has a domain or local webserver.                                                                    |
| Remote CLI command fails     | Use `brain --remote <url> --token <token> ...` and verify `/mcp` is reachable.                                                                             |

## Related docs

- [Getting Started](../packages/brain-cli/docs/getting-started.md)
- [brain.yaml Reference](../packages/brain-cli/docs/brain-yaml-reference.md)
- [CLI Reference](../packages/brain-cli/docs/cli-reference.md)
- [A2A interface README](../interfaces/a2a/README.md)
- [Multi-platform chat README](../interfaces/chat/README.md)
