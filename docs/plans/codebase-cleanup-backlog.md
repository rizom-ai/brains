# Codebase cleanup backlog

## Status

Reference backlog. Findings from the shell-layer refactoring audit
(2026-06, shipped as the shell-cleanup work) that fall outside any
active plan. Every entry below was **verified against the code**
(2026-06-10) — the raw audit's unverified claims are listed at the
bottom as checked-and-cleared so they don't get re-flagged. Findings
that grow an owner move into a real plan and get removed from this
list.

## Verified findings

### God classes (decomposition candidates — need a plan each)

Verified line counts 2026-07-05. Each mixes transport/orchestration with
business logic + persistence and would benefit from extracting focused
collaborators. These are large enough to warrant a thin-vertical plan
before touching — not opportunistic edits.

- ~~`plugins/playbooks/src/plugin.ts`~~ — DONE 2026-07-06: decomposed
  into src/lib/ run-machine (pure transition semantics), render,
  lifecycle-starters, and run-engine; the plugin is down to ~1050 lines
  of plugin surface (tools, subscriptions, locks, status assembly).
- ~~`interfaces/chat/src/chat-interface.ts`~~ — DONE 2026-07-06: the
  within-chat decomposition is complete (see
  `docs/plans/chat-response-rendering-decomposition.md`); the final step
  extracted discord-routing (pure policy/ID parsing) and
  discord-message-components (REST call), leaving a ~1300-line
  composition root + orchestration. The plan's cross-package
  `ResponsePlan` follow-on remains open there.
- ~~`shell/ai-service/src/agent-service.ts`~~ — DONE 2026-07-06:
  decomposed into ConversationActorRegistry, attachment-intake,
  ConfirmationCoordinator, and TurnProcessor; the service is now a
  ~330-line façade.
- ~~`interfaces/discord/src/discord-interface.ts`~~ — SUPERSEDED
  2026-07-06: `@brains/chat` is the replacement Discord implementation
  (per its README, pending live validation before Rover/Ranger/Relay
  switch over). Don't decompose a package slated for deletion; effort
  goes into `@brains/chat` instead.

### Minor (fix opportunistically)

- `sites/professional` and `sites/personal` homepage datasources share
  ~60% structure; extract a shared datasource helper if a third site
  appears.

## Checked and cleared (do not re-flag)

Verified 2026-06-10; the audit claims about these were wrong:

- **job-queue worker/batch-manager "overlap"** — none. JobQueueWorker
  is the polling/concurrency execution engine; BatchJobManager is batch
  metadata tracking + status aggregation and never touches handlers.
  Retry logic lives solely in the repository (`JobQueueRepository.fail`).
- **Interface lifecycle "duplication"** — already solved by the
  two-tier base hierarchy (`InterfacePlugin` →
  `MessageInterfacePlugin`); job tracking, progress handling, upload
  validation, and chunking (`chunkMessage` in `@brains/utils`) are
  inherited, and per-interface permission models differ by design.
- **Oversized interface test files** — well-organized integration
  suites (web-chat: 67 focused tests; discord: 44 across 10 describe
  blocks); size reflects protocol complexity, not missing seams.
- **conversation-service "under-tested"** — one file, but 23
  integration tests covering all 9 public methods against a real DB.
- **ai-evaluation "scattered responsibilities"** — well-factored:
  scoring, metric collection, output validation, config loading, and
  reporters are cleanly separated; test-runner orchestrates them.
- **scripts/, deploy/, sites/ structure** — scripts all referenced,
  deploy modular, site plugins/routes appropriately specialized, no
  cross-package relative imports anywhere in those trees.
