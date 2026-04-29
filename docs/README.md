# brains documentation

This is the canonical table of contents for `brains` docs.

If you are new, start with the quickstart and then read the content, interface, and customization guides in that order.

## Start here

- [Getting Started](../packages/brain-cli/docs/getting-started.md) — install the CLI, create a brain, and start it locally
- [CLI Reference](../packages/brain-cli/docs/cli-reference.md) — `brain init`, `brain start`, `brain chat`, `brain tool`, remote mode, deploy helpers
- [brain.yaml Reference](../packages/brain-cli/docs/brain-yaml-reference.md) — instance config, presets, plugin config, permissions, secrets
- [Deployment Guide](../packages/brain-cli/docs/deployment-guide.md) — standalone deployment, Docker/Kamal flow, domains, secrets

## Content and entities

- [Content Management Guide](./content-management.md) — create/edit content through chat/MCP tools, CMS, markdown files, directory sync, and generation jobs
- [Entity Types Reference](./entity-types-reference.md) — built-in entity types, model availability, frontmatter fields, and publishing entities
- [Entity Model](./entity-model.md) — architecture of schema-backed markdown entities and adapters

## Interfaces

- [Interface Setup Guide](./interface-setup.md) — MCP, webserver, Discord, A2A, and chat REPL setup
- [MCP Inspector Guide](./mcp-inspector-guide.md) — inspect and debug MCP behavior

## Customization

- [Customization Guide](./customization-guide.md) — configure instances, customize content, themes, sites/layouts, and plugin boundaries
- [Theming Guide](./theming-guide.md) — theme tokens, dark mode, CSS layering, and theme package patterns
- [Plugin System](./plugin-system.md) — high-level entity/service/interface plugin model
- [Plugin Quick Reference](./plugin-quick-reference.md) — concise plugin reference
- [Plugin Development Patterns](./plugin-development-patterns.md) — pointers to the current implementation guides

## Architecture

- [Architecture Overview](./architecture-overview.md) — repository architecture and runtime flow
- [Brain Models](./brain-model.md) — brain models, presets, instances, and capability composition
- [Tech Stack](./tech-stack.md) — major libraries and package roles
- [Package Structure](./architecture/package-structure.md) — package layout and boundaries
- [Hydration Pattern](./hydration-pattern.md) — frontend hydration conventions
- [Development Workflow](./development-workflow.md) — local development commands and expectations

## Planning and release readiness

- [Roadmap](./roadmap.md) — current status, recently completed work, near-term priorities, and long-term direction
- [Documentation Plan](./plans/documentation.md) — completed user-facing docs phases plus maintenance backlog
- [Docs Manifest](./docs-manifest.yaml) — curated source docs list for docs-site sync
- [`doc-brain` Remaining Work](https://github.com/rizom-ai/doc-brain/blob/main/docs/remaining-work.md) — standalone docs app/deploy follow-up
- [Content Remote Bootstrap Plan](./plans/content-remote-bootstrap.md) — directory-sync-owned bootstrap for seeded git content remotes
- [Public Release Cleanup Plan](./plans/public-release-cleanup.md) — public repo cleanup plan
- [Rizom Site Composition Plan](./plans/rizom-site-composition.md) — completed shared Rizom site/theme boundary and extracted app guardrails
- [Rizom Site Follow-ups](./plans/rizom-site-tbd.md) — external product/content follow-ups for extracted Rizom apps

## Generated and prototype docs

The repository also contains design/prototype HTML files and planning notes that are useful for maintainers but are not the primary user documentation path:

- [`docs/design/`](./design/)
- [`docs/prototypes/`](./prototypes/)
- [`docs/plans/`](./plans/)

## External status files

- [Stability Policy](../STABILITY.md)
- [Changelog](../CHANGELOG.md)
- [Known Issues](../KNOWN-ISSUES.md)
- [Contributing](../CONTRIBUTING.md)
- [Security](../SECURITY.md)
