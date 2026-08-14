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
green current-main CI. It is intentionally unmerged for two reasons: its in-process Bun
runner cannot recover a completion notification that Bun loses, and it leaves checkout
ownership per-process.

This plan changes the earlier wait-only decision, and the reordered problem statement is
why: a fixed stable Bun addresses only the second defect below, never the first. A future
fixed Bun therefore remains valuable defense in depth but is **not** the delivery
dependency for this workaround. The workaround may ship on Bun 1.3.11 only after the
affected-runtime acceptance matrix below passes unchanged.

## Problem statement

Two independent defects share one fix. Order matters: only the first is verified in
current code and immune to any runtime upgrade, and it is the primary justification for a
cross-process owner.

**1. Checkout ownership is per-process, not per-checkout.** `GitSync` holds
`private readonly lock = new SerialQueue()` (`git-sync.ts:50`), and `plugin.ts:451`
constructs one `GitSync` per plugin instance. The plugin runs in both the web process
(auto-export) and the worker process (`sync-request` handling), so a single checkout has
two independent in-memory queues that cannot see each other. No Bun version fixes this.
The workaround must establish one cross-process owner rather than adding another
per-process mutex.

**2. Bun 1.3.11 and 1.3.14 can lose asynchronous child-process completion after Git has
finished.** When directory-sync awaits that completion while holding its `SerialQueue`
turn:

- the completed pull never reaches changed-path enqueue;
- later pull, push, commit, and DB→Git auto-export work remains blocked;
- in-process timers, Workers, Node `child_process` compatibility APIs, and completion
  sentinels cannot safely release the lock;
- restart clears the in-memory lock, but the affected process cannot prove when it is
  safe to do so itself.

The observed failure is broader than one unsettled promise. The current-main reproduction
hung with **both** `child.exited` and its in-process Effect timer failing to resume the
owner (`directory-sync-export-stall.md`). Treat the failure class as "the affected event
loop stopped resuming this work", not "one child-completion promise was lost". Unlike
defect 1, defect 2 does have a runtime remedy: `oven-sh/bun#26580` is fixed upstream and
three consecutive 350-file soaks passed on `1.4.0-canary.1`.

The load-bearing property of this design is therefore **process isolation**: Git execution
and checkout serialization move to a supervised process whose event loop is separate from
web and worker, so a lost completion can neither wedge nor prematurely release checkout
ownership, and a wedged executor cannot hold an app-process queue. Synchronous versus
asynchronous execution _inside_ the broker is a secondary implementation choice, not the
safety mechanism.

## Goal

Give a checkout exactly one owner across process roles, and move Git execution and
checkout serialization outside the web and worker Bun event loops so a lost app-process
child completion cannot wedge or prematurely release that ownership.

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

The existing `OwnedGit` client remains the only Git semantic API. A `BrokerGitCommandRunner`
replaces `OwnedGitProcessRunner` behind the existing `GitCommandRunner` interface; call
sites never learn about IPC. No such composition point exists yet — `OwnedGitProcessRunner`
is constructed inline at six sites — so Phase 4 builds the seam before Phase 5 uses it.

### OS-owned command wrapper

The broker must never await `Bun.spawn().exited` for individual Git commands, and must
never block its own event loop for the duration of a command. Both constraints hold
together, and together they rule out `Bun.spawnSync` as the broker-to-wrapper boundary.

`Bun.spawnSync` was the earlier candidate on the theory that a synchronous wait avoids the
broken async completion path. Reject it: a blocked broker cannot service its socket, so it
cannot emit `progress`, cannot answer `status`, cannot accept work for a second checkout,
and is indistinguishable from a broker outage for the whole duration of every clone and
pull. That contradicts the `progress`/`status` messages defined above, the independent-
checkout requirement, and the live `onGitProgress` heartbeat described under Progress and
health.

Instead the broker starts the wrapper detached, never awaits it, and observes the
wrapper's own durable artifacts: bounded output files with byte counters, and one atomic
terminal result record. This is byte-identical to how a _replacement_ broker must recover
an active request after a crash, so the normal path and the recovery path are one code
path rather than two.

`directory-sync-export-stall.md` records that file sentinels and persistent timer polling
were not reliable workarounds. That verdict was measured **inside the affected app
process**, whose event loop stopped resuming the owner; it does not automatically transfer
to a dedicated broker with a separate event loop and no app workload. It is also not
assumed — Phase 2 gates on proving broker-side observation resumes under the affected
runtime before any later phase depends on it.

The wrapper, not the broker's JavaScript promise, owns command safety:

1. acquire `flock` on a deterministic lock file outside the replaceable checkout;
2. atomically create the request's active record;
3. start Git in a dedicated session/process group via `setsid`;
4. redirect stdout/stderr to mode-`0600` bounded files and advance byte counters in the
   active record, outside the app Bun event loop — these counters are what the broker
   reads to emit `progress`, so they must advance during the command, not at exit;
5. on inactivity timeout, signal the process group, escalate to `SIGKILL`, `wait`
   the direct child, and verify the process group is empty;
6. atomically write the terminal result;
7. release `flock` only after step 5 or confirmed normal group exit.

Wrapper dependencies are already present and must not be treated as a missing install:
`oven/bun:<version>-slim` ships `flock`, `setsid`, `timeout`, and `bash` at `/usr/bin`
(verified against `oven/bun:1.3.11-slim`), on top of the image's explicit curl,
ca-certificates, Git, and tini. The real gap is proof, not installation — add a
packaged-image check that every wrapper dependency resolves at runtime, so a future
base-image change cannot silently remove one.

A broker crash must not release `flock`: the separately owned wrapper continues to a
terminal result. A replacement broker reads the active record and returns/waits for that
result instead of issuing the mutation again — the same read the running broker already
performs on the normal path. A client crash is handled the same way.

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

### Progress and health

`onGitProgress` is a live heartbeat, not cosmetic status.
`directorySyncRequestJobHandler.ts:66` and `git-periodic-sync.ts:32` build
`createProgressObserver(runId)` and thread it into `pull`; `git-stall.ts` fires it once per
stdout chunk. Operation-status freshness — and therefore `/health/operate` — depends on
that signal arriving _during_ long clones and pulls, not at their end.

The broker preserves it end to end:

1. wrapper appends Git output to its bounded capture files;
2. wrapper advances byte counters in the active record;
3. broker observes the advance without blocking and emits `progress` for that request ID;
4. `BrokerGitCommandRunner` invokes the caller's `onProgress`;
5. `OwnedGit` and every call site keep today's `GitCommandOptions.onProgress` contract
   unchanged.

Failure branches:

- no byte advance within the inactivity deadline → the wrapper terminates and reaps the
  process group (wrapper step 5) and writes a timeout result; the client sees the existing
  stall error class;
- broker unreachable → the client surfaces a broker-outage error and `/health/operate`
  degrades, while `/health/live` and `/health/ready` stay independent;
- progress observed but no terminal record appears → the request stays active and
  externally recoverable, and is never silently completed or unlocked.

### Startup recovery and checkpoint

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

An over-age active request degrades `/health/operate` with sanitized facts, on the same
terms as the broker-outage branch above. Broker supervision has its own bounded restart
budget and reports an incident rather than restarting the entire container indefinitely.

## Implementation phases

### Phase 0 — Preserve the red reproductions

Work from PR #124; do not implement directly on `main`.

Add deterministic tests that fail with the current in-process runner. **Done** — see
`plugins/directory-sync/test/git/git-broker-reproductions.test.ts`:

- Git exits and writes complete output while its Bun completion promise is withheld. The
  injected child settles neither `exited` nor `reaped`; the stall deadline fires and kills
  the group, but the runner still never settles, so the `SerialQueue` turn is never
  released. Fails on `firstSettled: false`.
- A web auto-commit and a worker pull target the same checkout concurrently. Two `GitSync`
  instances over one `dataDir` both enter `withLock`. Fails on `maxActive: 2`.
- Opt-in real-Git counterpart (`RUN_GIT_OWNERSHIP_REPRO=1`, Linux): two owners committing
  to one checkout fail with `cannot lock ref 'HEAD'`.

Each is an `it.failing` tripwire rather than a skipped or deleted test: green while the
defect exists, red the moment the broker removes it, which is the signal to drop
`.failing` and keep the assertion as a regression test.

The plan's other two Phase 0 reproductions — client disconnect after mutation but before
acknowledgement, and broker death with the wrapper still live — move to Phase 1. Both are
statements about request IDs and the durable journal, so neither can be expressed before
Phase 1 defines that contract; written here they would assert against stubs rather than
reproduce anything. They are listed in Phase 1 below, not dropped.

Use barriers and injected process/protocol interfaces, not timing-sensitive polling.

### Phase 1 — Protocol and durable journal

Implement schemas, message framing, request IDs, atomic mode-`0600` records, bounded
capture, redaction, and idempotent lookup before executing real Git. **Done** —
`src/lib/broker/{protocol,journal,ledger,redaction}.ts`, no real Git executed yet.

Framing is a 4-byte big-endian length prefix over UTF-8 JSON, validated by Zod. The
length bound is checked before anything is allocated for the body, so a hostile prefix
costs nothing. `FrameDecoder` is separate from the socket, so Phase 3 adds transport to a
contract that is already proven.

Tests first — all landed:

- malformed/version-mismatched/oversized messages are rejected, and a frame split across
  chunks or two frames in one chunk reassemble correctly;
- duplicate request IDs return the same result and never call the executor twice;
- partial journal writes are ignored/quarantined safely;
- credentials cannot appear in serialized records or errors;
- a client that disconnects after Git mutation but before acknowledgement leaves the
  request recoverable by ID, and reconnecting never repeats the mutation (moved from
  Phase 0 — needs the request-ID contract to be expressible);
- a broker that dies while a wrapper and its Git process group are active leaves an active
  record that a replacement broker refuses to re-issue (moved from Phase 0).

Two decisions worth carrying forward:

- **Operation classes are `bootstrap`, `inspect`, `mutate`, `network`**, each with a closed
  subcommand allow-list; the executable is always `git`. `bootstrap` is deliberately the
  widest, because branch repair legitimately stages and commits seed content before a
  checkout can be registered. Its boundary is temporal, not narrow: Phase 3 must reject it
  once `register-checkout` has succeeded, so that surface exists only during bootstrap.
- **`settle()` is deliberately not `async`.** It registers the in-flight request before it
  yields; moving that registration past an `await` lets two same-tick duplicates both pass
  the journal check and run the command twice. The test asserts promise _identity_ for
  two same-tick calls, because asserting the executor ran once does not catch it — a
  delayed registration still passes that weaker assertion.

Checkout registration and identity/path-drift rejection move to Phase 3, which owns
`register-checkout` state; Phase 1 has no place to hold a registry.

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
- output overflow is bounded and safely terminated;
- byte counters advance in the active record while the command runs, not only at exit;
- the broker never awaits the wrapper child and never blocks for the command duration: it
  answers `status` and emits `progress` while Git is still running.

Two gates on the affected runtime (Bun 1.3.11), because every later phase depends on them:

1. broker-side observation of a detached wrapper resumes reliably across repeated cycles —
   the broker sees byte advance and then the terminal record without awaiting the child;
2. the wrapper proves process-group termination independently of the broker.

If gate 1 fails, keep the same protocol, journal, and wrapper, and replace only the
broker's observation mechanism with a long-lived POSIX/native helper. Do not fall back to
blocking the broker event loop, and do not fall back to app-process polling.

### Phase 3 — Broker service and supervision

This is a supervisor refactor, not an added child; size it accordingly.
`process-supervisor.ts` hardcodes `BrainChildRole = "web" | "worker"`, rejects any other
`--child=` value, treats the web child's exit as the command result (`webExitResult`), and
scopes every restart and heartbeat knob to the worker role (`workerRestartBaseMs`,
`workerRestartBudget`, `workerRestartWindowMs`, `workerHeartbeatIntervalMs`). Generalize
role identity, restart budget, and heartbeat policy per role first, then add the broker
role, explicit start ordering (broker ready → web and worker start), and stop ordering
(web and worker stopped → broker stopped).

Tests first:

- existing web and worker restart, heartbeat, and exit-result behavior is unchanged by the
  per-role generalization;
- broker is ready before web/worker startup;
- web and worker share one registered checkout owner;
- broker restart budget/cooldown is bounded;
- shutdown drains or leaves an externally recoverable active record;
- stale socket handling cannot evict a live broker;
- socket permissions are `0600` and journal directory permissions are `0700`;
- direct/in-process test shells can inject a structural runner without starting a broker;
- checkout registration rejects identity, branch, and path drift (moved from Phase 1,
  which has nowhere to hold the registry);
- `bootstrap` requests are rejected once the checkout is registered, and every other
  operation class is rejected before it is.

### Phase 4 — Runner composition seam

There is no composition point today. `OwnedGitProcessRunner` is constructed inline at six
sites: `git-repository.ts:51,95,116,137`, `git-sync.ts:81`, and `git-state.ts:11`. Phase 5
cannot "swap the runner at composition time" until a seam exists.

Introduce a `GitCommandRunner` factory and thread it through `directory-dependencies.ts` so
every Git path resolves its runner from injected dependencies. `OwnedGitProcessRunner`
stays the factory's only implementation in this phase; behavior must not change.

The `git-repository.ts` sites need a decision, not a shim. Probe, clone, and init run at
bootstrap against a `dataDir` before a checkout exists, so they cannot satisfy
`register-checkout` first. Define a `bootstrap` operation class: the broker accepts it for
a declared parent directory rather than a registered checkout, permits only probe, clone,
init, and branch repair, holds the same advisory lock keyed on the eventual checkout path,
and requires `register-checkout` to succeed before any other operation class is accepted
for that path.

Tests first:

- every Git path resolves its runner from injected dependencies, and no
  `new OwnedGitProcessRunner` remains outside the factory;
- a structural runner injected in tests observes every command, including clone and init;
- `bootstrap` is rejected once the checkout is registered;
- non-`bootstrap` classes are rejected before registration;
- the advisory lock covers a bootstrap clone against a concurrent command on the same path.

### Phase 5 — Route every Git path

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

### Phase 6 — Crash and handoff recovery

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

### Phase 7 — Affected-runtime acceptance

The workaround is specifically required to pass on the affected runtime; a canary-only
pass is insufficient.

The canonical image currently defaults to `ARG BUN_VERSION=1.3.10`, which this matrix does
not cover. Raise that default to 1.3.11 as part of this work, so the shipped image is a
runtime the matrix actually proves, and record the pin in the changeset.

Run in the packaged Linux/container runtime on Bun 1.3.11 and separately on 1.3.14:

1. focused protocol/wrapper/process-group tests, plus the packaged-image check that every
   wrapper dependency (`flock`, `setsid`, `timeout`, `bash`) resolves at runtime;
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
- Keep commits phase-sized: protocol/journal, wrapper, supervision, composition seam,
  routing, recovery, acceptance infrastructure.
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
   and that plan's own Phase 6 history in
   [`directory-sync-import-load.md`](./directory-sync-import-load.md) — not this plan's
   Phase 6.
2. Inspect PR #124 and worktree
   `~/Documents/brains-worktrees/directory-sync-owned-git-processes` without discarding
   unrelated worktrees.
3. Rebase onto current `origin/main` and rerun its directory-sync baseline. Verified
   2026-08-13 at `82c0415e8`: 515 pass, 1 skip, 0 fail on Bun 1.3.11, and the branch was
   behind `origin/main` only by docs and ops-workflow commits — the rebase carries no
   directory-sync code risk.
4. Start with Phase 0 red tests; do not begin with process-supervisor production code.
5. Record each disproved design in this plan or the PR. Do not blind-retry lost
   completions.
6. Keep the separate dirty
   `directory-sync-persistent-zombie-gate` worktree untouched.
7. Do not alter production, rover-pilot desired state, watchdog policy, or smoke load.

## Done criteria

This plan is complete when:

- app web/worker processes execute no Git child process;
- one broker serializes all commands for a checkout across process roles, replacing the
  per-instance `SerialQueue` as the ownership boundary;
- every Git path resolves its runner from injected dependencies, with no
  `new OwnedGitProcessRunner` outside the factory;
- the broker answers `status` and emits `progress` while a Git command is still running,
  and `onGitProgress` keeps firing during long clones and pulls;
- timeout/crash tests prove lock retention through complete process-group termination;
- duplicate and lost acknowledgements cannot duplicate Git mutations;
- checkpoint replay closes every Git-to-queue crash window;
- Bun 1.3.11 and 1.3.14 pass the complete affected-runtime matrix;
- normal CI and an independent scheduled soak pass without retries;
- operational health surfaces broker failures while readiness/liveness remain correct;
- no secret enters durable state or logs;
- PR #124 (or its replacement) merges with the broker, not before it.
