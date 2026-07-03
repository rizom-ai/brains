# Rover onboarding plugin plan

## Status

Planned.

## Goal

Give Rover onboarding a single owner. Today onboarding is spread across Rover seed markdown, eval-content copies, `playbooks` trigger config, and sync tests. Move it behind one first-party service plugin so onboarding can be enabled or disabled as a unit while still using the existing `playbook` entity and `playbooks` runtime.

The plugin owns two things:

1. the bundled onboarding playbook content;
2. the runtime activation of the first-chat starter.

Seeding content is only a mechanism. The product reason is ownership and a real enable/disable lever.

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

## Architecture decisions

### 1. Direct plugin seeding

Use direct plugin seeding. `rover-onboarding` seeds missing bundled markdown as durable `playbook` entities in `onReady()` with `entityService.createEntityFromMarkdown()`.

Policy:

- create if missing;
- leave existing entities untouched;
- never overwrite operator-edited playbooks by default.

This adds a path alongside the existing one. Today `directory-sync` copies `seed-content-core/playbook/*.md` into brain-data, but only when brain-data is empty (`seed-content.ts` `isEmpty` check) — a filesystem copy, not `createEntityFromMarkdown`, with different "exists?" semantics than the per-entity create-if-missing this plugin uses.

Reconciliation, to avoid split-ownership or double-create:

- the plugin owns **only** the onboarding playbooks;
- remove the onboarding `.md` files from Rover `seed-content-*` and `eval-content-*` directories so `directory-sync` no longer copies them;
- `directory-sync` keeps owning everything else in those directories;
- the two paths must never both create the same playbook.

### 2. Plugin-owned starter activation

Playbook frontmatter alone is not a sufficient enable/disable lever today. The metadata scan in `@brains/playbooks` (`resolveLifecycleStarters`) only surfaces a frontmatter-declared starter when its `trigger` is enabled in `config.triggers`; with no enabled triggers it early-returns.

But the scan already builds the entire starter from the entity's frontmatter — `trigger`, `lifecycle`, `starterText`, `description`, `starterPrompt`, `once`, `title` — and already handles dedup, the `once` gate, and completed/dismissed-run suppression. The **only** thing blocking a seeded onboarding playbook from surfacing is the enabled-trigger gate.

So the extension `@brains/playbooks` needs is minimal: **let a plugin mark a trigger id as enabled at runtime.** No starter payload, no merge, no conflict policy — the seeded entity's frontmatter already carries all of that. `rover-onboarding` enables the `first-anchor-web-chat` trigger at runtime; removing the plugin drops that on the next boot, so the web-chat overlay card disappears even if durable playbook entities remain.

Do not rely on Rover-level `playbooks.triggers.first-anchor-web-chat: true` as the final design — that static `brain.yaml` config is decoupled from plugin enable/disable. It can remain only as a lower-level/manual escape hatch.

## Responsibilities

- Bundle the Rover onboarding playbooks.
- Seed missing bundled playbooks as durable `playbook` entities.
- Preserve operator-edited playbook entities.
- Enable the onboarding trigger (`first-anchor-web-chat`) at runtime via `@brains/playbooks`.
- Keep using `@brains/playbooks` for starter resolution and run orchestration.
- Provide Rover-specific onboarding instructions only if needed.

## Non-goals

- Do not create an `onboarding` entity type.
- Do not fork or duplicate `@brains/playbooks` behavior.
- Do not move all Rover eval infrastructure into the plugin in the first pass.
- Do not auto-overwrite operator-edited markdown.
- Do not delete durable playbook entities when the plugin is disabled; disabling means no starter/overlay registration.

## Required `playbooks` extension

Add a minimal runtime channel owned by `@brains/playbooks` that lets a plugin mark a trigger id as enabled, for example:

```txt
playbooks:enable-trigger
```

Payload is just the trigger id, e.g. `first-anchor-web-chat`.

`resolveLifecycleStarters` already unions runtime-enabled triggers with `config.triggers` when scanning playbook frontmatter; nothing else changes. The starter's text, prompt, lifecycle, `once`, dedup, and completed-run suppression all come from the seeded entity's frontmatter, which the scan already reads — so there is no starter payload, no merge, and no conflict policy to define.

Runtime-enabled triggers are in-memory state. They are intentionally not durable: disabling the plugin drops the trigger on next boot, so the starter and overlay disappear.

## Content loading decision

`plugins/rover-onboarding/content/playbook/` is a new convention. Prefer `fs.readFile` relative to `import.meta.dir` unless bundler/package constraints require inlined strings.

Avoid `.md` imports unless existing build tooling is confirmed to support them for plugins.

## Update policy

Phase 1 policy: create missing, never update existing.

Future safe-update policy can use hashes:

- store bundled content hashes in runtime state;
- update only if existing entity content hash matches a previously bundled hash;
- otherwise report drift and leave content untouched.

## Implementation phases

Slices are vertical: each one ends in observable end-to-end behavior, not standalone infrastructure.

### Phase 1 — walking skeleton: overlay appears from the plugin

1. Add the minimal `playbooks:enable-trigger` channel and union runtime-enabled triggers into `resolveLifecycleStarters`.
2. Add `plugins/rover-onboarding` as a `ServicePlugin` with the onboarding markdown in `content/playbook/`.
3. In `onReady()`: seed missing playbook entities with `entityService.createEntityFromMarkdown()`, then enable `first-anchor-web-chat`.
4. Wire the plugin into Rover capabilities after `playbook` and `playbooks`.
5. Verify end to end: with the plugin installed and the static `brain.yaml` trigger removed, the web-chat overlay card appears; with the plugin removed, it disappears even though durable playbook entities remain.

### Phase 2 — make it the sole owner

1. Remove the onboarding `.md` files from Rover `seed-content-*` and `eval-content-*` so `directory-sync` no longer copies them; confirm no double-create.
2. Remove `playbooks.triggers.first-anchor-web-chat` from default/eval/test app `brain.yaml` wiring now that the plugin owns activation.
3. Update `brains/rover/test/onboarding-playbook-seed.test.ts` so plugin content is the source of truth.
4. Add plugin tests for missing-content seed, no-overwrite of operator-edited entities, and runtime trigger enablement.
5. Add a `@brains/playbooks` test for the runtime-enabled-trigger path.

### Phase 3 — harden

1. Run targeted Rover onboarding multi-turn evals against plugin-seeded content.
2. Add the hash-based safe-update policy (create-missing → update-only-if-unmodified) if drift handling is needed.

## Validation

- `@brains/playbooks` test for the runtime-enabled-trigger path.
- `@brains/rover-onboarding` tests for seeding and runtime trigger enablement.
- Updated Rover source-of-truth tests.
- Rover startup check with the plugin enabled, and overlay appears/disappears with the plugin toggled.
- Targeted Rover onboarding multi-turn evals.
