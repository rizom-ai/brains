# Plan: Operational alerts reach a human

## Status

**Not started.** Opened 2026-08-13, directly after the background-work recovery foundation shipped in
`@rizom/brain@0.2.0-alpha.284`. That work made background-work failure _observable_ — durable
diagnostics, `job-worker` and `job-queue-progress` checks, `/health/operate` enforcement in deploy.
It deliberately stopped short of notification, stating that "external monitoring/deploy owns
notification deduplication."

There is no external monitoring. A degraded brain today is discoverable only by someone choosing to
poll `/health/operate` or call `system_status`. The 66-hour incident was found by a human noticing
stale content, not by a signal. This plan closes that last hop: **a degraded brain tells someone.**

Opened in place of adopting Sentry. The signals this plan needs are already collected and durable;
what is missing is delivery, and the alternative would ship brain content — entity bodies, prompts,
inbox mail — to a third-party SaaS by default. See [Rejected alternative](#rejected-alternative).

## Goal

Make sustained operational degradation produce a delivered notification to the operator, deduplicated
per condition episode, resolving when the condition clears — and do it over a path that **survives
the failure it reports**.

## The load-bearing constraint

The obvious implementation is wrong, and it is worth stating why before the phases.

`@brains/recurring-checks` looks like the natural home: it already has cadence scheduling, alert
episodes with `dedupeKey`, a `pending → delivered → resolved` lifecycle persisted in runtime state,
and wired delivery. But its execution path routes through the job queue:

```
RecurringCheckService.schedule()                       shell/recurring-checks/src/recurring-check-service.ts:411
  └─ scheduler.scheduleCron(...)                       :418  — runs in web (daemon gated processRole !== "worker", service-factory.ts:182)
       └─ this.enqueue(check.id)                       :422  — enqueues job "shell:recurring-check"
            └─ claimed and executed by the worker child
```

**A check that reports "the worker is dead" cannot itself require the worker to run.** In the
confirmed rizom.ai signature — web green, three job types unclaimed, nothing being claimed at all —
a recurring check registered for worker health would have sat `pending` alongside the jobs it was
meant to report on. Cadence granularity (`daily | weekly`, `:633`) is a secondary problem; the job
dependency is the disqualifying one.

What _does_ survive: the delivery path is entirely in-process and job-free.

```
createRecurringCheckDelivery(messageBus)               shell/core/src/initialization/recurring-check-delivery.ts:13
  └─ messageBus.send(NOTIFICATIONS_SEND)               :20   — in-process bus, no job
       └─ NotificationsPlugin handler                  plugins/notifications/src/index.ts:56
            └─ context.channels.getDeliveryProvider(recipient.type)   :68
                 └─ await provider.send({...})         :76   — awaited directly, no job
```

Plugin registration is **not** gated by `processRole` — `shellBootloader` gates capability
registration and worker startup (`:172`, `:181`, `:270`), not which plugins load — so the
notifications plugin and its delivery provider are present in the web process. A web-resident
watchdog can therefore deliver an alert while the worker child is dead. This is the whole design.

The signal side is equally worker-free: `/health/operate` is computed in the web process from
`JobQueueService.getDiagnostics()` via `summarizeBackgroundWork()`, and the
`OperationalHealthRegistry` (`shell/core/src/shell.ts:698`) already holds every check
(`runtime-health.ts:137` `job-worker`, `:174` `job-queue-progress`, plus lease and projection
incidents).

So: **read health in web, deliver in web, never touch the job queue.**

## Decisions

Settled up front so the phases do not re-litigate them.

1. **The watchdog is a web-process daemon on a timer, not a recurring check.** Registered on
   `daemonRegistry` alongside `shell:recurring-checks` and gated the same way
   (`processRole !== "worker"`). Rationale above.
2. **Evaluate every 60s; alert after a condition stays degraded for 5 consecutive minutes; send a
   resolve notice after 5 continuously healthy minutes.** `job-queue-progress` already requires two
   minutes of unclaimed due work before it degrades (`runtime-health.ts:174`), so this yields a page
   roughly seven minutes into a real outage while staying well clear of rollout restarts. No
   deploy-aware suppression window — a suppression mechanism can itself get stuck on, which is the
   exact class of bug this plan exists to fix.
3. **`dedupeKey` is `checkName + condition`, never the message.** Check messages interpolate counts
   (`` `${sessions.stale} stale worker session(s)` ``), so keying on the message would re-alert on
   every count change.
4. **An unresolved episode re-notifies at most once per 24h.** Never re-notifying lets a forgotten
   outage go quiet; re-notifying per tick is a pager flood.
5. **Extract the alert-episode lifecycle into `@brains/alert-episodes`, consumed by both the
   watchdog and `@brains/recurring-checks`.** The two need identical semantics —
   `dedupeKey`, `pending | suppressed | delivered | resolved`, runtime-state persistence, delivery
   retry (`recurring-check-service.ts:50-82`). That is well past the point where duplicating the
   state machine is defensible, and core must not import the recurring-checks package just to reach
   it, since that package's identity is job-executed checks. Extract at the second consumer, not the
   third.
6. **Alert bodies carry check name, status, message, and the already-whitelisted safe `details`
   (session and queue counts) only.** Never job payloads, entity content, or raw exception data —
   the same constraint `/health/operate` already honors.
7. **Delivery failure must never crash the web process.** A failed send leaves the episode `pending`
   for the next tick with bounded backoff; the lifecycle already models this state.
8. **Client error capture is restricted to authenticated operator surfaces** (dashboard, CMS), never
   public site pages — an unauthenticated error-report route is a write amplifier pointed at your
   own database.

## Phases

Thin vertical slices — each ships one capability end to end with its tests. Tests are written first.

### Phase 1 — A dead worker sends an email (walking skeleton)

The narrowest end-to-end path: one condition, one alert, delivered.

Add `shell/core/src/operational-alert-watchdog.ts`, registered on the daemon registry when
`processRole !== "worker"`. Each tick it reads the operational health registry, and for the
`job-worker` check only, tracks how long the condition has been degraded. On crossing the sustain
threshold it persists an episode in a runtime-state scope (`IRuntimeStateNamespace.scoped`,
`shell/runtime-state/src/types.ts:38`) and delivers through the same `NOTIFICATIONS_SEND` message-bus
path the recurring-check delivery uses. No resolve notices, no re-notify, no other checks yet.

Tests first: a sustained `job-worker: missing` delivers exactly one notification; a degradation
shorter than the sustain window delivers none; a second tick with the episode already `delivered`
delivers none; the delivered payload contains the check name and safe details and contains no job
payload; a throwing delivery leaves the episode `pending` and does not reject the daemon tick; the
daemon is not registered in the worker role.

Rationale: proves the worker-independent delivery spine on the exact condition that motivated the
plan, before any breadth or refactoring.

### Phase 2 — Episodes resolve, re-notify, and share one lifecycle

Add resolve notices and the 24h re-notify, and — because that makes the watchdog's lifecycle
semantically identical to the recurring-check one — extract `@brains/alert-episodes` and move both
consumers onto it. The extraction lands here rather than in Phase 1 because this is the phase where
the second consumer's behavior must actually match.

The new package owns: the episode record schema, the `pending | suppressed | delivered | resolved`
transitions, runtime-state persistence keyed by `dedupeKey`, delivery retry with bounded backoff,
and the re-notify clock. `RecurringCheckService` keeps its cadence, catch-up, and inbox projection;
it loses its private copy of the state machine.

Tests first: a cleared condition delivers exactly one resolve notice and no further alerts; an
episode still degraded past 24h re-notifies once, not per tick; a condition that flaps within the
sustain window produces one episode, not several; recurring-check alert behavior is unchanged across
the extraction (its existing suite must pass untouched); episode state survives a restart mid-episode
without re-alerting.

### Phase 3 — Every operational check, not just the worker

Generalize from the hardcoded `job-worker` to the full `OperationalHealthRegistry`, so
`job-queue-progress`, the lease check, projection incidents, and any plugin-registered check
(`IOperationalHealthNamespace`, `shell/plugins/src/base/context.ts:134`) all alert with no
per-check wiring. Group concurrently-degraded checks into a single notification rather than sending
one per check, so a full outage pages once.

Tests first: two checks degrading in the same tick deliver one grouped notification with both named;
a plugin-registered check alerts without core changes; checks resolving at different times resolve
independently within the grouped episode; a check that degrades while another is already alerting
does not restart the first episode's re-notify clock.

### Phase 4 — Client errors become a signal (new source, same spine)

Today the operator UIs are fully dark: there is no `ErrorBoundary`, `componentDidCatch`,
`window.onerror`, or `unhandledrejection` handler anywhere in `plugins/` or `shared/` — the only
match in the tree is a WebSocket error listener in `plugins/atproto/src/jetstream-consumer.ts`. A
crash in the dashboard or CMS produces no log line, no job record, and no health signal.

Add an error boundary plus global `error`/`unhandledrejection` handlers to the dashboard and CMS
surfaces, reporting to an authenticated brain route that stores a bounded ring of the most recent 50
records in runtime state (message, stack, surface, release version — no form values, no page
content). Register a `client-errors` operational health check that degrades on a burst, at which
point Phase 3's spine delivers it with no new delivery code.

Tests first: a boundary-caught render error posts exactly one record; the route rejects
unauthenticated posts; oversized payloads and stacks are truncated rather than rejected silently;
the ring evicts oldest beyond 50; a burst degrades the health check and a quiet period clears it;
reported records never contain form input values.

Rationale: this is the one blind spot Sentry would genuinely have filled. Landing it on the spine
built in Phases 1–3 fills it without the vendor or the data egress.

## Rejected alternative

Adopting Sentry, considered 2026-08-13. Rejected on three grounds:

- **Data egress.** Errors here routinely carry the payload — an entity validation error dumps the
  entity body, an AI service error carries prompt content, an inbox error carries mail. Sentry's
  scrubbing is opt-out shaped. For an AGPL, self-hostable product this is a product decision, not an
  ops one.
- **Wrong value curve.** Sentry earns its keep across a fleet with users you cannot talk to,
  answering "how many hit this, since which release." Under the single-brain model that question is
  not being asked.
- **Duplicates existing state.** The failure surface here is async jobs and background work, already
  persisted durably with retry counts, terminal-failure incidents, and health checks. Sentry would be
  a parallel, weaker view of data the system already owns.

Revisit if rizom.ai becomes multi-tenant with users the operator does not speak to directly. Phases
1–3 leave the seam in the right place: swapping or adding a delivery backend behind
`@brains/alert-episodes` would not touch any check.

## Constraints

- **Never route operational alerting through the job queue.** Any future alert source must reach
  delivery without a `shell:*` job, or it cannot report the failure class that motivated this plan.
- Do not fold alerting into `/health/operate` itself. Health computation stays idempotent and
  side-effect-free; the watchdog is the only thing that decides to notify.
- Preserve the readiness/operational-health split. The watchdog reads operational health; it must not
  make `/health/ready` fail.
- Alert payloads are operational state and must not contain secrets, job payloads, or entity content
  — matching the existing `RecurringAlert` contract note in
  `shell/recurring-checks/src/types.ts`.
- The watchdog must degrade quietly when no delivery channel is registered: no recipient configured
  is a normal single-user local state, not an error to log every 60 seconds.
