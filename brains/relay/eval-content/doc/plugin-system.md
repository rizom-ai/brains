---
title: "Plugin System"
section: "Customization"
order: 120
sourcePath: "docs/plugin-system.md"
slug: "plugin-system"
description: "brains is composed from three plugin families:"
---

# Plugin System

`brains` is composed from three plugin families:

- **Entity plugins** — define typed markdown content, schemas, indexing behavior, and entity-specific create/extract hooks
- **Service plugins** — provide tools, jobs, integrations, and background behavior such as site building, syncing, analytics, or publishing
- **Interface plugins** — expose a running brain over transports like MCP, web, Discord, A2A, or the chat REPL

## How plugins fit together

A **brain model** declares the available plugins and presets.

A **brain instance** selects a preset, can `add` or `remove` individual plugins in `brain.yaml`, and can override per-plugin configuration under `plugins:`.

At runtime, the shell loads the selected plugins, wires them into shared services, and exposes the combined tool/resource/interface surface.

## Read next

- [Architecture Overview](/docs/architecture-overview)
- [Brain Model & Instance Architecture](/docs/brain-model)
- [Plugin Development Patterns](/docs/plugin-development-patterns)
- [Plugin Quick Reference](/docs/plugin-quick-reference)
- [entities/AGENTS.md](https://github.com/rizom-ai/brains/blob/main/entities/AGENTS.md)
- [plugins/AGENTS.md](https://github.com/rizom-ai/brains/blob/main/plugins/AGENTS.md)
- [interfaces/AGENTS.md](https://github.com/rizom-ai/brains/blob/main/interfaces/AGENTS.md)
- [plugins/examples/](https://github.com/rizom-ai/brains/tree/main/plugins/examples/)

## Note on plugin authoring docs

The older standalone plugin-authoring docs have been consolidated into the repository `AGENTS.md` files and example packages. This page exists as the stable entry point referenced by the README, roadmap, and contributing docs.
