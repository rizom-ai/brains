# Plan: Directory-sync Git execution broker

## Status

Handoff-ready. This plan owns **Git runtime safety only**. Directory-sync import
performance, AI-call fan-out, queue throughput, and the 350-file performance gates stay
in [`directory-sync-import-load.md`](./directory-sync-import-load.md) and must not be
used to expand this scope.

The preferred implementation starts from draft PR
[#124](https://github.com/rizom-ai/brains/pull/124), branch
`fix/directory-sync-owned-git-processes`, currently at `82c0415e8`. That PR provides a
narrow `OwnedGit` API, removes directory-sync's `simple-git` execution paths, and has
green current-main CI. It is intentionally unmerged because its in-process Bun runner
cannot recover a completion notification that Bun loses.

This plan changes the earlier wait-only decision: a future fixed stable Bun remains
valuable defense in depth, but is **not** the delivery dependency for this workaround.
The workaround may ship on Bun 1.3.11 only after the affected-runtime acceptance matrix
below passes unchanged.

## Problem statement

Bun 1.3.11 and 1.3.14 can lose asynchronous child-process completion after Git has
finished. When directory-sync awaits that completion while holding its in-memory
`SerialQueue` turn:

- the completed pull never reaches changed-path enqueue;
- later pull, push, commit, and DB→Git auto-export work remains blocked;
- in-process timers, Workers, Node `child_process` compatibility APIs, and completion
  sentinels cannot safely release the lock;
- restart clears the in-memory lock, but the affected process cannot prove when it is
  safe to do so itself.

There is also a process-role ownership gap: web-owned auto-export and worker-owned
`sync-request` handlers construct separate `GitSync` instances and therefore separate
in-memory queues for the same checkout. The workaround must establish one cross-process
owner rather than adding another per-process mutex.

## Goal

Move Git execution and checkout serialization outside the web and worker Bun event loops
so a lost app-process child completion cannot wedge or prematurely release checkout
ownership.

One supervised broker must:

1. serialize every Git command for a checkout across web and worker processes;
2. delegate each command to an OS-owned wrapper that holds an advisory checkout lock;
3. enforce an inactivity timeout, kill the complete Git process group, and wait until it
   can no longer mutate the checkout before releasing that lock;
4. record a credential-free durable request/result before acknowledging completion;
5. recover safely if the client, broker, or container stops at any instruction boundary;
6. preserve the merged reconciliation-checkpoint and request-driven operational-health
   behavior already on `main`.

## Non-goals

- Do not change import batching, parsing, topic extraction, embeddings, AI concurrency,
  or queue priorities.
- Do not rerun or reinterpret the performance investigation in this PR.
- Do not remove Git serialization or race two commands to avoid a hang.
- Do not make `/health/live` or `/health/ready` depend on repository reachability.
- Do not attribute the historical alpha.262 production incident without fresh evidence.
- Do not deploy, restart, change watchdog policy, or run a remote workload without
  separate approval.
- Do not add a compatibility shim that remains after all callers use the broker.

## Safety invariants

These are release blockers, not preferences:

1. **One checkout owner.** Web, worker, startup recovery, auto-commit, periodic pull,
   tools, initial clone/init, remote bootstrap, and cleanup all use the same broker and
   advisory lock.
2. **No unconfirmed unlock.** A timeout may settle only after the command wrapper has
   killed/waited the Git process group. Client cancellation detaches the caller but does
   not unlock or stop tracking the request; the wrapper continues to a safe terminal
   result under its advisory lock.
3. **No duplicate mutation.** Request IDs are idempotent. Broker/client recovery cannot
   repeat `commit`, conflict resolution, or push merely because an acknowledgement was
   lost.
4. **Remote deletion remains authoritative.** Existing pending-delete and reconciliation
   behavior is unchanged.
5. **Credential-free durability.** Tokens and authenticated URLs never enter the socket
   path, journal, runtime-state rows, errors, metrics, or logs. Store a credential-free
   origin URL and pass authentication ephemerally through the broker environment.
6. **Bounded output.** stdout/stderr capture has explicit limits; overflow terminates and
   reaps the command before returning a sanitized error.
7. **Request-driven health.** Durable progress age may degrade `/health/operate` but not
   routing readiness or liveness.
8. **No casts.** Use explicit Zod contracts and structural interfaces; do not introduce
   `as`, `as unknown`, or equivalent assertions in the owned-Git/broker change.

## Proposed architecture

### Broker process

Add one internal `git-broker` child to the existing Brain process supervisor. Start it
before the web child and report broker readiness before web/worker runtime startup may
continue. Stop web and worker first; stop the broker only after active requests have
drained or their wrappers have entered the externally recoverable state.

The broker implementation belongs to the compound directory-sync package. Brain CLI
owns only child orchestration and environment wiring. Do not move Git semantics into
shell internals.

Web and worker connect to a Unix-domain socket. The socket:

- lives under an instance-owned runtime directory, not inside the checkout;
- is mode `0600` and parent directory mode `0700`;
- is bound by exactly one broker;
- is removed as stale only after a connection probe proves no live broker owns it;
- accepts schema-versioned, length-bounded messages.

### Command protocol

Define Zod schemas for:

- `register-checkout`: repository key, canonical checkout path, branch, credential-free
  remote fingerprint, timeout/output policy;
- `execute`: protocol version, request ID, repository key, narrow Git argument array,
  and operation class;
- `progress`: request ID, phase, sanitized timestamp, output byte counts;
- `result`: request ID, exit/signal/timeout classification, bounded stdout/stderr, start
  and completion timestamps;
- `status`: broker identity, registered repositories, active request IDs, and durable
  progress without commands, URLs, paths outside the registered root, or credentials.

The executable is always `git`; clients cannot select an arbitrary program. The broker
adds `-c maintenance.auto=false`. Canonicalize the registered checkout once and reject
unknown repository keys, path changes, NUL bytes, oversized arguments, and unsupported
operation classes.

The existing `OwnedGit` client remains the only Git semantic API. Replace
`OwnedGitProcessRunner` at composition time with a `BrokerGitCommandRunner`; do not make
call sites know about IPC.

### OS-owned command wrapper

The broker must not use `Bun.spawn().exited` for individual Git commands. The preferred
candidate is a synchronous broker-to-wrapper boundary (`Bun.spawnSync`) because upstream
and local evidence distinguish the working synchronous wait path from the broken async
completion path. It is acceptable for the dedicated broker to block; it is not a routing
or job worker process.

The wrapper, not the broker's JavaScript promise, owns command safety:

1. acquire `flock` on a deterministic lock file outside the replaceable checkout;
2. atomically create the request's active record;
3. start Git in a dedicated session/process group via `setsid`;
4. redirect stdout/stderr to mode-`0600` bounded files and monitor byte progress outside
   the app Bun event loop;
5. on inactivity timeout, signal the process group, escalate to `SIGKILL`, `wait`
   the direct child, and verify the process group is empty;
6. atomically write the terminal result;
7. release `flock` only after step 5 or confirmed normal group exit.

Add explicit runtime dependencies for the wrapper (`flock`, `setsid`, and the required
core utilities) to the canonical Docker image rather than assuming a developer machine.
The image currently uses `oven/bun:<version>-slim` and installs only curl, certificates,
Git, and tini.

A broker crash must not release `flock`: the separately owned wrapper continues to a
terminal result. A replacement broker reads the active record and returns/waits for that
result instead of issuing the mutation again. A client crash is handled the same way.

### Authentication

Stop writing authenticated HTTPS URLs to `.git/config`. Configure the credential-free
remote URL and provide authentication only in the wrapper environment using the existing
resolved secret. Hosted Brain startup must normalize the configured token into a broker-
inherited secret environment entry; structurally injected test/embedding clients use an
ephemeral credential provider. Do not send the token in a journaled request. If a
standalone direct `authToken` value cannot cross the boundary without durable or logged
material, reject that configuration with a migration error rather than retaining an
unsafe compatibility path. Durable records contain only the existing remote fingerprint.
Redact URL userinfo and authorization material at both broker and client boundaries.

Local `file://`, SSH, and unauthenticated HTTPS remotes continue to work. Test each
transport without network access except for mocked loopback fixtures.

### Recovery and health

Keep the existing `directory-sync.git-reconciliation` checkpoint authoritative for the
Git-to-job handoff. Broker durability answers “did this Git command finish safely?”; the
checkpoint answers “was the resulting HEAD durably converted into queue work?” Do not
combine those responsibilities.

On startup:

1. broker reconciles active wrapper records and refuses the checkout while a live wrapper
   owns it;
2. completed unacknowledged requests become queryable by request ID;
3. directory-sync validates repository identity/branch and runs existing checkpoint
   replay;
4. stale operation history records the interrupted handoff and recovery result;
5. only then may ordinary periodic/auto-commit work resume.

A broker outage or over-age active request degrades `/health/operate` with sanitized
facts. `/health/live` and `/health/ready` remain independent. Broker supervision has its
own bounded restart budget and reports an incident rather than restarting the entire
container indefinitely.

## Implementation phases

### Phase 0 — Preserve the red reproductions

Work from PR #124; do not implement directly on `main`.

Add deterministic tests that fail with the current in-process runner:

- Git exits and writes complete output while its Bun completion promise is withheld;
- a web auto-commit request and worker pull target the same checkout concurrently;
- the client disconnects after Git mutation but before acknowledgement;
- the broker dies while the wrapper and Git process group are active.

Use barriers and injected process/protocol interfaces, not timing-sensitive polling.
Retain the upstream-style real Git reproduction as an opt-in Linux test.

### Phase 1 — Protocol and durable journal

Implement schemas, message framing, request IDs, atomic mode-`0600` records, bounded
capture, redaction, and idempotent lookup before executing real Git.

Tests first:

- malformed/version-mismatched/oversized messages are rejected;
- duplicate request IDs return the same result and never call the executor twice;
- partial journal writes are ignored/quarantined safely;
- credentials cannot appear in serialized records or errors;
- checkout registration rejects identity/path drift.

### Phase 2 — Wrapper and advisory lock

Implement the wrapper and prove lock/reap behavior independently of the broker.

Tests first on Linux:

- two wrappers for one checkout never overlap;
- different checkouts may proceed independently;
- output resets the inactivity deadline;
- a silent process group is killed, waited, and absent before lock release;
- descendants holding output pipes are killed and disappear;
- killing the broker does not drop the wrapper's lock;
- killing the client does not duplicate the operation;
- paths and output containing spaces, newlines, and NUL-delimited porcelain records are
  preserved byte-for-byte;
- output overflow is bounded and safely terminated.

Do not continue if `spawnSync` itself reproduces lost completion or cannot prove group
termination. In that case keep the same protocol/journal and replace only the broker's
executor with a long-lived POSIX/native helper; do not fall back to app-process polling.

### Phase 3 — Broker service and supervision

Add the broker child role and Unix-socket client.

Tests first:

- broker is ready before web/worker startup;
- web and worker share one registered checkout owner;
- broker restart budget/cooldown is bounded;
- shutdown drains or leaves an externally recoverable active record;
- stale socket handling cannot evict a live broker;
- socket permissions are `0600` and journal directory permissions are `0700`;
- direct/in-process test shells can inject a structural runner without starting a broker.

### Phase 4 — Route every Git path

Use the broker-backed `OwnedGit` runner for:

- repository probe, clone, init, branch repair, and remote configuration;
- status, rev-parse, logs, diff, show/index inspection;
- add, commit, conflict checkout/rm, and remote-deletion reconciliation;
- fetch/pull/merge and push;
- local content-remote bootstrap;
- auto-commit, periodic sync, initial sync, startup replay, tools, and worker
  `sync-request` handling.

After conversion, repository searches must find no `simpleGit()` execution and no direct
`Bun.spawn`, Node `spawn`, or `spawnSync("git", …)` path in directory-sync outside the
broker/wrapper implementation and explicit test fixtures. Remove `simple-git` only after
porcelain status, logs, remotes, clean commits, conflicts, renames, and paths containing
spaces retain behavior.

### Phase 5 — Crash and handoff recovery

Exercise crash points after:

- lock acquisition;
- Git start;
- Git exit before result write;
- result write before socket acknowledgement;
- pull merge before changed-path derivation;
- changed-path derivation before queue enqueue;
- enqueue before checkpoint advance;
- local commit before push and before checkpoint capture.

For every case prove checkout convergence, idempotent replay, remote-delete authority,
zero duplicate commits, zero orphaned process groups, and a truthful sanitized operation
history.

### Phase 6 — Affected-runtime acceptance

The workaround is specifically required to pass on the affected runtime; a canary-only
pass is insufficient.

Run in the packaged Linux/container runtime on Bun 1.3.11 and separately on 1.3.14:

1. focused protocol/wrapper/process-group tests;
2. 100-cycle commit/push/pull zombie soak;
3. three unchanged 350-file packaged soaks with persistence and deterministic deletion
   barriers;
4. forced broker termination during pull, followed by broker restart and checkpoint
   replay;
5. full install, build, typecheck, lint, unit, package, and supervisor-startup checks;
6. one independent scheduled soak with retained Bun version, broker journal summary,
   queue convergence, and process inventory.

Also run the same matrix on the fixed immutable Bun release when it exists. That result is
defense-in-depth evidence, not permission to skip affected-runtime proof.

## Validation commands

Use the shortest relevant commands while iterating; preserve piped exit codes.

```sh
bun install --frozen-lockfile
bun run --filter @brains/directory-sync test
bun run --filter @brains/directory-sync typecheck
bun run lint
bun run typecheck
bun run build --filter=@rizom/brain
RUN_IMPORT_BURST_SOAK=1 IMPORT_BURST_FILE_COUNT=350 \
  bun test packages/brain-cli/test/import-burst-stability.test.ts
```

Add dedicated broker test scripts rather than hiding the affected-runtime matrix behind a
generic retry. Never retry an unexplained failed soak.

## Review and PR strategy

- Keep PR #124 draft while the broker is incomplete.
- Prefer stacking broker work on its branch or a child worktree, then update/squash #124
  so the owned client and safe execution boundary ship together. Do not merge/release the
  mechanical conversion alone.
- Keep commits phase-sized: protocol/journal, wrapper, supervision, routing, recovery,
  acceptance infrastructure.
- Require a changeset for the directory-sync/Brain runtime behavior and any ops/deploy
  template changes.
- Generated rollout files remain CI-owned.

## Rollout

Code completion does not authorize deployment.

1. Merge only after affected-runtime and scheduled acceptance passes.
2. Publish a new Brain alpha and update smoke desired state in a separate approved change.
3. Before restart: collect fresh read-only evidence, backup, and DB/Git parity proof.
4. Deploy to smoke only with explicit approval; first verify passive broker health,
   process inventory, queue drain, and checkpoint state.
5. A remote load is a separate performance/acceptance action requiring separate approval.
6. Roll back the image/config if broker startup or passive parity fails; never hard-reset
   or force-push content as rollback.

## Handoff checklist

1. Read this file, [`directory-sync-export-stall.md`](./directory-sync-export-stall.md),
   and Phase 6 history in
   [`directory-sync-import-load.md`](./directory-sync-import-load.md).
2. Inspect PR #124 and worktree
   `~/Documents/brains-worktrees/directory-sync-owned-git-processes` without discarding
   unrelated worktrees.
3. Rebase onto current `origin/main` and rerun its 515-test directory-sync baseline.
4. Start with Phase 0 red tests; do not begin with process-supervisor production code.
5. Record each disproved design in this plan or the PR. Do not blind-retry lost
   completions.
6. Keep the separate dirty
   `directory-sync-persistent-zombie-gate` worktree untouched.
7. Do not alter production, rover-pilot desired state, watchdog policy, or smoke load.

## Done criteria

This plan is complete when:

- app web/worker processes execute no Git child process;
- one broker serializes all commands for a checkout across process roles;
- timeout/crash tests prove lock retention through complete process-group termination;
- duplicate and lost acknowledgements cannot duplicate Git mutations;
- checkpoint replay closes every Git-to-queue crash window;
- Bun 1.3.11 and 1.3.14 pass the complete affected-runtime matrix;
- normal CI and an independent scheduled soak pass without retries;
- operational health surfaces broker failures while readiness/liveness remain correct;
- no secret enters durable state or logs;
- PR #124 (or its replacement) merges with the broker, not before it.
