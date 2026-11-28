# brains documentation

Start here if you want to install `brains`, create a local brain, connect it to tools, or deploy it.

Current release status: `0.2.0` alpha; stable nomination is pending the final authoring, live/eval, and deployment evidence listed in the [roadmap](./roadmap.md).

If you are new, read these in order:

1. [Getting Started](../packages/brain-cli/docs/getting-started.md)
2. [Feature Overview](./feature-overview.md)
3. [Content Management](./content-management.md)
4. [Interface Setup](./interface-setup.md)
5. [Customization Guide](./customization-guide.md)
6. [Deployment Guide](../packages/brain-cli/docs/deployment-guide.md)

## Setup and operation

- [Getting Started](../packages/brain-cli/docs/getting-started.md) — install the CLI, create a brain, and start it locally
- [Feature Overview](./feature-overview.md) — user-facing guide to the knowledge, publishing, interface, integration, and operational features available today
- [CLI Reference](../packages/brain-cli/docs/cli-reference.md) — commands such as `brain init`, `brain start`, `brain chat`, and `brain tool`
- [brain.yaml Reference](../packages/brain-cli/docs/brain-yaml-reference.md) — the main configuration file
- [Deployment Guide](../packages/brain-cli/docs/deployment-guide.md) — deploy to a server with the generated Docker/Kamal workflow

## Moving in

- [Moving in as a writer](./guides/writer.md) — years of essays and drafts
- [Moving in as a researcher](./guides/researcher.md) — notes, papers, and saved links
- [Moving in as a consultant](./guides/consultant.md) — client work, decks, and a profile
- [Moving in as a team](./guides/team.md) — what a team knows, in one place
- [Running your own brain](./guides/self-hosting.md) — your own server, content, and domain

## Content

- [Content Management](./content-management.md) — create, edit, sync, and publish markdown content
- [Studio](./studio.md) — the signed-in browser workspace for content, the Inbox, publishing, chat, and settings, plus guest Ask and the public dashboard
- [The Drive and Obsidian](./drive-and-obsidian.md) — mount the brain as a network drive and keep an Obsidian vault in step
- [Directory Sync Git Overview](./directory-sync-git.md) — git-style lifecycle and conflict policy for synced content directories
- [Entity Types Reference](./entity-types-reference.md) — built-in content types and their fields
- [Entity Model](./entity-model.md) — how markdown files, frontmatter, and schemas fit together
- [Seminars](./seminars.md) — hold a structured discussion between peer brains and publish it

## Connecting clients and services

- [Interface Setup](./interface-setup.md) — MCP, guest web chat, Discord, Slack, and Matrix chat, email, A2A, and the local chat REPL
- [Publishing Integrations and Site Add-ons](./publishing-integrations.md) — LinkedIn, newsletters, AT Protocol, analytics, and stock photos, plus contact forms, quizzes, and other forms
- [MCP Inspector Guide](./mcp-inspector-guide.md) — debug MCP connections and tool calls

## Customization

- [Customization Guide](./customization-guide.md) — change bundles, content, themes, sites, and plugins
- [Site Mockup Migration](./site-mockup-migration.md) — prototype a site in an AI coding tool, then move it into Brain routes, sections, content, and themes
- [Theming Guide](./theming-guide.md) — theme tokens, CSS layers, and custom themes
- [Plugin System](./plugin-system.md) — how built-in and custom plugins are organized
- [Package Authoring Quick Reference](./plugin-quick-reference.md) — a checklist for choosing a definition family, with import, config, template, and lifecycle rules
- [Package Quickstart](./package-quickstart.md) — write, test and compose one package with the two-stage definition
- [External Package Authoring](./external-plugin-authoring.md) — package, test, and load your own plugin packages
- [External Site and Theme Authoring](./external-site-authoring.md) — publish independently hosted site and theme packages through the public npm contract

## Architecture

These are useful once you are extending or contributing to the framework:

- [Architecture Overview](./architecture-overview.md)
- [Brain Model](./brain-model.md)
- [Agent Discovery](./agent-discovery.md) — how a brain finds capabilities in itself and calls other brains
- [ATProto Lexicons](./atproto-lexicons.md) — the AT Protocol lexicons published under `ai.rizom.brain`

## Status and contributing

- [Roadmap](./roadmap.md) — maintainer roadmap and release priorities
- [Stability Policy](../STABILITY.md) — what is stable during the `0.x` series
- [Changelog](../CHANGELOG.md)
- [Known Issues](../KNOWN-ISSUES.md)
- [Contributing](../CONTRIBUTING.md)
- [Security](../SECURITY.md)

Maintainer planning notes, prototypes, and design mockups still live under `docs/plans/`, `docs/prototypes/`, and `docs/design/`, but they are not part of the primary documentation path.

### Console design references

- [Studio chrome mockup](./studio-chrome-mockups.html) — current single-shell authenticated Studio and anonymous Dashboard direction
- [Console unification mockups](./console-unification-mockups.html) — historical desktop reference for the retired cross-product strip
- [Responsive console mockups](./console-responsive-mockups.html) — historical desktop, tablet, and phone compositions before Studio consolidation
