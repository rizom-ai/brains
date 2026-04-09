# sites/AGENTS.md

## Scope

This file applies to all packages under `sites/`.

## Purpose

Site packages combine layouts, routes, themes, and site-specific content into deployable site compositions.

## Required conventions

- Keep sites focused on composition, not core runtime services.
- Prefer layouts, themes, and shared UI over bespoke site-only implementations.
- Keep route and content wiring explicit and easy to trace.
- Use shared theme tokens and follow the theming guide for any visual changes.
- Preserve compatibility with the site builder and static build pipeline.

## Do not

- Do not move shell runtime logic into site packages.
- Do not define entity or service-plugin responsibilities here.
- Do not hardcode styling that bypasses the shared theme system.
- Do not create hidden cross-site coupling.

## Testing

- Test site composition, routing, and build behavior.
- Mock external integrations and file-system dependencies.
- When a change affects rendering, verify output in the relevant site package.

## References

- `docs/architecture-overview.md`
- `docs/theming-guide.md`
- `shared/AGENTS.md`
- Site examples under `sites/*/src/`
