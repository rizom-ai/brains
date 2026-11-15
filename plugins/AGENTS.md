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

- Packages here are `defineServicePlugin` definitions, imported through `@brains/sdk`.
- Keep tool definitions explicit and narrow.
- Use Zod for tool inputs and plugin config.
- A package imports `@brains/sdk` and its `@brains/sdk/internal/*` entries, never `@brains/plugins` or another shell package; `arch:check` refuses it in production code.
- Keep integrations isolated from standalone entity packages.
- For a tightly coupled 1:1 entity + service capability, keep both parts in one compound package under `plugins/`; put entity schemas/adapters under `src/entity/`.
- Make a request or command to another package through a bus contract (`defineBusContract` in `@brains/contracts`, then `context.messaging.request/gather/command/answer`); enqueue another package's job through a job contract (`defineJobContract`). Broadcast an event with `context.messaging.broadcast(channel, payload)` on its typed channel (`defineChannel`); the plugin context has no raw `send`. See `shell/messaging-service/README.md`.

## Do not

- Do not define standalone entity types here; only compound packages may own entity schemas/adapters.
- Do not add markdown adapters here unless the package is an approved compound package.
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
