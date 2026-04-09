# Changelog

All notable changes to `brains` will be documented in this file.

The project follows the pre-`1.0` stability policy described in [STABILITY.md](STABILITY.md): breaking changes may land in minor releases until `1.0`.

## [0.1.0] - Initial public release

First public release of the `brains` framework.

### Added

- Bun-based runtime and CLI for scaffolding and running brain instances
- `brain init`, `brain start`, `brain chat`, `brain eval`, `brain diagnostics`, `brain pin`, and direct tool invocation via `brain tool`
- markdown-backed entity system with schema-validated frontmatter
- MCP resources and system tools for create, update, delete, get, list, search, extract, status, and insights
- plugin architecture split into `EntityPlugin`, `ServicePlugin`, and `InterfacePlugin`
- built-in interfaces for MCP, webserver, A2A, Discord, and chat REPL
- static-site generation with reusable site packages, independent theme packages, and layout packages
- published `@rizom/brain/site` and `@rizom/brain/themes` authoring surfaces
- rover as the public reference brain model
- public source for ranger and relay as internal-use models that power the rizom apps in this repo
- deployment recipes for self-hosted operation

### Changed

- site packages are structural-only; themes resolve independently
- standalone site authoring now supports local `src/site.ts` and `src/theme.css` conventions
- `brain init` now scaffolds local site/theme files while keeping model-pinned site/theme defaults in `brain.yaml`
- lightweight app instances are no longer workspace packages

### Notes

- `brains` is pre-stable in the `0.x` series
- Apache-2.0 licensed
- maintainer-led development model; see [CONTRIBUTING.md](CONTRIBUTING.md)

[0.1.0]: https://github.com/rizom-ai/brains/releases/tag/v0.1.0
