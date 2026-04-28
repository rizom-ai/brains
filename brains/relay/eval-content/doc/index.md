---
title: "Documentation"
section: "Start here"
order: 0
sourcePath: "docs/README.md"
slug: "index"
description: "This is the canonical table of contents for brains docs."
---

# brains documentation

This is the canonical table of contents for `brains` docs.

If you are new, start with the quickstart and then read the content, interface, and customization guides in that order.

## Start here

- [Getting Started](/docs/getting-started) — install the CLI, create a brain, and start it locally
- [CLI Reference](/docs/cli-reference) — `brain init`, `brain start`, `brain chat`, `brain tool`, remote mode, deploy helpers
- [brain.yaml Reference](/docs/brain-yaml-reference) — instance config, presets, plugin config, permissions, secrets
- [Deployment Guide](/docs/deployment-guide) — standalone deployment, Docker/Kamal flow, domains, secrets

## Content and entities

- [Content Management Guide](/docs/content-management) — create/edit content through chat/MCP tools, CMS, markdown files, directory sync, and generation jobs
- [Entity Types Reference](/docs/entity-types-reference) — built-in entity types, model availability, frontmatter fields, and publishing entities
- [Entity Model](/docs/entity-model) — architecture of schema-backed markdown entities and adapters

## Interfaces

- [Interface Setup Guide](/docs/interface-setup) — MCP, webserver, Discord, A2A, and chat REPL setup
- [MCP Inspector Guide](/docs/mcp-inspector-guide) — inspect and debug MCP behavior

## Customization

- [Customization Guide](/docs/customization-guide) — configure instances, customize content, themes, sites/layouts, and plugin boundaries
- [Theming Guide](/docs/theming-guide) — theme tokens, dark mode, CSS layering, and theme package patterns
- [Plugin System](/docs/plugin-system) — high-level entity/service/interface plugin model
- [Plugin Quick Reference](/docs/plugin-quick-reference) — concise plugin reference
- [Plugin Development Patterns](/docs/plugin-development-patterns) — pointers to the current implementation guides

## Architecture

- [Architecture Overview](/docs/architecture-overview) — repository architecture and runtime flow
- [Brain Models](/docs/brain-model) — brain models, presets, instances, and capability composition
- [Tech Stack](/docs/tech-stack) — major libraries and package roles
- [Package Structure](/docs/package-structure) — package layout and boundaries
- [Hydration Pattern](/docs/hydration-pattern) — frontend hydration conventions
- [Development Workflow](/docs/development-workflow) — local development commands and expectations

## Planning and release readiness

- [Roadmap](/docs/roadmap) — current status, recently completed work, near-term priorities, and long-term direction
- [Documentation Plan](/docs/documentation-plan) — user-facing docs phases and remaining doc-site work
- [Docs Manifest](https://github.com/rizom-ai/brains/blob/main/docs/docs-manifest.yaml) — curated source docs list for docs-site sync
- [Docs Site Plan](/docs/docs-site-plan) — `doc` entity, manifest, and docs-site sync/deploy ownership
- [Content Remote Bootstrap Plan](https://github.com/rizom-ai/brains/blob/main/docs/plans/content-remote-bootstrap.md) — directory-sync-owned bootstrap for seeded git content remotes
- [Public Release Cleanup Plan](/docs/public-release-cleanup) — public repo cleanup plan
- [Rizom Site Composition Plan](/docs/rizom-site-composition) — shared Rizom site/theme boundary and extracted app guardrails
- [Rizom Site TBD](/docs/rizom-site-tbd) — product/content follow-ups for extracted Rizom apps

## Generated and prototype docs

The repository also contains design/prototype HTML files and planning notes that are useful for maintainers but are not the primary user documentation path:

- [`docs/design/`](https://github.com/rizom-ai/brains/tree/main/docs/design/)
- [`docs/prototypes/`](https://github.com/rizom-ai/brains/tree/main/docs/prototypes/)
- [`docs/plans/`](https://github.com/rizom-ai/brains/tree/main/docs/plans/)

## External status files

- [Stability Policy](https://github.com/rizom-ai/brains/blob/main/STABILITY.md)
- [Changelog](https://github.com/rizom-ai/brains/blob/main/CHANGELOG.md)
- [Known Issues](https://github.com/rizom-ai/brains/blob/main/KNOWN-ISSUES.md)
- [Contributing](https://github.com/rizom-ai/brains/blob/main/CONTRIBUTING.md)
- [Security](https://github.com/rizom-ai/brains/blob/main/SECURITY.md)
