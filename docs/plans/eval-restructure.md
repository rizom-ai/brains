# Plan: Move Evals from App Level to Brain Model Level

## Context

Evals currently live in `apps/professional-brain/test-cases/` (44 files) and `apps/collective-brain/test-cases/` (2 files). But 84% of them test generic tool behavior and agent quality that's brain-model-level (rover/ranger), not instance-level.

## The split

**Brain model evals** (`brains/rover/test-cases/`) — 37 files
Generic tool invocation, plugin behavior, response quality. Work with any rover instance's seed content. No references to specific blog posts, people, or projects.

**Instance evals** (`apps/professional-brain/test-cases/`) — 7 files
Quality checks that depend on yeehaa-specific content: blog post titles ("Low End Theory", "Urging New Institutions"), personal context (Rizom, Offcourse), author voice. These validate brand/voice, not tool behavior.

## What moves to `brains/rover/test-cases/`

### tool-invocation/ (18 files)

- system-list, system-get-profile, system-search, system-create-note, system-create-social-post, system-update, system-delete
- blog-generate, decks-generate, generate-post-with-image
- newsletter-generate, newsletter-generate-variations
- site-build, site-builder-routes
- git-sync, git-sync-status, directory-sync
- set-cover, set-cover-uses-target-params, system-set-cover-generate
- repeated-action-requests

### plugin/ (3 files)

- social-media-create, social-media-create-from-content

### response-quality/ (2 files)

- helpful-summary, accurate-summaries

### top-level (10 files)

- generate-call-to-action, generate-from-blog-post, generate-linkedin-post
- generate-professional-tone, generate-with-content-reference
- social-media-generate-agent, social-media-generate-edit-agent
- social-media-publish-agent, social-media-queue-list-agent

### multi-turn/ (2 files)

- list-then-detail, generate-cover-for-existing-post

## What stays in `apps/professional-brain/test-cases/`

### tool-invocation/ (2 files)

- system-get.yaml — references "The Low End Theory"
- newsletter-generate-from-post.yaml — references "Urging New Institutions"

### plugin/ (3 files)

- blog-context-aware.yaml — references Yeehaa's philosophy background
- blog-rizom-context.yaml — references Rizom and Offcourse
- decks-context-aware.yaml — references Yeehaa's design philosophy

### response-quality/ (1 file)

- data-in-response.yaml — expects "Low End Theory" in response

### top-level (1 file)

- newsletter-generate-agent.yaml — references "Align the Misaligned"

## What moves to `brains/ranger/test-cases/`

The 2 collective-brain wishlist evals are generic and belong on ranger:

- wishlist-add-variations.yaml
- wishlist-add-unfulfillable.yaml

## Eval runner changes

The eval runner currently loads from `${CWD}/test-cases/`. It needs to also load from the brain model's test-cases directory.

**New loading order:**

1. Brain model test-cases: `brains/{model}/test-cases/` (generic)
2. App test-cases: `apps/{instance}/test-cases/` (instance-specific, overrides by filename)

The runner resolves the brain package path from `brain.eval.yaml`'s `brain:` field, finds its `test-cases/` directory, and merges both sets.

## brain.eval.yaml stays per-app

The eval config (`brain.eval.yaml`) stays in the app because it controls:

- Which preset to use
- Which plugins to disable
- Git sync config for isolated testing
- These ARE instance-specific

## Steps

1. Create `brains/rover/test-cases/` directory structure (tool-invocation/, plugin/, response-quality/, multi-turn/)
2. Move 37 generic test cases from professional-brain to rover
3. Move 2 wishlist test cases from collective-brain to ranger
4. Keep 7 instance-specific test cases in professional-brain
5. Update eval runner to load from brain model + app directories
6. Run evals from professional-brain — verify all pass (both model + instance tests)
7. Run evals from collective-brain — verify wishlist tests pass

## Verification

1. `bun run eval` from `apps/professional-brain/` — runs rover model tests + yeehaa instance tests
2. `bun run eval` from `apps/collective-brain/` — runs ranger model tests + collective instance tests
3. `bun run eval` from `apps/mylittlephoney/` — runs rover model tests only (no instance tests)
4. No test case references old file paths
