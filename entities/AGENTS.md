# entities/AGENTS.md

## Scope

This file applies to all packages under `entities/`.

## Purpose

Entity packages define durable content types. They usually provide:

- a Zod schema
- a markdown adapter
- optional generation handlers
- optional derivation logic
- optional templates and data sources

Entity packages do not expose CRUD tools.

## Required conventions

- Use `EntityPlugin` patterns only.
- Store content as markdown, usually with frontmatter.
- Keep metadata small, stable, and query-friendly.
- Use Zod for entity, config, and frontmatter validation.
- Import through `@brains/plugins`; avoid shell-internal imports.

## Responsibilities

- `schema`: validate the entity shape
- `adapter`: serialize and deserialize markdown
- `getDerivedEntityProjections()`: maintain derived entities with explicit projection jobs
- `generation handler`: only for AI-generated content types
- `templates` / `data sources`: only when the entity needs them

## Do not

- Do not add entity CRUD tools here.
- Do not mix service-plugin responsibilities into entity packages.
- Do not couple directly to shell internals.
- Do not bypass shared system tools for entity operations.

## Testing

- Prefer behavior-focused unit tests.
- Use the entity plugin harness when available.
- Mock external dependencies.
- Test schema validation, markdown conversion, and derivation behavior.

## Review questions

- Is this really an entity, or should it be a service plugin?
- Does this content belong in markdown with frontmatter?
- Is the metadata minimal and query-friendly?
- Is the package still isolated and composable?

## References

- `docs/architecture-overview.md`
- `plugins/AGENTS.md`
- Entity examples in `entities/*/src/`
