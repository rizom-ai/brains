# Plan: Exhaustive core-preset eval set for Rover

## Status

In progress. Phase 1 landed in `core-evals` with a green `eval:core`
run (46/46). Outcome of the 2026-06-12 eval review: the rover suite (111
cases, 118/118 passing on 2026-06-10) is written against the `full`
preset, while `core` — the contract every other preset inherits, and
the closest thing to what every shipped brain runs — is never evaled
as such. This plan builds an exhaustive, hermetic core-preset suite
and the small harness features it needs.

## Context (verified 2026-06-12)

- **Core under eval mode is 12 plugins** (after the atproto decision
  below): prompt, note, link, wishlist, topics, directory-sync,
  agent-discovery, assessment, auth-service, notifications, cms, plus
  the a2a interface. `evalDisable` already removes discord, webserver,
  web-chat, mcp, analytics, dashboard, dashboard-root, email-resend.
- **The agent-facing tool surface in a core boot is small.** Shell
  system tools (`system_create/get/list/search/update/delete/extract/
status/insights/check-job-status` plus conversation tools),
  `directory-sync_{sync,status,history}`, the agent-discovery tools
  plus `a2a_call`, and `auth-service_get_passkey_setup_url`. The
  entity plugins (note, link, wishlist, topics, prompt, assessment)
  contribute entity types, templates, and agent instructions — not
  tools. So "exhaustive" is tractable: tools × core entity types ×
  permission levels, not an open-ended behavior space.
- **The runner has no preset awareness.** `preset:` in
  `brain.eval.yaml` flows through `parseInstanceOverrides` into
  `resolveConfig` at boot (`eval-config-loader.ts:108`), and exactly
  one yaml is read from cwd. Evaling core today means editing the yaml.
- **The existing `core` tag does not mean core preset** — it marks
  "core functionality" and sits on cases for web/full-only plugins
  (blog-generate, system-set-cover). A preset-scoped subset needs its
  own tag.
- **Permission coverage is 99 anchor / 1 trusted / 1 public**, and the
  defaults diverge: the schema defaults `permissionLevel` to `anchor`
  (`schemas/test-case.ts:142`) while the runner falls back to
  `public` when `setup:` is absent entirely (`test-runner.ts:217`).
  A case's effective permission depends on whether it has an empty
  setup block.
- **Shared shell-level cases exist**: `shell/ai-evaluation/evals/
test-cases` holds 10 preset-agnostic cases (incl.
  `public-user-not-anchor`, `delete-requires-confirmation`) that run
  for every brain. The core suite builds on these, not around them.
- **The judge is the model under test**: `brains/rover/brain.eval.yaml`
  pins both `models` and `judge` to gpt-5.4-mini.
- **eval-content seeds non-core entity types** (post, deck, project,
  social-post, site-info). Behavior when directory-sync syncs entity
  types that aren't registered in a core boot is unverified — Phase 1
  must confirm graceful skip or carve a core-only seed subset.

## Decisions

- **atproto goes into `evalDisable`** (2026-06-12). The plugin picks
  up `ATPROTO_APP_PASSWORD` from the environment, so the eval suite is
  one env var away from an LLM-driven test posting to live Bluesky.
  Hermetic by construction beats hermetic-if-your-env-is-clean — the
  same reasoning that disabled email-resend. Publish-gating belongs in
  `plugins/atproto` integration tests; eval-level propensity cases
  wait for a dry-run mode or mock PDS (own slice, not this plan).
- **Judge/model equality is allowed** (2026-06-13). Rover keeps the
  existing eval judge unless there is a separate reason to change it;
  no runner warning is required when `judge` is also in `models`.
- **One permission default: `anchor`**, taken from the schema. The
  runner's divergent `public` fallback is removed; cases that want
  public say so explicitly.

## Phasing

All work happens in a dedicated worktree
(`~/Documents/brains-worktrees/core-evals`), never the main checkout.
Each phase lands green (`typecheck`, `test`, plus an eval run where
the phase touches cases) and merges to main on its own. Harness
changes in `shell/ai-evaluation` are test-first.

### Phase 1 — walking skeleton: a core-preset eval run exists and is green

1. `evalDisable` += atproto in `brains/rover/src/index.ts`.
2. `--preset <name>` flag: test in `cli-options.test.ts` first, then
   thread it as an instance override into `resolveConfig` so the eval
   app boots the named preset without editing `brain.eval.yaml`.
3. Fix the permission-default divergence (test asserting the unified
   anchor default, then the runner change).
4. No judge change; judge/model equality is explicitly allowed.
5. Verify eval-content under a core boot: either directory-sync skips
   unregistered entity types cleanly (assert it) or add a core-only
   seed subset.
6. Triage the existing 111 rover cases: tag every core-compatible case
   `preset-core`; confirm `bun run eval --preset core --tags
preset-core` passes; add an `eval:core` package script for it.

Deliverable: one command that boots an actual core-preset brain and
runs the core-valid subset green.

### Phase 2 — tool coverage: make "exhaustive" measurable

Add a small check (script or test in `shell/ai-evaluation`) that boots
the core-preset eval app, dumps the registered tool names, and diffs
them against the tools asserted (`shouldBeCalled` true _or_ false) in
`preset-core` cases. The diff is the coverage report; it gets committed into
this plan. Exhaustive then means: coverage diff empty, every registered tool
asserted somewhere, every core entity type exercised through the
system-tool family.

Coverage from `bun run eval:core:coverage` (2026-06-13):

- Registered tools: 17
- Asserted tools: 17
- Missing assertions: 0
- Stale assertions: 0

Missing assertions: none.

### Phase 3 — permission matrix

Started (2026-06-14): the harness supports a case-level `permissions:`
block mapping levels to per-level success criteria. The runner expands
one case into one run per level (result ids suffixed `@anchor`,
`@public`, …), and `--test base-id` runs all expanded levels while
`--test base-id@public` targets one level.

Initial case added: public vs anchor note creation
(`rover-permission-core-note-create-matrix`) passes targeted eval.

Remaining cases: public denied `system_update`/`delete` on note and
link (refusal, no tool call); trusted draft-edit boundaries; public
`system_get` of a restricted entity by exact title; trusted vs anchor
on agent-discovery save/approve actions.

### Phase 4 — fill the coverage

Write cases until the Phase 2 coverage diff is empty. Known gaps going in:
`system_status`, `system_insights` (topics), `system_check-job-status`,
`system_extract` on topics, conversation tools, wishlist beyond the
single lasagna regression, and multi-turn plus response-quality cases
on core content (note/link/topic recall, empty states, follow-ups) —
the current multi-turn set is half web-chat upload flows, which are
full-preset territory.

### Phase 5 — make it the gate

Document `eval:core` as the pre-release smoke for any change touching
presets or shell system tools. Pointers out: extending `--preset` to a
default/full matrix is the natural follow-up; multi-model parallelism
stays in `parallel-eval-workers.md`.

## Cost note

The full-preset suite averages ~15k tokens per case across 118 cases.
The core subset is smaller, but the permission matrix multiplies runs —
keep `--tags` subsets first-class so day-to-day runs stay cheap, and
reserve the full matrix for the release gate.
