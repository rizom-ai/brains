# Plan: Atomic durable job deduplication

## Status

Proposed correctness hardening. This is independent of the public job-authoring API: the existing queue remains the implementation, but its current read-then-write deduplication is not atomic. Land this before relying on `skip`, `replace`, or `coalesce` as a cross-process admission guarantee.

## Problem

`JobQueueService.enqueue()` currently:

1. reads active jobs;
2. chooses a duplicate in memory;
3. optionally updates that row; and
4. inserts a new row separately.

Concurrent callers can all observe no duplicate and then insert. This occurs inside one process because calls interleave across `await`, and the supported web/worker split also gives separate processes their own queue service and database client. A process-local mutex would hide only the first case.

A focused reproduction with twenty concurrent `skip` enqueues using one type and key produced twenty distinct pending jobs. That violates queue callers which use deduplication to bound rebuilds, recurring work, and projection-adjacent scheduling.

The schema has no first-class deduplication column or uniqueness constraint. The optional key is stored in JSON metadata, and no-key deduplication intentionally groups every active job of the same type—including jobs originally enqueued with `deduplication: "none"`. A partial unique index cannot reproduce those semantics by itself.

## Goal

Make each deduplicating enqueue one database-serialized decision so all supported processes observe these invariants:

- a deduplicating transaction never increases a group's pending successors above the strategy's sequential shape;
- a group that starts with at most one pending successor still has at most one after concurrent `skip`, `replace`, or `coalesce` requests settle, provided no concurrent `none` enqueue targets that group;
- `none` continues to opt out and always creates a new job;
- pre-existing duplicate pending rows are handled deterministically but are not repaired implicitly;
- processing attempt status, payload, ownership, and fencing fields are never changed by deduplication; `coalesce` may preserve the existing behavior of advancing `scheduledFor`;
- payload validation and projection admission remain correct;
- the returned id always identifies the row selected or inserted by the committed decision; and
- local SQLite and remote libSQL use the same repository contract.

## Existing semantics to preserve

The implementation must first pin the current sequential behavior as a contract:

| Strategy   | Pending match                           | Processing-only match                     | No match |
| ---------- | --------------------------------------- | ----------------------------------------- | -------- |
| `none`     | insert                                  | insert                                    | insert   |
| `skip`     | return pending id                       | insert one pending successor              | insert   |
| `replace`  | fail pending row and insert replacement | insert one pending successor              | insert   |
| `coalesce` | return/update the selected active row   | return/update the selected processing row | insert   |

Other current rules remain:

- groups are independent by job type;
- when a non-empty key is supplied, only equal metadata keys match;
- an absent or empty-string key is unkeyed, preserving the current truthy-key behavior;
- when no key is supplied, all jobs of the type are candidates regardless of how they were originally enqueued;
- `skip` and `replace` select the newest pending candidate by `(createdAt DESC, id DESC)`;
- `coalesce` selects the newest pending candidate first, then the newest processing candidate, using the same deterministic order;
- replacement marks only the selected pending row terminally failed;
- multiple pre-existing pending candidates are not collapsed: `skip` and `coalesce` return/update the selected row, while `replace` fails that row and inserts one replacement;
- deduplication metadata never enters handler payload data; and
- retries and attempt fencing continue to be owned by the queue.

## Architecture decisions

### 1. Serialize in the database, not in JavaScript

All deduplicating decisions run in one queue-database write transaction. The transaction reads candidates and performs the return/update/fail/insert action before releasing the writer lock.

The repository explicitly requests `client.transaction("write")`, which maps to `BEGIN IMMEDIATE` for local SQLite and the corresponding serialized writer transaction for remote libSQL. Do not rely on Drizzle's current call to `client.transaction()` without a mode: the libSQL default is deprecated and may change. Bind all statements to the acquired transaction behind the repository boundary.

A keyed mutex may reduce contention but is not a correctness mechanism and is not required.

### 2. Keep deduplication in the repository boundary

Replace the service-level `checkForDuplicate()` plus later repository calls with one operation returning a discriminated result such as:

```ts
type EnqueueDecision =
  | { kind: "inserted"; jobId: string }
  | { kind: "skipped"; jobId: string }
  | { kind: "coalesced"; jobId: string }
  | { kind: "replaced"; jobId: string; replacedJobId: string };
```

Transaction-scoped reads and writes must use the transaction handle; calling ordinary repository methods backed by the outer database handle would reopen the race.

Keep `JobDeduplicator` only if it remains a pure candidate-selection helper used inside the transaction. Remove any pre-transaction duplicate lookup.

### 3. Do not add a uniqueness constraint until semantics justify one

A unique `(type, key)` pending index cannot represent no-key requests matching pre-existing `none` rows, and it complicates the allowed processing-plus-pending successor shape. The first correction therefore uses serialized writes without a schema change.

A later denormalized deduplication column is allowed only for measured query performance or stronger invariant enforcement, with a migration and explicit treatment of existing rows. Do not parse metadata differently in separate service and repository paths.

### 4. Validate every request before deduplication

A malformed request must not be accepted merely because it matches an existing job. Handler lookup and payload validation happen before opening the write transaction. This intentionally corrects the current shortcut where `skip`/`coalesce` can return an existing id before validating new input.

Validation remains side-effect free. The validated payload is serialized once and reused if the transaction inserts.

### 5. Reserve projection admission only for an inserted job

A coalesced or skipped request does not create causal work and must not consume projection job budget. Provenance can be prepared before the transaction, but the repository invokes a bounded insert-branch callback only when it has selected insertion while holding the write transaction.

Replace the one-way `assertJobAdmission()` queue contract with `reserveJobAdmission()`. A successful reservation counts against the in-memory projection budget immediately and returns an idempotent handle with `commit()` and `rollback()`. The service commits the reservation only after the queue transaction commits and rolls it back on every later insert or commit failure. Admission rejection may still open its durable circuit and rolls back the queue transaction. This avoids both an unadmitted visible row and a budget charge for a row that failed to commit.

The reservation callback must not enqueue recursively. Because admission may consult the separate runtime-state database, keep it bounded and measure the queue-lock interval.

### 6. Treat conflicts and busy errors explicitly

The transaction operation has a small bounded retry only for recognized serialization/busy conflicts encountered before the write transaction is acquired. Once the insert branch reserves projection admission, the transaction is never automatically replayed. A later transaction/commit failure rolls back the reservation and propagates for caller-level recovery. The implementation must not retry validation, arbitrary handler code, or unknown database errors. Exhaustion returns an actionable queue error with type, key presence, strategy, and retry count but never payload contents.

## Implementation phases

### Phase 0 — Characterize semantics and reproduce the race

1. Add table-driven sequential tests for all four strategies, with pending-only, processing-only, pending-plus-processing, keyed, unkeyed, same-type, and different-type cases.
2. Add a deterministic concurrent characterization test with at least twenty same-group enqueues. Gate callers after their duplicate read and before mutation—using an explicit test hook such as the existing async admission boundary—not merely before invocation, so the reproduction does not depend on scheduler timing or sleeps.
3. Run the same characterization through two `JobQueueService` instances with separate initialized clients and one SQLite path. A one-instance-only proof is insufficient.
4. Replace the characterization gate after implementation with repeated concurrent contract tests that do not block while holding the write transaction.
5. Pin pending-first, newest-first coalesce selection when pending and processing candidates coexist, plus behavior with multiple pre-existing pending rows.
6. Pin absent, empty-string, and non-empty key behavior.
7. Pin validation behavior: invalid input always fails even when a duplicate exists.

Gate:

- The race is reproducible without sleeps.
- Sequential strategy semantics are explicit enough to review independently of implementation.

### Phase 1 — Add transaction-scoped repository admission

1. Introduce the transaction-scoped enqueue decision and move candidate selection into it.
2. Implement `skip`, `replace`, and `coalesce` entirely through a transaction handle acquired with explicit `"write"` mode.
3. Verify write-transaction acquisition with two independent initialized database clients.
4. Add bounded handling for recognized SQLite/libSQL serialization conflicts before acquisition.
5. Remove the service-level read-then-write path.

Gate:

- Twenty concurrent same-group requests produce the expected committed shape and returned ids in repeated runs.
- Different groups still proceed independently at the semantic level, even if SQLite serializes physical writers.

### Phase 2 — Preserve causal and lifecycle behavior

1. Move handler lookup and validation before the transaction.
2. Reserve projection admission only on the insert branch, commit the reservation after queue commit, and roll it back on insert or commit failure.
3. Prove no pending row becomes visible when validation or admission fails, and no budget remains charged when queue persistence fails after reservation.
4. Preserve metadata, root job id, provenance, delay, priority, retries, and progress behavior on inserted rows.
5. Prove replacement creates the terminal runtime update exactly once and does not touch a processing attempt's fencing fields.
6. Track in-flight enqueues so `close()` lets a transaction already in progress settle before closing the client, while enqueues started after close is requested fail immediately.

Gate:

- Projection budgets count inserted work, not attempted coalesces.
- Existing worker claim, retry, progress, and runtime-update tests remain unchanged.

### Phase 3 — Integrate and document

1. Add concurrent coverage to the job-queue package's normal test suite, including a short repeated stress loop.
2. Add an opt-in remote libSQL contract test, configured by explicit test URL and auth-token environment variables, that runs the same two-client strategy assertions.
3. Exercise one real caller for each important strategy, especially site-build environment keys and scheduler/recurring work where used.
4. Document atomic strategy semantics in `shell/job-queue/README.md`.
5. Add a core-lane Changeset.

Gate:

- Package tests, typecheck, lint, integration tests, and the canonical web/worker boundary test pass.
- No caller adds a second process-local deduplication layer.

## Validation matrix

- one service, many concurrent calls;
- two services/clients, one database;
- keyed and unkeyed groups;
- same and different job types;
- pending-only, processing-only, and pending-plus-processing;
- `none`, `skip`, `replace`, and `coalesce`;
- invalid payload on duplicate;
- projection admission rejection;
- transaction conflict retry and exhaustion;
- replacement runtime update and progress polling;
- worker claim racing with deduplicating enqueue;
- service close while a transaction is settling, including rejection of a later enqueue;

## Non-goals

- Replacing the durable queue.
- Distributed scheduling or multiple active Brain nodes.
- Changing retry, lease, worker-session, or attempt-fencing policy.
- Adding batch enqueue to the public authoring API.
- Deduplicating completed or failed history.
- Using an in-memory lock as the source of truth.

## Risks and mitigations

- **A deferred transaction preserves the race.** Prove early write-lock behavior with independent clients; use explicit libSQL write transactions when necessary.
- **Holding a write transaction across projection admission increases contention.** Keep reservation bounded and measure it without exposing unadmitted jobs.
- **Queue persistence fails after admission reservation.** Roll back the idempotent reservation on every insert or commit failure; test budget availability after an injected persistence failure.
- **Replace semantics lose the newest request.** Serialize fail-plus-insert and use deterministic transaction order; concurrent tests assert only the last committed replacement remains pending.
- **Busy retries duplicate side effects.** Validation and provenance preparation are pure; admission is not reserved until after the non-retried write transaction is acquired.
- **Remote libSQL differs from local SQLite.** Keep explicit write mode behind the repository and maintain an opt-in remote two-client contract test alongside the required local contract.

## Acceptance criteria

1. Concurrent deduplicating enqueue does not increase pending successors beyond the sequential strategy shape; an initially clean group remains at most one pending absent a concurrent `none` request.
2. The invariant holds across two independent queue clients sharing a database.
3. Existing processing jobs retain status, payload, ownership, and fencing fields.
4. Invalid duplicate requests fail validation.
5. Skipped/coalesced requests and failed queue commits do not consume projection job budget.
6. In-flight enqueue transactions settle safely when service close is requested, and later enqueues are rejected.
7. Local tests are required and the same repository contract has an opt-in remote libSQL test.
8. No schema approximation or process-local lock becomes the correctness boundary.
9. Strategy behavior is documented and covered by deterministic tests.
