# AGENTS.md

## Scope

This file applies to the whole repository unless a more specific `AGENTS.md` exists in a subdirectory.

## Working rules

- Make the smallest correct change.
- Prefer existing architecture and package boundaries.
- Ask a clear yes/no question when requirements are ambiguous.
- Keep edits isolated to one file when possible.
- Preserve backward compatibility unless explicitly told otherwise.

## Validation

- Use the lightest relevant check set.
- Docs-only changes usually do not need typecheck, lint, or tests; run formatting if the edited markdown needs it.
- For code changes, prefer targeted workspace checks first: `bun run typecheck`, relevant tests, and `bun run lint` or `bun run lint:fix`.
- Use full repo checks only when the change crosses shared contracts or multiple workspaces.
- Fix failing checks before continuing.
- Do not bypass tests or commit hooks.

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
