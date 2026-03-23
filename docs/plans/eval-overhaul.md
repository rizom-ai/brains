# Plan: Eval Overhaul

## Context

Two problems with the current eval setup:

1. **Eval is a preset, but it's not a capability choice** — it's a safety constraint ("run without external side effects"). Maintaining a separate eval plugin list drifts out of sync with other presets.
2. **Evals live per-app, but 84% are generic** — 37 of 44 professional-brain test cases test tool behavior and agent quality that's brain-model-level (rover), not instance-level.

## Phase 1: Eval Mode (replaces eval preset)

Replace `preset: eval` with `mode: eval` that layers on top of any preset.

```yaml
# Before
preset: eval

# After
preset: default
mode: eval
```

The brain model defines which plugins are **unsafe for eval**:

```typescript
export default defineBrain({
  name: "rover",
  presets: { minimal, default: standard, pro },
  evalDisable: [
    "matrix",
    "discord",
    "analytics",
    "dashboard",
    "content-pipeline",
    "newsletter",
    "webserver",
  ],
  // ...
});
```

### Resolution

```
1. Resolve preset → activeIds
2. If mode === "eval": remove all IDs in definition.evalDisable
3. Apply add/remove as usual
```

### What gets disabled in eval

Plugins with side effects outside the brain:

- Chat interfaces (matrix, discord) — sends messages to real users
- Analytics — sends data to Cloudflare
- Content pipeline — auto-generates and publishes
- Newsletter — sends emails
- Webserver — serves public site
- Dashboard — not needed without webserver

### What stays enabled

Everything else — eval tests tool execution, entity CRUD, AI generation, site building (to disk, not served). Full capability set minus external side effects.

### Steps

1. Add `evalDisable: string[]` to `BrainDefinition`
2. Add `mode: z.enum(["eval"]).optional()` to instance overrides schema
3. Update `resolveActiveIds()` in brain-resolver to apply evalDisable when mode is eval
4. Remove `eval` from rover/ranger/relay preset definitions
5. Update `brain.eval.yaml` files: `preset: eval` → `preset: default` + `mode: eval`
6. Tests

### Key files

| File                                  | Change                                |
| ------------------------------------- | ------------------------------------- |
| `shell/app/src/brain-definition.ts`   | Add `evalDisable` to BrainDefinition  |
| `shell/app/src/instance-overrides.ts` | Add `mode` field                      |
| `shell/app/src/brain-resolver.ts`     | Apply evalDisable in resolveActiveIds |
| `brains/rover/src/index.ts`           | Remove eval preset, add evalDisable   |
| `brains/ranger/src/index.ts`          | Same                                  |
| `brains/relay/src/index.ts`           | Same                                  |
| `apps/*/brain.eval.yaml`              | `preset: default` + `mode: eval`      |

## Phase 2: Move evals to brain model level

### The split

**Brain model evals** (`brains/rover/test-cases/`) — 37 files
Generic tool invocation, plugin behavior, response quality. Work with any rover instance's seed content. No references to specific blog posts, people, or projects.

**Instance evals** (`apps/professional-brain/test-cases/`) — 7 files
Quality checks that depend on yeehaa-specific content: blog post titles ("Low End Theory", "Urging New Institutions"), personal context (Rizom, Offcourse), author voice.

### What moves to `brains/rover/test-cases/`

#### tool-invocation/ (18 files)

- system-list, system-get-profile, system-search, system-create-note, system-create-social-post, system-update, system-delete
- blog-generate, decks-generate, generate-post-with-image
- newsletter-generate, newsletter-generate-variations
- site-build, site-builder-routes
- git-sync, git-sync-status, directory-sync
- set-cover, set-cover-uses-target-params, system-set-cover-generate
- repeated-action-requests

#### plugin/ (3 files)

- social-media-create, social-media-create-from-content

#### response-quality/ (2 files)

- helpful-summary, accurate-summaries

#### top-level (10 files)

- generate-call-to-action, generate-from-blog-post, generate-linkedin-post
- generate-professional-tone, generate-with-content-reference
- social-media-generate-agent, social-media-generate-edit-agent
- social-media-publish-agent, social-media-queue-list-agent

#### multi-turn/ (2 files)

- list-then-detail, generate-cover-for-existing-post

### What stays in `apps/professional-brain/test-cases/`

- system-get.yaml — references "The Low End Theory"
- newsletter-generate-from-post.yaml — references "Urging New Institutions"
- blog-context-aware.yaml — references Yeehaa's philosophy background
- blog-rizom-context.yaml — references Rizom and Offcourse
- decks-context-aware.yaml — references Yeehaa's design philosophy
- data-in-response.yaml — expects "Low End Theory" in response
- newsletter-generate-agent.yaml — references "Align the Misaligned"

### What moves to `brains/ranger/test-cases/`

- wishlist-add-variations.yaml
- wishlist-add-unfulfillable.yaml

### Eval runner changes

The eval runner currently loads from `${CWD}/test-cases/`. It needs to also load from the brain model's test-cases directory.

**New loading order:**

1. Brain model test-cases: `brains/{model}/test-cases/` (generic)
2. App test-cases: `apps/{instance}/test-cases/` (instance-specific, overrides by filename)

The runner resolves the brain package path from `brain.eval.yaml`'s `brain:` field, finds its `test-cases/` directory, and merges both sets.

### Steps

1. Create `brains/rover/test-cases/` directory structure (tool-invocation/, plugin/, response-quality/, multi-turn/)
2. Move 37 generic test cases from professional-brain to rover
3. Move 2 wishlist test cases from collective-brain to ranger
4. Keep 7 instance-specific test cases in professional-brain
5. Update eval runner to load from brain model + app directories
6. Run evals from professional-brain — verify all pass (both model + instance tests)
7. Run evals from collective-brain — verify wishlist tests pass

## Verification

1. `bun run typecheck` / `bun test`
2. `brain.eval.yaml` with `preset: pro` + `mode: eval` produces pro plugins minus chat/analytics/etc.
3. `brain.eval.yaml` with `preset: minimal` + `mode: eval` produces minimal minus discord
4. `bun run eval` from `apps/professional-brain/` — runs rover model tests + yeehaa instance tests
5. `bun run eval` from `apps/collective-brain/` — runs ranger model tests + collective instance tests
6. `bun run eval` from `apps/mylittlephoney/` — runs rover model tests only (no instance tests)
7. No test case references old file paths
