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

- **`plugins/playbooks/src/plugin.ts` (~1888 lines)** — lifecycle +
  state-machine orchestration + gate verification + agent-context
  building + guidance rendering. Candidate extracts: context formatter,
  status builder, guidance renderer, lifecycle-starter resolver.
- **`interfaces/chat/src/chat-interface.ts` (~1386 lines)** — message
  routing + approval tracking + artifact delivery + upload management.
  Candidate extracts: message router (strategy map), approval handler,
  artifact delivery, upload manager.
- ~~`shell/ai-service/src/agent-service.ts`~~ — DONE 2026-07-06:
  decomposed into ConversationActorRegistry, attachment-intake,
  ConfirmationCoordinator, and TurnProcessor; the service is now a
  ~330-line façade.
- **`interfaces/discord/src/discord-interface.ts` (~1048 lines)** —
  Discord SDK management + message parsing + card rendering +
  subscription tracking + uploads. Mirror the chat-interface split.

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
