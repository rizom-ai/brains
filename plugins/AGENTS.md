# plugins/AGENTS.md

## Scope

This file applies to all packages under `plugins/`.

## Purpose

Service plugins provide operational capabilities such as:

- tools
- external integrations
- background jobs
- orchestration
- API routes when needed

## Required conventions

- Use `ServicePlugin` for plugin implementations here.
- Keep tool definitions explicit and narrow.
- Use Zod for tool inputs and plugin config.
- Import through `@brains/plugins`; avoid shell-internal imports.
- Keep integrations isolated from entity packages.

## Do not

- Do not define entity types here.
- Do not add markdown adapters here.
- Do not duplicate entity responsibilities.
- Do not blur transport concerns into service plugins unless required.

## Testing

- Test tool behavior and integration boundaries.
- Mock network and external APIs.
- Verify registration and execution paths.
- Prefer small, behavior-focused unit tests.

## References

- `docs/architecture-overview.md`
- `entities/AGENTS.md`
- `interfaces/AGENTS.md`
- Plugin examples in `plugins/*/src/`
