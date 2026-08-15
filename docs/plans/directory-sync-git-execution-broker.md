# Plan: Directory-sync Git execution broker

## Status

Active — design correction accepted; implementation must restart from updated `main`.
This plan owns **Git runtime safety only**. Directory-sync import performance, AI-call
fan-out, queue throughput, and the 350-file performance gates stay in
[`directory-sync-import-load.md`](./directory-sync-import-load.md).

Draft PR [#124](https://github.com/rizom-ai/brains/pull/124) and worktree
`~/Documents/brains-worktrees/directory-sync-owned-git-processes` preserve the reviewed
wrapper implementation at `272f2c949`. That implementation introduced an OS-owned shell
wrapper and removed `simple-git`; this plan supersedes both decisions. Keep the draft and
worktree as evidence, but do not continue implementation there.

Merge this plan to `main` first. Then create a new implementation worktree and branch from
the updated `origin/main`; carry no wrapper implementation commits forward. Do not publish,
deploy, restart production, or run a remote workload from this work.

## Decision summary

Use one supervised, semantic Git broker as the checkout owner:

- web and worker never spawn Git;
- the broker serializes complete Git operations, not individual commands;
- the broker uses `simple-git` for Git semantics and child execution;
- `simple-git` is not the ownership or recovery boundary;
- a missing Git completion fails closed: the operation remains owned and is never retried
  or unlocked in-process;
- stale progress or broker failure stops Git admission and terminates the broker's complete
  process group;
- web and worker stay available while the supervisor proves the broker/Git process group
  is gone, starts a replacement broker, and reconciles before reopening Git admission;
- if process-group termination cannot be proven, the supervisor fails the complete Brain
  runtime and external supervision performs the final cleanup;
- startup reconciliation derives the actual repository state rather than replaying an
  ambiguous mutation;
- the only ambient runtime executable required by directory-sync is `git`.

Remove the shell wrapper, `flock`, `setsid`, `timeout`, and undeclared coreutils
requirements. Do not replace them with another ambient helper. A fixed Bun release remains
valuable defense in depth but is not required if fail-closed recovery passes on the
shipped affected runtime.

## Problem statement

Three related problems require one owner at the operation boundary.

### 1. Checkout ownership is per process

Directory-sync runs in web and worker. Each plugin instance currently has its own
in-memory `SerialQueue`, so auto-export and pull can enter independent queues for the same
checkout. No Bun version or Git client library fixes that. One broker must own the
checkout across process roles.

### 2. Bun can lose Git child completion

On Bun 1.3.11 and 1.3.14, this can remain pending after Git has exited:

```ts
const child = Bun.spawn(["git", "pull"]);
const exitCode = await child.exited;
```

The observable failure is:

1. Git mutates the checkout and exits at the operating-system level;
2. Bun does not resolve the child-completion continuation;
3. the caller waits forever while retaining its serialized turn;
4. a retry is unsafe because the mutation may already have succeeded.

`simple-git` is not known to be defective. It waits through Bun's Node child-process
compatibility layer and therefore observes the same runtime failure. Replacing it with
`Bun.spawn` does not help. `Promise.race`, an in-process timer, a Worker, or an abort does
not establish that the complete Git process tree is gone; the measured reproduction also
failed to resume the owner's timer.

The upstream Bun fix passed isolated canary evidence, but no immutable fixed stable release
currently carries it.

### 3. A Git operation is more than one command

Command-level `flock` is not enough. A commit operation may run status, conflict
resolution, add, marker checks, commit, and rev-parse. A pull may commit local changes,
pull, resolve conflicts, derive changed paths, and reconcile remote deletions. Allowing a
second process to interleave between those commands preserves filesystem exclusion while
breaking operation semantics.

The broker must serialize complete operations such as `initialize`, `commit`, `pull`, and
`push`. It must not expose a lease that an application process can forget to release.

## Why the safeguard is safe

A timeout followed by unlock or retry is unsafe: timeout does not answer whether Git
finished, remains active, or left descendants touching the checkout.

The accepted safeguard is **fail closed and replace only the proven-dead owner**:

1. the broker durably records the request before starting the operation;
2. the broker retains the per-checkout operation turn until it has a terminal result;
3. progress updates a credential-free durable heartbeat;
4. if completion is lost, the request remains active and the turn remains held;
5. request-driven health and supervisor monitoring detect stale progress and close Git
   admission;
6. the supervisor terminates the broker's dedicated process group, including Git
   descendants, without relying only on the affected child-completion Promise;
7. only after an OS process-group probe proves that group empty may it start a replacement
   broker;
8. the replacement reconciles the journal, repository, and durable handoff checkpoint
   before reporting ready and reopening Git admission;
9. web and worker remain running throughout broker recovery;
10. if the supervisor cannot prove the broker process group empty, it does not replace the
    broker: it fails the complete Brain runtime so external supervision can remove the old
    process tree before replacement.

The tradeoff is explicit: a rare Bun completion loss briefly degrades Git operations and
restarts the broker. The rest of the app remains available when ownership termination is
proven; full-runtime restart is the fail-safe, not the normal recovery path.

## Goals

1. Give every managed checkout exactly one owner across web and worker.
2. Serialize complete directory-sync Git operations.
3. Keep Git child execution outside app process event loops.
4. Fail closed on unknown command outcome.
5. Recover through broker-only replacement when process-group termination is proven, with
   full-runtime external recovery as the fail-safe.
6. Preserve remote-deletion authority and Git-to-queue checkpoints.
7. Preserve authenticated HTTPS, SSH, `file://`, and unauthenticated HTTPS behavior.
8. Require no ambient runtime executable beyond `git`.

## Non-goals

- Do not change import batching, parsing, embeddings, topic extraction, AI concurrency, or
  queue priorities.
- Do not make `/health/live` or `/health/ready` depend on repository reachability.
- Do not release a checkout turn merely because a deadline elapsed.
- Do not replace a broker until its complete process group is proven gone.
- Do not stop healthy web or worker roles for an ordinary proven-safe broker replacement.
- Do not run two brokers for one Brain instance or use PID-scoped hosted brokers.
- Do not introduce a shell/native wrapper, `flock`, `setsid`, `timeout`, or coreutils
  runtime contract.
- Do not implement a manual replacement for `simple-git` status, log, remote, or commit
  semantics unless a demonstrated gap requires one narrow parser.
- Do not attribute the historical alpha.262 incident without fresh evidence.
- Do not deploy, restart, alter watchdog policy, or run remote load without separate
  approval.

## Safety invariants

These are release blockers.

1. **One semantic owner.** Every managed Git operation reaches one broker, and the broker
   holds one per-checkout turn for the complete operation.
2. **No unconfirmed unlock.** A timeout or lost completion never releases ownership or
   triggers an in-process retry.
3. **Proven broker replacement.** Broker exit, stale progress, or missed heartbeat closes
   Git admission and terminates the broker process group. A replacement starts only after
   that group and every Git descendant are proven absent.
4. **Full-runtime fail-safe.** If broker process-group termination cannot be proven, no
   broker replacement starts; the complete Brain runtime exits for external cleanup.
5. **No duplicate mutation.** Request IDs are idempotent while the broker lives; after a
   crash, ambiguous mutations are reconciled from repository state, never replayed from
   intent.
6. **Credential-free durability.** Tokens and authenticated URLs never enter `.git/config`,
   argv, socket messages, journals, runtime-state rows, errors, metrics, or logs.
7. **Remote deletion remains authoritative.** Existing pending-delete and reconciliation
   behavior is unchanged.
8. **Request-driven health.** Durable progress age may degrade `/health/operate`; routing
   readiness and liveness remain independent.
9. **Bounded data.** Protocol frames and retained stdout/stderr are bounded and sanitized.
10. **No ambient helper dependencies.** Production requires Bun and `git`, not a particular
    shell or Linux userland.
11. **No casts.** Use Zod contracts and structural interfaces without `as`, `as unknown`,
    or equivalent assertions in this change.

## Architecture

```text
web process ───┐
               ├─ typed GitSync broker client ── Unix socket ── git-broker process
worker process ┘                                      │
                                                      ├─ checkout registry
                                                      ├─ per-checkout operation queue
                                                      ├─ durable request/progress journal
                                                      └─ simple-git ── git

parent supervisor ── broker heartbeat/progress watchdog ── broker-group replacement
external supervisor ── full-runtime cleanup only when broker-group proof fails
```

### One broker, no fallback

The broker starts before web and worker. Both receive the same socket path. A Brain with
Git configured must not boot Git-capable app roles until the broker is ready.

There is no app-process Git fallback. Interactive, startup-check, and development paths
must either start the same broker child or inject a structural fake that executes no real
Git. They must not host PID-scoped brokers that can independently own the same checkout.

A Brain with no Git configuration does not start the broker and does not acquire Git
runtime dependencies.

### Canonical ownership endpoint

The broker runtime endpoint derives from the Brain instance and intended checkout identity,
not a PID. Bootstrap canonicalizes the nearest existing parent plus the intended checkout
name; after clone/init, registration verifies the physical path and refuses identity drift
or a second key for the same checkout.

Socket binding is the live singleton boundary. A stale socket is never removed by an app
process. The parent supervisor may replace it only after terminating the broker's dedicated
process group and proving that group absent. If that proof fails, local unsupervised
operation fails closed and the supervised runtime exits rather than guessing that a stale
owner is safe to evict.

This design guarantees one owner across process roles within the supported single-instance
Brain topology. Running two independently supervised Brain instances over one writable
checkout is unsupported and must be rejected by deployment/configuration validation.

### Semantic protocol

Do not expose arbitrary Git argv or a client-held checkout lease. Define Zod messages for:

- `register-checkout`: canonical identity, branch, credential-free remote fingerprint,
  timeout/progress policy;
- `execute-operation`: request ID and one closed semantic operation;
- `progress`: request ID, phase, sanitized timestamp, and bounded byte counts;
- `result`: request ID and operation-specific typed result;
- `status`: broker identity, registered checkouts, active requests, and oldest progress;
- `heartbeat`: broker identity and monotonic activity timestamp.

Initial operation set:

- `initialize`
- `get-status`
- `has-local-changes`
- `commit`
- `push`
- `pull`
- `get-reconciliation-delta`
- `get-checkpoint`
- `log-file`
- `show-file`

The broker executes each operation from start to terminal result under one queue turn.
Business sequences currently spread across app-side `git-*.ts` modules move behind this
semantic boundary. The existing `IGitSync` contract becomes the client-facing seam so
callers and test fakes do not learn protocol details.

### `simple-git` placement

Keep `simple-git` as a packaged dependency of the compound directory-sync package, but
construct it only inside the broker process. Use its structured status, log, remote, and
commit behavior rather than maintaining duplicate parsers in app code. Use `raw` only for
operations with no suitable narrow API, preserving explicit argument tests.

`simple-git` is a Git adapter, not a safety boundary. If its Promise never settles because
Bun loses child completion, the broker's durable request remains active and the fail-closed
supervision path takes over.

### Authentication

Configure only a credential-free remote URL. Provide HTTPS authentication ephemerally
through Git's environment-supplied configuration (`GIT_CONFIG_COUNT`,
`GIT_CONFIG_KEY_n`, and `GIT_CONFIG_VALUE_n`) or an equally helper-free provider whose
secret comes from the broker's inherited environment or an injected test provider. Set
non-interactive Git behavior explicitly. Do not add an askpass script or credential helper
executable.

Do not send tokens over the broker socket. If a structurally injected standalone token
cannot reach the broker without durable transport, reject that configuration with a clear
migration error rather than writing it to `.git/config`.

Test private HTTPS through a local fixture and assert that the token is absent from:

- `.git/config`;
- process arguments;
- protocol frames;
- request/progress journals;
- stdout/stderr, errors, and logs.

### Progress, timeout, and health

The broker writes an active request before calling `simple-git` and updates progress while
output advances. The client continues to invoke `onGitProgress`, preserving existing
operation-status freshness.

A library timeout may request child termination, but it does not authorize unlock or
retry. If the operation Promise does not reach a terminal result, durable progress becomes
stale.

Health is evaluated from durable facts on request:

- broker heartbeat missing or stale;
- active operation progress older than its policy;
- broker socket unavailable;
- ambiguous request left by a failed generation.

These degrade `/health/operate` with sanitized facts. `/health/live` and `/health/ready`
remain independent. The parent supervisor also watches broker heartbeat/progress so
recovery does not depend on an HTTP request arriving.

### Supervision

Spawn the broker as a dedicated process-group leader. `simple-git` Git children inherit
that process group; disable Git hooks and automatic maintenance so managed commands cannot
escape it. The supervisor must not depend solely on the broker child's completion Promise
to decide that ownership ended.

The normal recovery lifecycle is:

1. start broker and record its process-group identity;
2. wait for broker readiness;
3. start web, then worker;
4. on broker exit/stall, close Git admission while web and worker remain available;
5. reject or durably hold new Git requests without app-process fallback;
6. signal the broker process group, escalate to `SIGKILL`, and probe the group through OS
   process APIs until every member is absent;
7. if absence is proven, start one replacement broker;
8. reconcile ambiguous journal state, Git state, and the durable handoff checkpoint;
9. report broker ready and reopen Git admission.

If step 6 cannot prove the group absent within the bounded recovery policy, do not start a
replacement. Signal web and worker, exit the parent runtime non-zero, and let the external
supervisor remove the complete container/process tree before starting a new generation.

Normal shutdown stops Git admission, drains terminal operations where possible, then stops
web and worker before the broker and parent. An operation still ambiguous is never declared
successful merely to make shutdown fast.

### Durable recovery and checkpoint

The broker journal answers: “what request was active, and did this generation record a
terminal result?” The existing `directory-sync.git-reconciliation` checkpoint answers:
“was the resulting Git state converted into durable queue work?” Keep those concerns
separate.

On startup:

1. read the previous credential-free broker journal;
2. classify terminal and ambiguous requests without replaying intent;
3. validate checkout identity, branch, and remote fingerprint;
4. inspect the actual HEAD, index, merge state, and remote refs;
5. run existing checkpoint replay and remote-delete reconciliation;
6. record the recovery outcome in sanitized operation history;
7. only then permit periodic pull or auto-commit.

A lost acknowledgement within a live broker is replayable by request ID. A request made
ambiguous by broker replacement or full-runtime failure is not automatically re-executed,
even with the same ID.

## Implementation phases

### Phase 0 — Preserve the evidence

Keep deterministic reproductions for:

- Bun Git child exits while completion remains pending;
- web auto-commit and worker pull target one checkout concurrently;
- client disconnect after mutation before acknowledgement;
- broker loss during a mutating operation.

The lost-completion reproduction must use an injected `simple-git` execution boundary so
it remains deterministic and does not depend on reproducing a Bun scheduler failure in
ordinary CI.

### Phase 1 — Remove the superseded wrapper design

Delete or revert:

- `git-wrapper.sh` and its materialization/observation code;
- wrapper artifact formats and dependency checks;
- `flock`, `setsid`, `timeout`, bash, and coreutils assumptions;
- PID-scoped hosted brokers;
- command-level ownership claims;
- manual `OwnedGit` parsing that merely duplicates `simple-git`.

Restore `simple-git` as a runtime dependency, but do not restore app-process construction
or direct execution.

Tests first: package/build inspection proves no wrapper asset and no ambient helper lookup
remains, while app web/worker source contains no `simpleGit()` construction.

### Phase 2 — Semantic broker ownership

Define the typed operation protocol and move complete Git operation sequences into the
broker. One queue turn covers each semantic operation. Preserve the existing `IGitSync`
API at callers.

Tests first:

- two clients cannot interleave commands within one commit or pull;
- independent checkouts can proceed concurrently;
- duplicate request IDs return one result and execute one mutation;
- malformed, oversized, or unknown operations are rejected;
- status, logs, remotes, no-op commits, conflicts, renames, detached HEAD, and unusual
  paths retain real-Git behavior through `simple-git`.

### Phase 3 — Fail-closed broker supervision

Add heartbeat/progress monitoring and broker-only process-group recovery. Full-runtime
shutdown is the fallback only when group termination cannot be proven.

Tests first with deterministic barriers:

- broker ready precedes web/worker startup;
- broker and all Git descendants share one dedicated process group;
- missing completion leaves the checkout turn held and closes Git admission;
- stale progress terminates that group without stopping healthy web/worker roles;
- no replacement starts before an OS process-group probe proves the old group absent;
- the replacement reconciles before Git admission reopens;
- unproven group termination stops web/worker and exits the parent non-zero;
- graceful shutdown order and ambiguous-operation handling remain safe;
- a Brain without Git starts no broker.

### Phase 4 — Authentication and bounded protocol

Implement credential-free remote configuration and ephemeral child authentication. Bound
frames and retained output without introducing shell helpers.

Tests first:

- local authenticated HTTPS clone, pull, and push pass;
- SSH, `file://`, and unauthenticated HTTPS retain behavior;
- token searches across config, argv, frames, journals, errors, and logs return zero;
- output overflow returns a truthful bounded error and does not unlock/retry.

### Phase 5 — Health and durable recovery

Wire request-driven broker health into `/health/operate`, preserve routing health, and join
broker journal recovery with the existing reconciliation checkpoint.

Tests first:

- stale progress and unavailable socket degrade only operational health;
- `oldestActiveStartedAt` and progress age are truthful;
- result-before-ack reconnect returns the recorded result once;
- broker replacement never replays ambiguous intent;
- replacement reconciliation converges HEAD, queue work, remote deletes, and checkpoint
  without duplicate commits;
- full-runtime fallback preserves the same convergence when group proof fails.

### Phase 6 — Broker-group termination and fallback proof

Build a packaged harness that deliberately withholds Git completion after a real mutation.
The primary path must prove:

1. the operation stays owned and Git admission closes;
2. operational health degrades while web and worker remain live/ready;
3. the supervisor terminates the broker/Git process group;
4. an OS probe proves no group member survives;
5. exactly one replacement broker starts and reconciles before admission reopens;
6. repository, queue, remote-delete, and checkpoint state converge without duplicate
   mutation.

A second injected case must make group-absence proof fail and prove that no replacement
broker starts, the full runtime exits failed, external supervision removes the old process
tree, and the next runtime converges.

These are the safety proofs that replace wrapper process-group management. Do not
substitute a unit test that merely observes signals.

### Phase 7 — Affected-runtime acceptance

Run on the packaged Linux runtime with the shipped affected Bun version, currently 1.3.14:

1. focused broker/protocol/supervisor/recovery tests;
2. deterministic lost-completion broker-group recovery plus full-runtime fallback;
3. 100-cycle commit/push/pull process-inventory soak;
4. three unchanged 350-file packaged soaks with persistence and deletion barriers;
5. full install, build, typecheck, lint, unit, package, and startup checks;
6. one independent scheduled soak with retained Bun version, journal summary, queue
   convergence, and process inventory.

Run the same matrix on the first immutable fixed Bun release when available. The fixed
runtime is defense in depth, not permission to skip affected-runtime recovery evidence.
Never retry an unexplained failure.

## Validation commands

Use the shortest relevant command while iterating and preserve piped exit codes:

```sh
bun install --frozen-lockfile
bun run --filter @brains/directory-sync test
bun run --filter @brains/directory-sync typecheck
bun test packages/brain-cli/test/process-supervisor.test.ts
bun run lint
bun run typecheck
bun run build --filter=@rizom/brain
RUN_IMPORT_BURST_SOAK=1 IMPORT_BURST_FILE_COUNT=350 \
  bun test packages/brain-cli/test/import-burst-stability.test.ts
```

Add named scripts for broker-group recovery, full-runtime fallback, and the affected-Bun
matrix. Do not hide them behind retries or repurpose deployment workflows.

## Review and PR strategy

- Merge this plan to `main` before implementation.
- Preserve PR #124 and its worktree as superseded evidence; do not rewrite them into the
  new design.
- After this plan merges, create a new implementation branch/worktree from updated
  `origin/main` and open a replacement PR.
- Mark PR #124 superseded when the replacement PR establishes its red-test baseline.
- Correct new changesets and comments to describe semantic ownership, proven broker-group
  replacement, full-runtime fallback, and broker-local `simple-git`.
- Require a changeset for Brain runtime behavior.
- Keep generated rollout files CI-owned.

## Rollout

Code completion does not authorize deployment.

1. Merge only after affected-runtime and independent scheduled acceptance pass.
2. Publish a new Brain alpha and update smoke desired state in a separate approved change.
3. Before restart, collect fresh read-only evidence, backup, and DB/Git parity proof.
4. Deploy to smoke only with explicit approval.
5. Verify passive broker health, process inventory, queue drain, and checkpoint state
   before any remote load.
6. A remote load requires separate approval and reversible cleanup.
7. Roll back the image/config if broker startup or passive parity fails; never hard-reset
   or force-push content as rollback.

## Done criteria

This plan is complete when:

- `simple-git` is constructed only inside the broker;
- app web/worker processes execute no Git child;
- one broker serializes complete operations for each checkout;
- a Brain without Git starts no broker;
- production has no shell wrapper, native helper, or ambient dependency beyond `git`;
- timeout/lost completion never unlocks or retries in-process;
- broker stall/exit closes Git admission and replacement waits for proven process-group
  absence;
- healthy web/worker roles remain available during proven-safe broker replacement;
- inability to prove broker-group absence starts no replacement and fails the whole runtime
  for external cleanup;
- authenticated transport is ephemeral and no secret enters config, argv, protocol,
  durable state, errors, or logs;
- durable request recovery and the Git reconciliation checkpoint prevent duplicate
  mutation and close every Git-to-queue crash window;
- remote deletion remains authoritative;
- operational health reports broker failure and stale progress while readiness/liveness
  remain correct;
- Bun 1.3.14 passes the complete affected-runtime matrix without retries;
- normal CI and an independent scheduled soak pass;
- plan, comments, and changesets describe the final design accurately;
- PR #124 or its replacement merges only with all evidence retained.
