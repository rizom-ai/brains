# shell/AGENTS.md

## Scope

This file applies to all packages under `shell/`.

## Purpose

Shell packages implement the runtime, services, and plugin framework. They own core behavior such as loading brains, registering plugins, managing conversations, jobs, MCP, identity, and messaging.

## Required conventions

- Keep runtime code stable and dependency-directed toward shared abstractions.
- Prefer `@brains/plugins` and shared packages over direct coupling between shell packages.
- Use Zod for configs, contracts, and externally consumed inputs.
- Keep shared runtime behavior centralized; do not duplicate it in plugins or apps.
- Preserve boot order, registration order, and lifecycle behavior when changing core services.

## Do not

- Do not put entity definitions, transport logic, or app-specific config here.
- Do not introduce circular dependencies between shell packages.
- Do not expose internal implementation details unless they are part of a stable package API.

## Testing

- Prefer focused unit tests around behavior and lifecycle.
- Mock external systems and long-lived services.
- When changing runtime orchestration, test initialization, registration, and shutdown paths.
- Run the smallest useful check set for the affected packages first.

## References

- `docs/architecture-overview.md`
- `plugins/AGENTS.md`
- `entities/AGENTS.md`
- Shell package examples under `shell/*/src/`
