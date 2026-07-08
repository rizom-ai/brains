# Plan: Exhaustive core-preset eval set for Rover

## Status

Active coverage backlog. The preset-aware harness has landed and merged to `main`:

- `brain.eval.yaml` defines inheritable `core`, `default`, and `full` suites.
- `core` runs `preset-core`, `default` extends `core` with `preset-default`, and `full` extends `default` with `preset-full`.
- `--preset <name>` boots a named preset hermetically for eval runs.
- The committed tool-coverage ledger keeps "exhaustive" measurable; core tool assertions are populated.
- Permission matrices and turn-level multi-user context cover public/trusted/anchor behavior, including approval hijack and shared-thread denial cases.

Current tree snapshot:

- 143 Rover eval YAML files under `brains/rover/test-cases`.
- Tagged suite counts: 73 `preset-core`, 34 `preset-default`, 34 `preset-full`.
- 140 files have at least one preset tag.

## Remaining: keep coverage exhaustive

The plan is no longer about building the harness; it is now the standing backlog for keeping Rover eval coverage deep enough as core behavior changes.

Immediate cleanup:

- Add or intentionally classify the currently untagged evals:
  - `brains/rover/test-cases/plugin/playbook-goal-check-met.yaml`
  - `brains/rover/test-cases/plugin/playbook-goal-check-not-met.yaml`
  - `brains/rover/test-cases/tool-invocation/job-status-dispute.yaml`

Known coverage follow-ups:

- Conversation-tool behavior remains thin compared with entity/tool invocation coverage.
- Existing `system_status`, `system_insights`, `system_job_status`, `system_extract`, and wishlist coverage should be reviewed for behavioral depth rather than mere tool-call presence.
- Add more response-quality and multi-turn cases for core content recall, empty states, follow-ups, and note/link/topic workflows.
- Keep web-chat upload-heavy scenarios tagged at the appropriate higher preset when they rely on full interface/upload behavior.
- Re-tag toward future bundle combinations as brain model unification lands.

Multi-model subprocess parallelism is intentionally tracked separately in [parallel-eval-workers.md](./parallel-eval-workers.md).

## Cost note

The full-preset suite is token-heavy, and permission matrices multiply runs. Keep tag subsets first-class for day-to-day checks and reserve broad preset/matrix runs for release gates.
