# @rizom/brain

AI brain runtime + CLI. Scaffold, run, and manage personal AI brain instances.

## Quick Start

```bash
# Install globally
bun add -g @rizom/brain

# Create a new brain instance
brain init mybrain
cd mybrain

# Add your API key
echo "AI_API_KEY=your-key-here" > .env

# Start the brain
brain start
```

If you plan to deploy behind Kamal with Cloudflare Origin CA TLS, scaffold with `brain init mybrain --deploy`, then run `brain secrets:push --push-to 1password` for the env-backed secrets (or `--dry-run` to preview them) and `brain cert:bootstrap --push-to 1password` for the TLS cert before deploying.

`brain init` generates a 1Password-backed varlock schema by default. Pass `--backend` if you need a different secret backend plugin.

## Requirements

- [Bun](https://bun.sh) 1.3.3 or later

## What is a Brain?

A brain is a personal AI agent with persistent memory, tools, and integrations. It manages your content (blog posts, notes, projects), publishes to your website, and exposes an MCP interface for AI-native workflows.

## Commands

| Command                 | Description                                |
| ----------------------- | ------------------------------------------ |
| `brain init <dir>`      | Scaffold a new brain instance              |
| `brain cert:bootstrap`  | Issue a Cloudflare Origin CA certificate   |
| `brain secrets:push`    | Push local env-backed secrets to a backend |
| `brain start`           | Start the brain server                     |
| `brain chat`            | Start in interactive chat mode             |
| `brain list <type>`     | List entities (posts, notes, etc.)         |
| `brain get <type> <id>` | Get a specific entity                      |
| `brain search <query>`  | Search across all content                  |
| `brain sync`            | Sync content from connected sources        |
| `brain build`           | Build the static site                      |
| `brain status`          | Show brain status                          |
| `brain eval`            | Run evaluation suite                       |
| `brain pin`             | Pin @rizom/brain version (local install)   |

### Remote Mode

Operate against a running brain instance:

```bash
brain list posts --remote mybrain.example.com
brain search "typescript" --remote mybrain.example.com --token $TOKEN
```

## Configuration

### brain.yaml

```yaml
brain: rover
model: gpt-4o-mini
preset: default
```

The `brain` field selects the brain model. The `model` field sets the AI model — the provider is auto-detected from the model name:

| Model prefix            | Provider  |
| ----------------------- | --------- |
| `gpt-*`, `o1-*`, `o3-*` | OpenAI    |
| `claude-*`              | Anthropic |
| `gemini-*`              | Google    |
| `llama-*`, `mistral-*`  | Ollama    |

Explicit provider override: `model: openai:gpt-4o-mini`

### Environment Variables

| Variable         | Required | Description                             |
| ---------------- | -------- | --------------------------------------- |
| `AI_API_KEY`     | Yes      | API key for your AI provider            |
| `AI_IMAGE_KEY`   | No       | Separate key for image generation       |
| `GIT_SYNC_TOKEN` | No       | GitHub PAT for content sync             |
| `MCP_AUTH_TOKEN` | No       | Token for MCP HTTP authentication       |
| `CF_API_TOKEN`   | Yes\*    | Cloudflare API token for cert bootstrap |
| `CF_ZONE_ID`     | Yes\*    | Cloudflare zone ID for cert bootstrap   |

- Only required when running `brain cert:bootstrap`.

## Brain Models

v0.1.0 ships with **rover** — a personal knowledge management brain for independent professionals. It manages blog posts, presentations, portfolio projects, social media, newsletters, and a professional website.

## Documentation

- [brain.yaml Reference](https://github.com/rizom-ai/brains/blob/main/packages/brain-cli/docs/brain-yaml-reference.md)
- [Getting Started](https://github.com/rizom-ai/brains/blob/main/packages/brain-cli/docs/getting-started.md)
- [Deployment Guide](https://github.com/rizom-ai/brains/blob/main/packages/brain-cli/docs/deployment-guide.md)

## License

Apache-2.0
