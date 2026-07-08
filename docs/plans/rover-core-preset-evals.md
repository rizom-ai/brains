# Plan: Exhaustive core-preset eval set for Rover

## Status

Harness complete; active coverage backlog.

The preset-aware Rover eval harness has landed on `main`:

- `brains/rover/brain.eval.yaml` defines inheritable `core`, `default`, and `full` suites.
- `core` runs `preset-core`, `default` extends `core` with `preset-default`, and `full` extends `default` with `preset-full`.
- `--preset <name>` boots a named preset hermetically for eval runs.
- Live-effect plugins stay disabled through `evalDisable` unless a suite explicitly enables/configures them.
- The committed tool-coverage report keeps exhaustive tool assertions measurable.
- Permission matrices and turn-level multi-user context cover public/trusted/anchor behavior, including approval hijack and shared-thread denial cases.

Current tree snapshot:

- 143 Rover eval YAML files under `brains/rover/test-cases`.
- All 143 files carry at least one preset tag.
- Tagged suite counts:
  - 76 `preset-core`
  - 34 `preset-default`
  - 34 `preset-full`

Latest local validation snapshot (2026-07-08):

- `bun eval:core` passes: 117 passed / 0 failed / 117 total against `gpt-5.4-mini`.
- `bun eval:core:coverage` runs and reports registered/asserted tool coverage, with current gaps below.

## Remaining: keep coverage exhaustive

This plan is no longer about building the harness. It is the standing checklist for keeping Rover eval coverage deep enough as core behavior changes.

Coverage follow-ups:

- Close the current core tool-coverage gaps:
  - missing assertions: `agent_set_trust_level`, `playbook_status`;
  - stale assertions: `document_generate`, `system_upload_save`.
- Conversation-tool behavior remains thin compared with entity/tool invocation coverage.
- Existing `system_status`, `system_insights`, `system_job_status`, `system_extract`, and wishlist coverage should be reviewed for behavioral depth rather than mere tool-call presence.
- Add more response-quality and multi-turn cases for core content recall, empty states, follow-ups, and note/link/topic workflows.
- Keep web-chat upload-heavy scenarios tagged at the appropriate higher preset when they rely on full interface/upload behavior.
- Re-tag toward future bundle combinations as brain model unification lands.

Maintenance rules:

- Every new Rover eval YAML must carry exactly the lowest preset tag that can run it, unless it intentionally belongs to multiple suites.
- New core tools should add at least one positive assertion and, where relevant, a permission or refusal case.
- New upload/interface-heavy behavior should not inflate the core suite unless it can run without full-preset dependencies.
- When a fixture moves between presets, update this doc's counts in the same change.

Multi-model subprocess parallelism is intentionally tracked separately in [parallel-eval-workers.md](./parallel-eval-workers.md).

## Cost note

The full-preset suite is token-heavy, and permission matrices multiply runs. Keep tag subsets first-class for day-to-day checks and reserve broad preset/matrix runs for release gates.
