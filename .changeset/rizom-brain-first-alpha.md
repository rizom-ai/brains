---
"@rizom/brain": patch
---

First public alpha of `@rizom/brain` — the umbrella package shipping
the brain CLI, runtime, and all built-in brain models (rover, ranger,
relay) as a single npm artifact.

Highlights since project start:

- **CLI**: `init`, `start`, `chat`, `eval`, `pin`, `tool`, plus
  `--remote` mode for talking to a running brain over MCP.
- **`init` scaffolds the unified app shape**: `brain.yaml` +
  `package.json` (pinning `@rizom/brain` and `preact`) +
  `tsconfig.json` + `README.md` + `.gitignore` +
  optional `.env` (when `--ai-api-key` is provided). Interactive
  prompts via `@clack/prompts` with non-interactive escape hatch.
- **Library export `@rizom/brain/site`** (Tier 1): re-exports
  `personalSitePlugin`, `PersonalLayout`, `routes`, plus the `Plugin`
  and `SitePackage` types — enough to compose a custom site package
  in a standalone brain repo. Hand-written `.d.ts` for now; see
  `docs/plans/library-exports.md` for the replacement plan.
- **Built-in brain models**: rover (general personal brain), ranger
  (collaborative — public source, no published artifact), relay
  (Rizom internal — public source, no published artifact).
- **Runtime**: shell + entity service + job queue + ai service +
  embedding service + identity service + content pipeline +
  templates + plugin manager. SQLite-backed, separate embedding DB,
  FTS5 + vector hybrid search.
- **Plugin types**: entity plugins, service plugins, interface
  plugins, core plugins, composite plugins (factories returning
  multiple plugins under one capability id).
- **Interfaces**: CLI, chat REPL, MCP (stdio + HTTP), webserver,
  Discord, Matrix, A2A.
- **Deploy**: Kamal-driven Hetzner deploys, multi-arch Docker images
  for rover via `publish-images.yml`, GitHub Actions release pipeline.

This is an **alpha**. Expect breaking changes between alpha versions.
Pin to a specific version, do not depend on `^0.1.0-alpha.0` resolving
to a stable contract.

See `docs/plans/public-release-cleanup.md` for the road from alpha
to v0.1.0.
