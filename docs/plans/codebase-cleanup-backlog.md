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

### CSS-as-string monoliths

- `interfaces/web-chat/src/chat-page.ts` — 1,981 lines, ~1,600 of them
  one CSS string literal embedded in TypeScript.
- `plugins/dashboard/src/render/styles/components.ts` — 1,122 lines of
  component CSS packed into a single template-string export.

Extract to dedicated style modules (or the shared theme/ui packages)
next time either surface gets real styling work.

### `@brains/utils` grab-bag split

Long-known: the package mixes zod re-export, Logger, ID generation,
markdown, YAML, and progress reporting. It needs a deliberate split,
not more bandages. Related context: `npm-package-boundaries.md` already
decided not to publish it as the SDK.

### package.json script drift

70+ packages declare lint/typecheck scripts with 5+ glob/flag
variations (`--ext .ts` vs `.ts,.tsx`, `--max-warnings 0` vs none).
Inconsistent quality gates; normalize when touching turbo config.

### Minor (fix opportunistically)

- `sites/professional` and `sites/personal` homepage datasources share
  ~60% structure; extract a shared datasource helper if a third site
  appears.
- Approval-card formatting is inlined separately in the Discord and CLI
  interfaces; a small shared formatter would help — but see
  checked-and-cleared below, the interfaces are otherwise sound.

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
