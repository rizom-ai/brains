# brains documentation

Start here if you want to install `brains`, create a local brain, connect it to tools, or deploy it.

If you are new, read these in order:

1. [Getting Started](../packages/brain-cli/docs/getting-started.md)
2. [Content Management](./content-management.md)
3. [Interface Setup](./interface-setup.md)
4. [Customization Guide](./customization-guide.md)
5. [Deployment Guide](../packages/brain-cli/docs/deployment-guide.md)

## Setup and operation

- [Getting Started](../packages/brain-cli/docs/getting-started.md) — install the CLI, create a brain, and start it locally
- [CLI Reference](../packages/brain-cli/docs/cli-reference.md) — commands such as `brain init`, `brain start`, `brain chat`, and `brain tool`
- [brain.yaml Reference](../packages/brain-cli/docs/brain-yaml-reference.md) — the main configuration file
- [Deployment Guide](../packages/brain-cli/docs/deployment-guide.md) — deploy to a server with the generated Docker/Kamal workflow

## Content

- [Content Management](./content-management.md) — create, edit, sync, and publish markdown content
- [Entity Types Reference](./entity-types-reference.md) — built-in content types and their fields
- [Entity Model](./entity-model.md) — how markdown files, frontmatter, and schemas fit together

## Connecting clients and services

- [Interface Setup](./interface-setup.md) — MCP, web, Discord, A2A, and local chat setup
- [MCP Inspector Guide](./mcp-inspector-guide.md) — debug MCP connections and tool calls

## Customization

- [Customization Guide](./customization-guide.md) — change presets, content, themes, sites, and plugins
- [Theming Guide](./theming-guide.md) — theme tokens, CSS layers, and custom themes
- [Plugin System](./plugin-system.md) — how built-in and custom plugins are organized
- [Plugin Quick Reference](./plugin-quick-reference.md) — concise plugin API reference
- [External Plugin Authoring](./external-plugin-authoring.md) — package and load external plugins

## Architecture

These are useful once you are extending or contributing to the framework:

- [Architecture Overview](./architecture-overview.md)
- [Brain Models](./brain-model.md)

## Status and contributing

- [Roadmap](./roadmap.md) — maintainer roadmap and release priorities
- [Stability Policy](../STABILITY.md) — what is stable during the `0.x` series
- [Changelog](../CHANGELOG.md)
- [Known Issues](../KNOWN-ISSUES.md)
- [Contributing](../CONTRIBUTING.md)
- [Security](../SECURITY.md)

Maintainer planning notes, prototypes, and design mockups still live under `docs/plans/`, `docs/prototypes/`, and `docs/design/`, but they are not part of the primary documentation path.
