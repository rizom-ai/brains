# Plan: job queue claim expiry

## Status

Proposed.

## Problem

`JobQueueRepository.claimNextReady` sets `status='processing'` and stamps
`startedAt` but nothing ever transitions the row back. If the worker crashes
between claim and `complete()` / `fail()`, the row is stranded — no reclaim,
and `getActiveJobs` still reports it as live. This skews active-job reporting
and can block duplicate-sensitive flows such as `coalesce` for the same key.

```text
shell/job-queue/src/job-queue-repository.ts:250
```

## Change

### 1. Config field

`shell/job-queue/src/types.ts`:

```ts
export type JobQueueServiceConfig = DbConfig & {
  /** Reclaim a `processing` row whose `startedAt` is older than this. Default 300_000 ms. */
  claimTimeoutMs?: number;
};
```

### 2. Thread to repository

`shell/job-queue/src/job-queue-service.ts`: pass `config.claimTimeoutMs ?? 300_000` into the
`JobQueueRepository` constructor. Store on the instance.

### 3. Reclaim inside `claimNextReady`

`shell/job-queue/src/job-queue-repository.ts`:

Candidate selection accepts a row if **either**:

- `status='pending' AND scheduledFor <= now`, or
- `status='processing' AND startedAt <= now - claimTimeoutMs`.

Order unchanged: `priority ASC, createdAt ASC`.

The single `UPDATE ... WHERE id IN (candidate) RETURNING *` keeps the reclaim
race-free. On a reclaim branch, the same UPDATE also:

- increments `retryCount` by 1,
- sets `lastError = 'Claim expired'`,
- if the incremented `retryCount` exceeds `maxRetries`, writes
  `status='failed'`, `completedAt=now`, and does **not** let `dequeue()` return
  the row for processing.

Implementation note: SQLite/Drizzle `UPDATE ... RETURNING *` can still return a
row that the update just changed to `failed`. `claimNextReady` must explicitly
filter/guard the returned row and only return rows whose post-update status is
`processing`; otherwise return `null`. If the first candidate is terminalized,
the next `dequeue()` call may pick up the next eligible row.

Reuse `startedAt` as the claim timestamp — already set to `now` on each
successful claim/reclaim. No schema migration.

### 4. Tests

Add repository-focused tests for `claimNextReady(now)` so timeout behavior is
clock-injected and non-flaky, plus one service-level test that confirms
`claimTimeoutMs` is threaded from `JobQueueServiceConfig` to the repository.

Repository cases:

- Stuck `processing` row past timeout is reclaimed.
- Reclaim increments `retryCount`, sets `lastError='Claim expired'`, and
  refreshes `startedAt` to the new claim time.
- Reclaim past `maxRetries` transitions the row to `failed` instead of
  re-claiming; `claimNextReady()` returns `null` and never returns a failed row.
- Concurrent reclaim: two parallel `claimNextReady` calls on the same expired
  row — exactly one returns it, the other returns `null`. Mirror the existing
  service concurrency test on `pending` claims.
- Fresh `pending` row and expired `processing` row at equal priority: the one
  with the older `createdAt` wins (pin the strict-order behavior).

### 5. README

`shell/job-queue/README.md`: document `claimTimeoutMs`, the reclaim guarantee,
and the caveat that jobs running longer than `claimTimeoutMs` can be reclaimed
and processed again unless/until heartbeat or claim-extension support is added.

## Out of scope

- Worker heartbeat / claim extension for legitimately long-running handlers.
  Add when a handler needs it; default 5 min covers everything in the repo today.
- Schema migration. `startedAt` is reused; no new columns.
- Worker changes. `JobQueueWorker` calls `dequeue()` → `claimNextReady()`
  unchanged; reclaim is transparent.

## Verification

- `bun test` in `shell/job-queue` passes including the new tests.
- `bun run typecheck` clean across the workspace.
- Manual smoke: a handler that `process.exit(1)`s after claim — a second
  worker reclaims after `claimTimeoutMs`; `retryCount` increments;
  `maxRetries=1` transitions to `failed` on the second reclaim attempt.
