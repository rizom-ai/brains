# Rover onboarding plugin plan

## Status

Planned.

## Goal

Give Rover onboarding a single owner. Today it is smeared across seed-content
markdown, Rover's `playbooks` lifecycle/`triggers` config, eval-content copies, and
a sync test. Fold that into one first-party service plugin so onboarding is one
module that can be **toggled on or off as a unit** — drop the plugin and there is
no onboarding starter, so the web-chat overlay card disappears — while still using
the existing `playbook` entity and `playbooks` runtime.

Seeding the content is a mechanism this plugin uses, not its reason to exist; the
reason is ownership + the enable/disable lever.

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

- Be the single owner of onboarding: enabling the plugin enables the whole
  onboarding experience (content + starter + overlay card); removing it removes it.
- Bundle the Rover onboarding playbooks and seed missing ones as durable `playbook`
  entities (mechanism — see Open decisions).
- Preserve operator-edited playbook entities (do not overwrite).
- Provide Rover-specific onboarding instructions only if needed.

## Non-goals

- Do not create an `onboarding` entity type.
- Do not fork or duplicate `@brains/playbooks` behavior.
- Do not move all Rover eval infrastructure into the plugin in the first pass.
- Do not auto-overwrite operator-edited markdown.

## Open decisions

### Starter registration

No new registration API is needed. The completed `playbooks` engine already
resolves lifecycle starters from **playbook entity frontmatter** (its metadata
scan), in addition to Rover's `lifecycle:` config. So once this plugin seeds
`rover-onboarding.md` as an entity, that entity's own frontmatter
(`trigger`/`lifecycle`/`starterText`/`starterPrompt`) registers the starter — which
drives the web-chat overlay card via `playbooks:lifecycle-starters`.

So the plan is: rely on the seeded entity's frontmatter for the starter, and retire
the Rover `playbooks.triggers.first-anchor-web-chat` config entry once the plugin
owns the content. Do **not** add a `playbooks` extension channel for cross-plugin
starter registration; two mechanisms already exist and a third is unjustified
(single-brain model — no fleet to register across).

### Content seeding mechanism

This must reconcile with the **existing** seeding path: onboarding markdown is
currently seeded by `directory-sync` copying `seed-content-*`. This plugin's
`onReady()` + `entityService.createEntityFromMarkdown()` would be a second path, so
pick one and do not run both against the same playbooks (see Phase 1):

- if bundled playbook entity is missing, create it from markdown;
- if present, leave it alone (note: `directory-sync` likely already implements this
  create-missing/preserve policy — reuse it rather than reinvent it);
- store bundled hashes in runtime state for safe future migration checks.

`onReady()` is the override hook (`ready()` is the public dispatcher). Also decide
**how bundled markdown is read at runtime** — no plugin uses a `content/` dir today,
so choose `fs` read via `import.meta.dir`, a `.md` import, or inlined strings before
building it.

### Updates and migrations

Default policy: create missing, never overwrite edited content.

Safe update policy can come later:

- update only if the existing entity content hash matches a previously bundled hash;
- otherwise report drift and leave content untouched.

## Implementation phases

### Phase 1 — extract plugin

1. Add `plugins/rover-onboarding` as a `ServicePlugin`.
2. Move canonical onboarding playbook markdown into plugin `content/playbook/`.
3. Add seeding logic in the `onReady()` override using
   `entityService.createEntityFromMarkdown()`.
4. Add plugin tests for missing-content seed and no-overwrite behavior.
5. Add plugin to Rover capabilities after `playbook` and `playbooks`.
6. Per the seeding-mechanism decision, do **not** leave a second active path seeding
   the same playbooks. If the plugin owns seeding, remove the duplicate
   `seed-content` copies in this pass; if it contributes a path to `directory-sync`,
   don't also seed directly.

### Phase 2 — remove duplicate ownership

1. Make plugin content the canonical source.
2. Replace Rover onboarding seed/eval copy checks with a sync/check test against plugin content.
3. Remove onboarding markdown from Rover seed content once plugin seeding is proven in app and eval boot.

### Phase 3 — retire the standalone trigger config

1. Confirm the starter is driven by the seeded entity's frontmatter (no new API).
2. Remove the Rover `playbooks.triggers.first-anchor-web-chat` config entry now that
   the plugin owns the onboarding content that carries the lifecycle wiring.
3. Verify the web-chat overlay card still appears (and disappears when the plugin is
   removed) — this is the enable/disable lever working end to end.

## Validation

- Unit tests for plugin seeding behavior.
- Existing `brains/rover/test/onboarding-playbook-seed.test.ts`, updated for plugin source of truth.
- Targeted Rover multi-turn onboarding evals.
- Startup check for Rover with the plugin enabled.
