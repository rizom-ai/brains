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
brain init mybrain --recipe personal
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
  + canonical definition and explicit bundles
  = a running brain
    ├── Entities       typed content: blog post, link, deck, project, note, ...
    ├── Plugins        services and integrations: site builder, git sync, analytics, ...
    ├── Interfaces     transports: MCP, A2A, Discord, webserver, CLI
    └── Shell          core orchestration: storage, AI, jobs, messaging
```

The **canonical brain definition** is an ordered catalog of entities, plugins, and interfaces declared via `defineBrain()`. Fixed bundles compose that catalog deterministically.

A **brain instance** selects explicit bundles in `brain.yaml` and supplies its own identity, domain, theme, plugin config, permissions, and content.

**Entities** are typed content whose domain metadata schema is declared with `defineEntity()`. The runtime composes storage fields, markdown/frontmatter handling, validation, persistence, and search indexing.

**Packages** extend the brain through one declarative family:

- `defineEntityPackage()` — durable content and deterministic projections;
- `defineServicePlugin()` — tools, jobs, resources, templates, and integrations;
- `defineInterface()` — non-chat routes and supervised listeners;
- `defineMessageInterface()` — conversational and outbound channels; and
- `defineSite()` from `@rizom/site` — layouts, content sections, routes, and assets.

External packages default-export a definition. A brain-definition package imports those defaults and composes typed configured references through `use()`, `defineBundle()`, and `defineBrain()`. Runtime classes and YAML-loaded factories are not public authoring contracts.

**Interfaces** are how users and other agents talk to your brain. Built-in: MCP, A2A, Discord, webserver, CLI.

For the deeper picture: [Architecture Overview](../architecture-overview.md), [Plugin System](../plugin-system.md), [Entity Model](../entity-model.md).

---

## Configuration

The canonical brain is configured per instance via `brain.yaml`:

```yaml
brain: brain
bundles:
  - core
  - site
  - publishing
site:
  package: "@brains/site-default"
  theme: "@rizom/theme-default"
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

`brains` is designed to run as a single self-contained process on a small VM. `brain init <dir> --deploy` scaffolds a GitHub Actions + Kamal pipeline that builds a Docker image with everything baked in (Bun runtime, your brain code, native deps, embedding model) and runs it behind TLS, with a Cloudflare Origin CA certificate provisioned via `brain cert:bootstrap`.

See the [deployment guide](../../packages/brain-cli/docs/deployment-guide.md) for the full flow. Reference brains run on Hetzner Cloud at €5–10/month.

---

## What's in this repository

```
shell/                Core framework: orchestration, storage, AI, MCP, jobs, messaging
shared/               Utilities and primitives: themes, UI components, types, test helpers
entities/             Built-in entity types: blog, link, deck, project, note, topic, ...
plugins/              Built-in service plugins: site-builder, git sync, analytics, ...
interfaces/           Built-in interfaces: MCP, A2A, Discord, webserver, CLI
packages/brain-cli    Canonical definition, recipes, runtime assets, and CLI
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
- [Deployment](../../packages/brain-cli/docs/deployment-guide.md)
- [Stability commitments](./STABILITY.md)
- [Roadmap](../roadmap.md)

---

## License

Split model: the core (runtime, brain models, agents, CLI, deploy tooling, apps) is [AGPL-3.0-only](../../LICENSE); the SDK and contract packages (`@rizom/site`, `@rizom/ui`, the published `@rizom` themes, `@brains/contracts`, `@brains/atproto-contracts`) are Apache-2.0. Plugins, themes, and site packages built against the Apache-licensed interfaces are not considered derivative works of the runtime and may be licensed however their authors choose.

## Security

Security issues: see [SECURITY.md](SECURITY.md). **Do not file public issues for vulnerabilities.**

## Contributing

This project is in maintainer-only development mode. Bug reports and small fixes are welcome; large feature PRs are not accepted right now. See [CONTRIBUTING.md](CONTRIBUTING.md) for the full model and the criteria for opening up.
