# AGENTS.md

## Scope

This file applies to the whole repository unless a more specific `AGENTS.md` exists in a subdirectory.

## Working rules

- Make the smallest correct change.
- Prefer existing architecture and package boundaries.
- Keep answers concise; avoid long explanatory replies unless explicitly requested.
- Ask a clear yes/no question when requirements are ambiguous.
- Keep edits isolated to one file when possible.
- Preserve backward compatibility unless explicitly told otherwise.
- Do not assume Python is available; this machine has neither `python` nor `python3` installed.

## Validation

- Use the lightest relevant check set.
- Docs-only changes usually do not need typecheck, lint, or tests; run formatting if the edited markdown needs it. Use `bun run docs:check` when docs links or `docs/docs-manifest.yaml` change.
- For code changes, prefer targeted workspace checks first: `bun run typecheck`, relevant tests, and `bun run lint` or `bun run lint:fix`.
- Use full repo checks only when the change crosses shared contracts or multiple workspaces.
- Fix failing checks before continuing.
- Do not bypass tests or commit hooks.
- For app/site verification, remember this repo serves app-managed site-builder outputs, not just static site files. Start the app, then trigger a site rebuild **on the running app** via the app command surface (typically MCP HTTP via `--remote`, even for `localhost`) before inspecting generated output. When preview is configured, start with the default preview rebuild/output (`dist/site-preview`); production is separate (`dist/site-production`).
- Brain model test apps start from the model package directory with its preset scripts; do not invent alternate commands.
  - Rover: `cd brains/rover && bun start:core|start:default|start:full` (use `bun start:full` for the full Rover test app).
  - Relay: `cd brains/relay && bun start:core|start:default|start:full|start:docs`.
  - Ranger: no in-repo `test-apps` scripts currently; run a Ranger instance from its instance directory with `bunx brain start`.

## Architecture defaults

- Use schema-first, plugin-based patterns.
- Prefer shared packages over shell internals.
- Keep durable content entity-driven and markdown-based.
- Use Zod for validation and typed contracts.

## Documentation hierarchy

- Repository overview: `docs/architecture-overview.md`
- Shell rules: `shell/AGENTS.md`
- Shared package rules: `shared/AGENTS.md`
- Site rules: `sites/AGENTS.md`
- Entity rules: `entities/AGENTS.md`
- Service plugin rules: `plugins/AGENTS.md`
- Interface rules: `interfaces/AGENTS.md`

## When uncertain

- Ask a focused yes/no question.
- Offer at most two options when there is a tradeoff.
- Verify intended scope before large refactors.
