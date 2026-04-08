# shared/AGENTS.md

## Scope

This file applies to all packages under `shared/`.

## Purpose

Shared packages provide reusable utilities, UI components, themes, and test helpers used across the repo.

## Required conventions

- Keep code generic, reusable, and side-effect free when possible.
- Avoid app-specific, brain-specific, or runtime orchestration logic.
- Prefer stable, composable APIs over convenience wrappers that only work in one workspace.
- Use Zod where shared configuration or public contracts need validation.
- Keep theme packages aligned with the theming guide and semantic token model.

## Do not

- Do not depend on app-local runtime state.
- Do not add shell-only orchestration here.
- Do not leak private implementation details through public shared APIs.
- Do not mix unrelated concerns into a single shared package.

## Testing

- Test shared behavior directly and keep tests minimal.
- Mock external dependencies.
- Verify public APIs, serialization, and package-level invariants.
- If a change affects multiple consumers, prefer targeted tests over broad integration suites.

## References

- `docs/architecture-overview.md`
- `docs/theming-guide.md`
- `shell/AGENTS.md`
- `packages/test-utils` and `shared/*/src/` examples
