# Rover onboarding plugin plan

## Status

Planned.

## Goal

Move Rover onboarding from ad hoc seed markdown into a first-party service plugin that owns onboarding content and lifecycle wiring while still using the existing `playbook` entity and `playbooks` runtime.

## Proposed shape

```txt
plugins/rover-onboarding/
  package.json
  src/index.ts
  content/playbook/
    rover-onboarding.md
    rover-first-knowledge-loop.md
  test/
```

The plugin should be thin: no new entity type, no replacement for `@brains/playbooks`, and no user-facing tools unless a concrete onboarding operation appears later.

## Responsibilities

- Bundle the Rover onboarding playbooks.
- Seed missing bundled playbooks as durable `playbook` entities.
- Preserve user-edited playbook entities.
- Provide Rover-specific onboarding instructions only if needed.
- Eventually own starter/lifecycle registration for the first web-chat prompt.

## Non-goals

- Do not create an `onboarding` entity type.
- Do not fork or duplicate `@brains/playbooks` behavior.
- Do not move all Rover eval infrastructure into the plugin in the first pass.
- Do not auto-overwrite operator-edited markdown.

## Open decisions

### Starter registration

Initial implementation can keep using existing config:

```yaml
plugins:
  playbooks:
    triggers:
      first-anchor-web-chat: true
```

Later, add a small `playbooks` extension channel so `rover-onboarding` can register its lifecycle starter directly with `playbooks`.

### Content seeding mechanism

Start with plugin `ready()` seeding:

- if bundled playbook entity is missing, create it from markdown;
- if present, leave it alone;
- store bundled hashes in runtime state for safe future migration checks.

Only add a shared bundled-content or multi-seed-path mechanism if other plugins need the same pattern.

### Updates and migrations

Default policy: create missing, never overwrite edited content.

Safe update policy can come later:

- update only if the existing entity content hash matches a previously bundled hash;
- otherwise report drift and leave content untouched.

## Implementation phases

### Phase 1 — extract plugin

1. Add `plugins/rover-onboarding` as a `ServicePlugin`.
2. Move canonical onboarding playbook markdown into plugin `content/playbook/`.
3. Add seeding logic in `ready()` using `entityService.createEntityFromMarkdown()`.
4. Add plugin tests for missing-content seed and no-overwrite behavior.
5. Add plugin to Rover capabilities after `playbook` and `playbooks`.
6. Keep current Rover seed/eval copies temporarily for compatibility.

### Phase 2 — remove duplicate ownership

1. Make plugin content the canonical source.
2. Replace Rover onboarding seed/eval copy checks with a sync/check test against plugin content.
3. Remove onboarding markdown from Rover seed content once plugin seeding is proven in app and eval boot.

### Phase 3 — lifecycle registration cleanup

1. Add a `playbooks` channel/API for plugins to register lifecycle starters.
2. Move `first-anchor-web-chat` starter ownership into `rover-onboarding`.
3. Keep `playbooks.triggers` config as a lower-level escape hatch.

## Validation

- Unit tests for plugin seeding behavior.
- Existing `brains/rover/test/onboarding-playbook-seed.test.ts`, updated for plugin source of truth.
- Targeted Rover multi-turn onboarding evals.
- Startup check for Rover with the plugin enabled.
