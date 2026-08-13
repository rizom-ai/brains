# Plan: Background work stops silently and never recovers

## Status

**Released in `@rizom/brain@0.2.0-alpha.284` on 2026-08-13.** Opened 2026-08-11 from a live production incident on rizom.ai,
**split out
2026-08-11** after code tracing found a confirmed worker-supervision invariant violation, then
expanded after the same day's rover-pilot deploy showed two operationally-degraded-but-deploy-green
site brains. The later evidence established a broader fault: **background work can stop while HTTP
stays ready**. `/health/operate` already makes the durable worker and projection state visible, but
`system_status`, the generated deploy workflow, and generated status views do not enforce that
signal.

The production evidence confirms that no live worker session existed. It does not prove that the
supervisor's restart-budget branch caused that specific incident because the corresponding parent
logs were unavailable. The branch is nevertheless a confirmed invariant violation that can produce
the observed green-web/dead-worker state and must be fixed independently of the original crash.

This plan does not replace
[`directory-sync-export-stall.md`](./directory-sync-export-stall.md). That separate plan now records
a locally confirmed unresolved-Bun-Git-completion failure class. The two mechanisms can produce
related symptoms and may both have contributed to the original 66-hour incident; do not conflate
their implementation work.

## Goal

Make "background work is not progressing" a **loud, self-correcting** condition instead of an
invisible permanent one. The specific crash that stopped the worker is secondary; the defect worth
fixing is that a brain can serve HTTP normally for days with its background pipeline dead or stranded,
and deploy can still report success because readiness is narrower than operational health.

## Confirmed evidence: worker dead while web serves (rizom.ai, 2026-08-11)

Live via MCP `system_status` / `system_job_status`:

- Version `0.2.0-alpha.279`, uptime climbing normally (764s → 790s across two polls). The process is
  healthy and serving; MCP and the site answer fine.
- Three jobs queued, **all `status: "pending"`, all `startedAt: null`**, unchanged across polls:
  `directory-sync:sync-request` (15:40:09Z), `shell:projection-rule` and `shell:embedding`
  (15:41:39Z).
- Three _different_ job types ⇒ not a directory-sync fault. **Nothing is being claimed at all.**
- `entities: 103` vs `embeddings: 84` — a 19-item backlog consistent with embedding jobs never
  draining.
- The server had already been upgraded and restarted, and was still stuck. **A restart is not a
  sufficient fix**: it may recover a specific process, but the system can still return to a green-web
  / dead-worker state without escalation.

From the earlier 66h incident, the same signature: `lastSync` frozen at ≈boot for the whole uptime,
which is exactly what a `directory-sync:sync-request` job that never runs looks like.

## Confirmed evidence: deploy green while operate degraded (rover-pilot, 2026-08-11)

During the alpha.279 rollout to `jo`, `docs.rizom.ai`, and `rizom.ai`, CI reported a successful
deploy because Kamal's rollout probe hit `/health/ready`. Post-deploy operator verification exposed
that two site brains were not operational:

- `jo.rizom.ai`: `/health/ready` and `/health/operate` were both operational.
- `docs.rizom.ai`: `/health/ready` returned 200, but `/health/operate` returned 503 with
  `projection-waves: Projection wave ts7qfMuh8SIF has 1 stranded rule job(s)` and details showing a
  terminal failed `shell:projection-rule` job.
- `rizom.ai`: `/health/ready` returned 200, but `/health/operate` returned 503 with
  `job-worker: No live worker session`.

Manual redeploys of `docs` and `rizom-ai` cleared the degraded state. That recovery does not make the
bug harmless: the first deploy still went green while the operator-visible background system was
broken, and only out-of-band checks caught it.

## Confirmed invariant violation: worker supervision can park

Only two code paths ever start a job worker, and a `web`-role process is not one of them:

- `shell/core/src/initialization/shellBootloader.ts:184` — `processRole === "worker"` starts it.
- `shell/core/src/initialization/shellBootloader.ts:270` — `if (this.processRole !== "web")` starts
  it.
- `JobQueueWorker` is constructed with `autoStart: false` (`shell/job-queue/src/effect.ts:147`), so
  nothing else can start it implicitly.

The supervisor spawns the web child unconditionally but gates the worker sibling
(`packages/brain-cli/src/lib/process-supervisor.ts`):

```
spawnChild("web")                                    // :438 — unconditional
scheduleWorker()                                     // :259
  ├─ returns early unless web?.ready                 // :264 — set by the web child's IPC "runtime-ready" (:380)
  └─ workerAttempts >= workerRestartBudget           // :280
       → reportIncident("worker-supervision-paused") // :283
       → setTimeout(retryAt - now)                   // :288 — parks for the rest of the window
```

Defaults (`:454`–`:458`): `workerRestartBudget: 3`, `workerRestartWindowMs: 3_600_000` (one hour),
`workerRestartBaseMs: 1_000`, `startupTimeoutMs: 30_000`.

A web child that never sends `runtime-ready` is **not** a silent path: the startup timer SIGKILLs it
after 30s (`:409`–`:417`) and the parent exits "missed its runtime-ready deadline" (`:88`). The
confirmed reachable silent state is the other branch: web boots fine, the **worker child dies
repeatedly** — crash at spawn, or hang (three missed heartbeats trigger
`worker-heartbeat-timeout` and a restart, `:223`, which also burns an attempt). Three attempts inside
the hour window park supervision until the oldest attempt ages out; each subsequent failure can
re-park it. Steady state can become one futile worker attempt roughly per hour while the web child
serves normally. The original worker failure may be transient or deterministic; child stderr is
inherited by the parent and should be present in retained container logs.

Visibility and enforcement are incomplete:

- `reportIncident` defaults to `console.error(JSON.stringify(incident))` (`:461`–`:464`) — one
  stderr line, no state change, and no effect on the parent exit status.
- `/health/operate` already derives durable worker-session and projection-wave checks and correctly
  returned 503 in the observed incidents.
- `system_status` reports model/version/uptime/entity counts and **nothing about worker health**.
- Kamal and generated status views use `/health/ready`, so they do not enforce operational health.
- `JobQueueWorker.markUnhealthy` (`shell/job-queue/src/job-queue-worker.ts:609`) is a one-way latch
  (`if (!this.stats.isHealthy) return`) that sets `shouldStop = true`; only `startWorker()` clears
  it. Its `onUnhealthy` defaults to a no-op (`:131`).

The last point is worth stating plainly: the job-queue README promises "the shell runtime treats
this state as fatal: it records the reason and exits so the container restart policy can replace the
process", and `createFatalJobWorkerHandler`
(`shell/core/src/initialization/job-services.ts:58`) does implement that. **The supervisor's own
pause path silently violates that contract** — it keeps the process alive with no worker.

## Scope separation (do not re-investigate here)

The directory-sync investigation remains valid in its own plan, but it cannot explain the later
multi-job no-claim signature by itself:

1. Directory-sync Git serialization is implemented by `SerialQueue`
   (`shared/utils/src/serial-queue.ts`) through `GitSync.withLock`
   (`plugins/directory-sync/src/lib/git-sync.ts:52`). A locally reproduced unresolved Bun Git
   completion can hold that serialization turn indefinitely; track the runtime pin, durable replay,
   and external stale-pull signal in
   [`directory-sync-export-stall.md`](./directory-sync-export-stall.md).
2. During the worker incident, `directory_sync action:"sync"` returned `gitPulled: true` twice while
   `directory-sync:sync-request`, `shell:projection-rule`, and `shell:embedding` all remained
   unclaimed. A directory-local serialization stall cannot prevent unrelated projection and
   embedding jobs from being claimed. The worker-wide outage therefore requires this plan even if a
   Git stall occurred earlier.
3. `setupGitAutoCommit` does not consult `activeRun` or `operationStatus` before committing, and the
   debounce subscriptions re-arm after failures. Do not fold those already-traced paths into worker
   supervision.

Also ruled out for the no-worker incident: the bundle-split boot fix was already shipped
(alpha.278; the server ran 279).

## Phases

Thin vertical slices — each ships one capability end to end with its tests.

### Phase 1 — Expose durable background-work status (walking skeleton)

Add one compact `backgroundWork` field to `RuntimeAppInfo` / `system_status`, derived in the web
process from `JobQueueService.getDiagnostics()` — the same durable source used by
`/health/operate`. Extend those diagnostics with the due-work fields below, then include:

- worker state (`active`, `missing`, or `stale`), active/stale session counts, and latest heartbeat
  age;
- due-pending and processing totals, oldest due-pending age, and latest claim age; and
- a compact healthy/degraded summary using the same interpretation as runtime operational health.

Extract/reuse a pure durable-diagnostics summary helper so `system_status` and runtime health cannot
drift into different worker or queue interpretations. Persist each session's expiry alongside its
heartbeat so diagnostics and attempt fencing honor that worker's configured timeout rather than a
reader-side default. Do **not** wire `JobQueueWorkerStats` into the web process. Those stats and the internal
`markUnhealthy` reason live in the separate worker child and are unavailable after it exits. The
durable status can truthfully report reasons such as `No live worker session`, not an unavailable
in-memory crash reason.

Tests: `system_status` reports active durable sessions, reports `missing` when no live session exists,
reports stale sessions, and includes due queue age without exposing job payloads. Runtime app-info and
status schemas reject malformed background-work data.

Rationale: this turns a long silent outage into a direct status query while keeping
`/health/operate` as the canonical operational-health calculation.

### Phase 2 — Make supervision escalate instead of park

When the worker restart budget is exhausted, do not sit for the remainder of the window with a live
web child. Report a final structured incident, request coordinated child shutdown, and resolve the
supervisor as failed so `brain start` exits non-zero and the container restart policy replaces the
process. Do not call `process.exit()` before child cleanup. Keep bounded exponential backoff for
failures below the budget.

`worker-ready` continues to reset consecutive-failure backoff, but it must not erase the rolling
attempt history immediately: a worker that reaches ready and then crash-loops still needs to exhaust
the budget. Attempts age out naturally after `workerRestartWindowMs`.

Tests: budget exhaustion returns a failed supervisor result rather than scheduling the one-hour retry
timer; both children are shut down and reaped; failures below budget still back off and recover;
`worker-ready` resets backoff but not the rolling budget; shutdown during backoff remains clean.

### Phase 3 — Detect genuinely unclaimed due work

Use Phase 1's durable `duePending`, `oldestDuePendingAgeMs`, and `latestClaimAgeMs` diagnostics. A
due job is `pending` with `scheduledFor <= now`; age starts at `scheduledFor`, not `createdAt`.
Future-scheduled work must not count as unclaimed.

Add a stable `job-queue-progress` operational-health check. It becomes degraded when due work has
waited at least two minutes, no job is currently processing, and no claim occurred within that same
window. The existing `job-worker` check continues to report a missing live worker immediately. This
separates a stopped pipeline from legitimate pending work behind an active long-running job and from
scheduled work that is not eligible yet.

Expose the same signal in Phase 1's status summary. Do not emit a new log incident on every health
probe; the durable health check is idempotent and external monitoring/deploy owns notification
deduplication.

Tests: old due work with no recent claim degrades health; future-scheduled work does not; active
processing and a recent claim suppress false alarms; claiming or draining the work clears the check;
repository diagnostics calculate eligibility age from `scheduledFor`.

### Phase 4 — Persist terminal projection failure instead of inventing retries

The projection scheduler already detects a failed rule or a queued rule whose job is terminal, fails
the active wave, requeues its inputs, and can replay them on a later scheduler activation. The job
queue's existing `maxRetries` policy is the bounded recovery path for retryable rule failures.
`ProjectionRuleJobHandler.onTerminalError()` currently only calls `failActiveWave()`, while runtime
health only reports stranded rules on an active wave.

Treat a terminal job as retry-exhausted: do **not** recursively enqueue replacement waves from the
terminal callback. Instead, make terminal reconciliation persist a structured projection incident
in the projection store containing the wave id, rule id, terminal job id, and sanitized failure
reason while atomically failing the wave and preserving its inputs for the existing later-activation
replay path. Record the requeued input high-water generation on the incident; completing a later wave
resolves only incidents whose recovery generation its cutoff covers, without relying on process
clocks. Do not keep the incident only in job or process memory. Runtime health reports the unresolved
incident count even when there is no active wave, while bounding serialized incident details to the
10 most recent records.

Both the direct terminal callback and scheduler reconciliation of a stranded queued rule must call
the same idempotent persistence path. This closes the loudness gap without creating an unbounded
wave-replacement loop.

Tests: both terminal-callback and stranded-rule reconciliation persist one incident; repeated
reconciliation is idempotent; no immediate replacement wave is enqueued; restart/later activation
can replay the preserved inputs; clock skew does not prevent a successful covering wave from
resolving it; incident detail output remains bounded; and `/health/operate` returns
operational.

### Phase 5 — Deploy verifies operational health, not just readiness

Keep Kamal's zero-downtime rollout probe on `/health/ready` so web serving can cut over without
waiting for long background drains. After rollout, generated deploy workflows must invoke the
existing `brains-ops verify-user` path, which already checks `/health/operate`, with a bounded retry
for transient startup convergence. Put the retry policy in the `brains-ops` verification helper
rather than duplicating polling shell in generated workflows. A persistent 503 fails the job and
logs the exact degraded check names and safe details; it must not trigger an unbounded redeploy loop.

Generated observed-status views must probe both endpoints: keep `serverStatus` tied to
`/health/ready`, but derive `deployStatus` from `/health/operate` rather than copying readiness. A
handle may therefore be server-ready while its deployment is failed/degraded; the operator-facing
deploy state must not be `ready` until operational health passes.

Tests: a simulated `/health/ready=200` and `/health/operate=503` fails after the bounded verification
window; a transient operational degradation that recovers passes; logs include degraded check names
and details; observed status reports `serverStatus: ready` but does not report `deployStatus: ready`
while operational health is degraded.

## Separate incident thread

The 66-hour incident also showed missing DB→Git `Auto-sync` commits. Directory export runs inline
from entity-event subscribers rather than through the job worker, so a dead worker does not fully
explain that symptom. The confirmed Git-completion stall class, remaining production attribution,
runtime pin, durable replay, and Git-specific watchdog work live in
[`directory-sync-export-stall.md`](./directory-sync-export-stall.md). Do not fold them into the
phases above or claim that solving worker supervision closes the export incident.

## Related latent gap (found while tracing; not this incident)

`BRAIN_JOB_WORKER_SLOT_ID` is never set anywhere in the repo, so every process falls back to slot
`"default"` (`shell/job-queue/src/job-queue-worker.ts:121`). Two concurrent workers would supersede
each other into a permanent unhealthy latch. Not today's cause — nothing is claiming at all — but
it is a landmine the moment a second worker runs.

## Release ordering

Land and release this plan against the current local persistence architecture **before**
`work/turso-migration`. Do not pull the unreleased web-owner/RPC topology into this fix. After this
release, the Turso branch must rebase onto it and carry the new queue diagnostics and projection
incident contracts through its job-queue/projection RPC schemas and remote stores while preserving
the fatal supervisor behavior. That downstream port is part of the Turso integration, not a reason
to delay this incident fix.

## Constraints

- Recovery for a currently-wedged worker is `brain start --child=worker` (role parsed at
  `packages/brain-cli/src/lib/process-supervisor.ts:64`), which starts a worker directly and
  bypasses paused supervision. It is also a diagnostic: if it crashes, its inherited stderr should
  reproduce the failure already expected in container logs. A redeploy/restart can be a safe live
  workaround, but it must not be treated as the product fix unless operational health proves the
  worker and projection waves recovered.
- Do not "fix" this by making the worker start in the `web` role — the role split is deliberate.
  Fix the supervision and the silence.
- Preserve bounded backoff for genuinely transient worker crashes; the defect is indefinite silent
  parking, not backoff itself.
- Preserve the distinction between readiness and operational health: `/health/ready` remains the
  traffic-cutover probe, while status, post-deploy verification, and operator automation must enforce
  `/health/operate`.
- Keep cross-process health durable. Do not add parent/child in-memory coupling solely to populate
  `system_status`, and do not expose job payloads or raw exception data in operator summaries.
