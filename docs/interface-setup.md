# Interface Setup Guide

Interfaces are how users, tools, web clients, and peer agents talk to a running brain. Built-in interfaces include MCP, webserver, Discord, A2A, and the local chat REPL.

Interfaces are selected by the active brain model preset, then refined with `add` / `remove` and configured under `plugins:` in `brain.yaml`.

## Quick reference

| Interface | Plugin id   | Local surface                        | Common use                                 |
| --------- | ----------- | ------------------------------------ | ------------------------------------------ |
| MCP       | `mcp`       | `http://localhost:8080/mcp` or stdio | Claude Desktop, Cursor, CLI remote/tooling |
| Webserver | `webserver` | `http://localhost:8080`              | site, CMS, dashboard, shared HTTP routes   |
| Discord   | `discord`   | Discord bot                          | chat with the brain from Discord           |
| A2A       | `a2a`       | `http://localhost:8080/a2a`          | agent-to-agent communication               |
| Chat REPL | command     | `brain chat`                         | local terminal chat                        |

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
- `a2a:<agent-id-or-domain>`

Example permission config:

```yaml
permissions:
  anchors:
    - "cli:*"
    - "mcp:stdio"
  trusted:
    - "discord:123456789012345678"
  rules:
    - pattern: "mcp:http"
      level: public
    - pattern: "discord:*"
      level: public
    - pattern: "a2a:*"
      level: public
```

Use `anchor` access for identities that can administer the brain. Use `public` for surfaces that should be able to ask ordinary questions but not perform privileged actions.

## MCP

MCP is the main assistant/tooling interface. It exposes system tools and resources to MCP clients.

### HTTP MCP

The default MCP transport is HTTP. It is mounted on the shared webserver at `/mcp`.

```yaml
plugins:
  mcp:
    authToken: ${MCP_AUTH_TOKEN}
```

```bash
# .env
MCP_AUTH_TOKEN=choose-a-long-random-token
```

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

If `authToken` is set, clients must send it as a bearer token. If it is omitted, local HTTP MCP runs without token auth.

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
brain --remote https://your-domain.com --token "$MCP_AUTH_TOKEN" status
```

## Webserver

The webserver is the shared HTTP surface for the site, CMS, dashboard, MCP HTTP, A2A, health routes, and plugin API routes.

Common local URLs:

```text
http://localhost:8080/           # public site or dashboard route, depending on preset/config
http://localhost:8080/cms        # CMS when enabled
http://localhost:8080/dashboard  # dashboard when enabled
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

## Discord

Discord lets users chat with the brain by mentioning a bot in server channels or by sending direct messages.

### 1. Create a Discord app and bot

1. Open [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Open **Bot** → **Add Bot**
4. Reset/copy the bot token
5. Store it as `DISCORD_BOT_TOKEN`

```bash
# .env
DISCORD_BOT_TOKEN=...
```

### 2. Enable required intent

In the bot settings, enable:

- **Message Content Intent**

The interface also uses non-privileged gateway intents for guilds, messages, and direct messages.

### 3. Invite the bot

In **OAuth2 → URL Generator**:

- scopes: `bot`
- permissions:
  - View Channels
  - Send Messages
  - Send Messages in Threads
  - Create Public Threads
  - Read Message History

Open the generated URL and invite the bot to your server.

### 4. Configure the brain

```yaml
plugins:
  discord:
    botToken: ${DISCORD_BOT_TOKEN}
    requireMention: true
    allowDMs: true
    useThreads: true
    allowedChannels: []
```

Add your Discord user id as an anchor or trusted identity if needed:

```yaml
permissions:
  anchors:
    - "discord:YOUR_DISCORD_USER_ID"
  rules:
    - pattern: "discord:*"
      level: public
```

To find your user id: Discord settings → Advanced → enable Developer Mode → right-click your username → **Copy User ID**.

### Discord config fields

| Field                 | Default              | Notes                                               |
| --------------------- | -------------------- | --------------------------------------------------- |
| `botToken`            | required             | Usually `${DISCORD_BOT_TOKEN}`                      |
| `allowedChannels`     | `[]`                 | Empty means all channels                            |
| `requireMention`      | `true`               | Server channels require mentioning the bot          |
| `allowDMs`            | `true`               | Allows direct messages                              |
| `showTypingIndicator` | `true`               | Shows typing while processing                       |
| `statusMessage`       | `Mention me to chat` | Bot profile status                                  |
| `useThreads`          | `true`               | Replies in public threads                           |
| `threadAutoArchive`   | `1440`               | One of `60`, `1440`, `4320`, `10080`                |
| `captureUrls`         | plugin default       | When enabled, URLs can be captured as link entities |
| `captureUrlEmoji`     | `🔖`                 | Reaction used for URL capture                       |

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

Token-auth config:

```yaml
plugins:
  a2a:
    trustedTokens:
      inbound-secret-token: remote-agent.example.com
    outboundTokens:
      remote-agent.example.com: ${REMOTE_AGENT_TOKEN}
```

- `trustedTokens` maps inbound bearer tokens to caller identities
- `outboundTokens` maps remote agent domains to bearer tokens this brain should send

A2A calling is directory-aware. Save and approve a remote agent first, then call it by its saved local agent id. Do not call raw URLs directly.

Save an agent by URL:

```bash
brain tool system_create '{"entityType":"agent","url":"https://remote.example.com"}'
```

List saved agents:

```bash
brain tool system_list '{"entityType":"agent"}'
```

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

The chat REPL is useful for quick local testing because it runs against the same model, content, tools, and permissions as the configured brain instance.

## Troubleshooting

| Symptom                      | Check                                                                                          |
| ---------------------------- | ---------------------------------------------------------------------------------------------- |
| MCP HTTP 404                 | Ensure `webserver` and `mcp` are both enabled. MCP HTTP mounts on the shared webserver.        |
| MCP HTTP unauthorized        | Pass the configured `MCP_AUTH_TOKEN` as a bearer token.                                        |
| Discord bot does not respond | Check token, Message Content Intent, bot permissions, `requireMention`, and `allowedChannels`. |
| A2A card missing             | Ensure `a2a` and `webserver` are enabled and the brain has a domain or local webserver.        |
| Remote CLI command fails     | Use `brain --remote <url> --token <token> ...` and verify `/mcp` is reachable.                 |

## Related docs

- [Getting Started](../packages/brain-cli/docs/getting-started.md)
- [brain.yaml Reference](../packages/brain-cli/docs/brain-yaml-reference.md)
- [CLI Reference](../packages/brain-cli/docs/cli-reference.md)
- [A2A interface README](../interfaces/a2a/README.md)
- [Discord interface README](../interfaces/discord/README.md)
