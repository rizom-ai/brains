# brains

**Run an AI agent built from your own knowledge.** Capture content as plain markdown files. Serve a website. Talk to it via Claude Desktop, Discord, or the CLI. Sync everything to git. Swap AI providers without rewriting a thing.

`brains` is an open framework for building self-hosted personal AI agents. You define what content types your brain understands, which integrations it has, and how it connects to the outside world. The framework handles the orchestration: storage, embeddings, MCP/A2A protocols, AI generation, site building, deployment.

> **Status:** `v0.1.0` — pre-stable. The architecture is settled but the API surface will change before `1.0`. See [STABILITY.md](STABILITY.md) for what's stable today and what isn't.

> **Contribution model:** maintainer-only development. Bug reports and small fixes welcome; large feature PRs are not accepted right now. See [CONTRIBUTING.md](CONTRIBUTING.md) for the rationale and exit criteria.

---

## What this is for

- Self-hosting an AI agent that knows what _you_ know — your blog posts, notes, links, decks, projects, contacts
- Treating your knowledge as plain markdown files you own forever, not rows in someone else's database
- Exposing that knowledge to AI assistants (Claude Desktop, Cursor, Copilot Chat) via the Model Context Protocol
- Publishing a static site driven by the same content, with built-in blog / portfolio / decks / link collections
- Running it cheaply on a single small VM (deploys fit comfortably on a €5/month Hetzner instance)
- Choosing your own AI provider — Anthropic, OpenAI, local models via OpenAI-compatible APIs, or your own bridge

## What this is **not** for

- A SaaS replacement. There's no hosted "brains as a service." You run it.
- A multi-tenant platform. One brain per process. If you want a shared team brain, deploy a brain that the team connects to.
- A general-purpose AI agent framework. The opinionated entity model and plugin lifecycle are designed for _personal knowledge agents specifically_. If you're building a coding agent or a customer support bot, use something else.
- A drop-in Notion/Obsidian replacement. There are import/export plugins, but the storage and access model is its own thing.
- A research project in autonomous agents. Brains are explicitly tool-using assistants under user control, not autonomous loops.

---

## Quickstart

```bash
bun add -g @rizom/brain
brain init mybrain --model rover
cd mybrain && brain start
```

That's it. You now have:

- A web server on `localhost:3000` serving your site plus browser routes like `/dashboard` and `/cms`
- An MCP server on `localhost:3001` your AI assistant can connect to
- An A2A endpoint on `localhost:3002` for agent-to-agent calls
- A dashboard at `localhost:3000/dashboard` and CMS at `localhost:3000/cms`
- Markdown files in `./brain-data/` you can edit with any editor

Connect Claude Desktop or Cursor by adding to your MCP config:

```json
{
  "mcpServers": {
    "mybrain": {
      "command": "brain",
      "args": ["start", "--mcp-only"],
      "cwd": "/absolute/path/to/mybrain"
    }
  }
}
```

Now Claude can read, search, create, and update entities in your brain.

---

## How it works

```
brain.yaml (instance config)
  + brain model (e.g. rover)
  = a running brain
    ├── Entities       typed content: blog post, link, deck, project, note, ...
    ├── Plugins        services and integrations: site builder, git sync, notion, ...
    ├── Interfaces     transports: MCP, A2A, Discord, webserver, CLI
    └── Shell          core orchestration: storage, AI, jobs, messaging
```

A **brain model** is a curated bundle of entity types, plugins, and interfaces — declared in code via `defineBrain()`. The shipped reference model is `rover`, a personal-knowledge brain with blog, links, decks, projects, and notes.

A **brain instance** is a deployment of a brain model on your infrastructure, configured via `brain.yaml`. The same model can be deployed many times with different domains, themes, plugin configs, and content.

**Entities** are typed content with a Zod schema, a markdown adapter, and an AI generation handler. Every entity is a markdown file with frontmatter, stored on disk and indexed in SQLite for search.

**Plugins** extend the brain. Public authoring base classes:

- `EntityPlugin` — defines a content type (e.g. blog posts, links, topics)
- `ServicePlugin` — provides tools, jobs, and external integrations (e.g. site building, sync, analytics)
- `InterfacePlugin` — exposes the brain via a non-chat transport or daemon (e.g. MCP, A2A, webserver)
- `MessageInterfacePlugin` — optional chat/channel transport base for integrations like Discord, Slack, Teams, Matrix, or Telegram

External plugins import these from `@rizom/brain/plugins` and are loaded through keyed `brain.yaml plugins:` entries.

**Interfaces** are how users and other agents talk to your brain. Built-in: MCP, A2A, Discord, webserver, CLI.

For the deeper picture: [Architecture Overview](../architecture-overview.md), [Plugin System](../plugin-system.md), [Entity Model](../entity-model.md).

---

## Configuration

Everything beyond the brain model is configured per-instance via `brain.yaml`:

```yaml
brain: rover
site:
  package: "@brains/site-default"
  theme: "@brains/theme-default"
preset: full
domain: mybrain.example.com

anchors:
  - "discord:000000000000000000"

plugins:
  directory-sync:
    git:
      repo: your-org/your-content
      authToken: ${GIT_SYNC_TOKEN}
  mcp:
    authToken: ${MCP_AUTH_TOKEN}
```

Secrets stay in `.env`; everything else goes in `brain.yaml`. Full reference: [packages/brain-cli/docs/brain-yaml-reference.md](../../packages/brain-cli/docs/brain-yaml-reference.md).

---

## Compatibility

| Requirement      | Version                                            |
| ---------------- | -------------------------------------------------- |
| **Bun**          | ≥ 1.3.3                                            |
| **OS**           | macOS 13+, Linux (x64 and arm64), Windows via WSL2 |
| **Node**         | not supported as a runtime — Bun-only              |
| **Architecture** | x64, arm64                                         |

Native dependencies (`sharp` for image processing, `@libsql/client` or `better-sqlite3` for the database) ship as `optionalDependencies`. The framework picks the right one for your platform automatically.

---

## Deployment

`brains` is designed to run as a single self-contained process on a small VM. The shipped deployment recipe builds a Docker image with everything baked in (Bun runtime, your brain code, native deps, embedding model) and runs it behind TLS with one command.

```bash
brain build --model rover
brain deploy --provider hetzner
```

See [deploy/README.md](../../deploy/README.md) for the full deployment guide. Reference brains run on Hetzner Cloud at €5–10/month. Other providers (Fly.io, Railway, generic Docker hosts) work with minor recipe edits.

---

## What's in this repository

```
shell/                Core framework: orchestration, storage, AI, MCP, jobs, messaging
shared/               Utilities and primitives: themes, UI components, types, test helpers
entities/             Built-in entity types: blog, link, deck, project, note, topic, ...
plugins/              Built-in service plugins: site-builder, git sync, notion, hackmd, ...
interfaces/           Built-in interfaces: MCP, A2A, Discord, webserver, CLI
brains/rover          Reference brain model
sites/                Site packages: default, personal, professional, rizom
packages/brain-cli    The `brain` command-line tool
docs/                 Architecture, plugin development, deployment, theming
```

---

## Documentation

- [Architecture overview](../architecture-overview.md)
- [Brain model + instance configuration](../brain-model.md)
- [Entity model](../entity-model.md)
- [Plugin system](../plugin-system.md) and [external plugin authoring](../external-plugin-authoring.md)
- [`brain.yaml` reference](../../packages/brain-cli/docs/brain-yaml-reference.md)
- [Theming guide](../theming-guide.md)
- [Deployment](../../deploy/README.md)
- [Stability commitments](./STABILITY.md)
- [Roadmap](../roadmap.md)

---

## License

[Apache-2.0](../../LICENSE)

## Security

Security issues: see [SECURITY.md](SECURITY.md). **Do not file public issues for vulnerabilities.**

## Contributing

This project is in maintainer-only development mode. Bug reports and small fixes are welcome; large feature PRs are not accepted right now. See [CONTRIBUTING.md](CONTRIBUTING.md) for the full model and the criteria for opening up.
