# Plan: Shared recurring checks and heartbeat

## Status

Active — pulled forward from proposed-P2 on 2026-07-14. The original sequencing ("do not
build before the P0/P1 lanes") assumed no consumer needed this urgently. That premise no
longer holds: agent discovery's directory scan (`agent_scan_directories`) shipped
manual-only with the agent-sightings work and is deployed across the fleet, and
second-order discovery only delivers its promise — the map showing the operator something
they don't already know — if scanning recurs without an operator asking. Peers' directories
change when _they_ approve agents, which is invisible locally by definition; no local event
can trigger it. The scan is a live first consumer that exercises the full path
(schedule → run → dedupe → notify). Business Development adoption follows when the BD
slice merges.

## Goal

Let plugins register lightweight recurring checks that run on a deterministic cadence,
dedupe alerts through `runtimeState`, and route delivery through notifications without
starting plugin-owned timers or inventing one-off schedulers.

## Existing primitives to reuse

- `plugins/content-pipeline` already has injectable cron/interval scheduler backends.
- Shell daemon registration already owns process lifecycle and startup ordering.
- `shell/job-queue` supports delayed one-shot work and retries.
- `shell/runtime-state` is the disposable, namespaced home for alert dedupe.
- `plugins/notifications` owns notification delivery.

Extract or reuse these pieces. Do not add a parallel scheduling stack.

## Boundary

- A shared shell-owned scheduler package owns generic scheduler backend contracts and
  deterministic test implementations.
- A recurring-check service owns cadence, invocation, dedupe, and delivery adaptation.
- Domain plugins own the query/rule that decides what is noteworthy and the alert payload.
- Checks can run on demand for tests and operator previews.

## Settled decisions

Previously listed as open; settled with the pull-forward:

- **Shell-owned service, not a service plugin.** Every brain needs it, and a domain plugin
  registering a check must not depend on a sibling plugin happening to be bundled.
- **Calendar-aligned daily/weekly cadence in the public contract.** Cron expressions stay
  an internal backend detail; consumers declare intent, not schedule syntax.
- **Dedupe scope v1 is per brain.** Widening to user/space identity waits for the
  auth-runtime-db identity boundary (P1) — identity-scoped dedupe built before that lands
  would be rework on sand. This is the one genuine P1 dependency; it gates the dedupe
  _scope_, not the layer.
- **UTC with deterministic fleet staggering.** Each brain/check pair gets a stable offset
  inside its daily or weekly UTC window, avoiding a fleet-wide traffic spike while keeping
  tests and operations predictable.
- **One startup catch-up, no overlap.** A brain runs at most one missed occurrence after
  plugins are ready. If the previous run is still active, the next occurrence is skipped.
- **Cancellation crosses as `AbortSignal`.** Stopping the recurring-check daemon aborts
  active domain checks, including in-flight directory and Agent Card requests, while the
  durable job remains eligible for retry.
- **The notifications plugin owns the default recipient.** Recurring alerts omit an explicit
  recipient and use the same configured email address as onboarding mail. Generated Rover
  and fleet configuration pass that address to both plugins.
- **Condition-episode dedupe.** Domain checks supply a key that remains stable while the
  condition is unchanged and changes when a new episode begins. Successful delivery marks
  that key delivered per brain; there is no arbitrary expiry window.
- **Failed delivery remains pending.** An alert that never reached anyone is not marked
  delivered. Its non-secret operational payload remains pending so a retry does not lose an
  alert from an idempotent domain mutation.
- **Bounded job-queue retries.** Scheduled and catch-up checks use the shared job queue with
  its existing exponential backoff and three-retry limit.

## Slices

### Slice 1 — scheduler contracts

**Implemented on `work/shared-heartbeat`.** Extract generic scheduler backend contracts
from content-pipeline (its domain-specific scheduler stays where it is). Deterministic
contract tests: cadence, injected time, reset, failure. No test sleeps on wall time.

### Slice 2 — recurring-check service + first consumer

**Implemented on `work/shared-heartbeat`; fleet verification remains.** One registration path riding shell daemon lifecycle. Checks runnable on demand. Agent
discovery registers the directory scan on a daily cadence — the scan tool's
aggregation/merge logic is already idempotent, so the check is a thin wrapper.

### Slice 3 — dedupe + notify

**Implemented on `work/shared-heartbeat`; fleet verification remains.** `runtimeState` dedupe and a narrow notifications adapter. The scan notifies when
`created > 0` ("N agents sighted through <peers>") and stays silent on no-op re-scans —
dedupe verified by the repeat-scan case.

### Slice 4 — Business Development adoption

When the BD capture/ranking/focus slice merges: the domain package owns "warm opportunity
has no action for 14 days," the shared layer owns weekly execution, dedupe, retries, and
dispatch. Not before — the consumer does not exist yet.

Deferred, unchanged: whether generic alert/dashboard surfaces are justified is decided
after both consumers run in production.

## Verification

- Tests advance a shared Effect `TestClock`; scheduler and service state use the same time
  source, and none sleep on wall time.
- Repeated checks do not duplicate an unchanged condition episode.
- A changed/reset domain condition permits a later alert.
- Failed checks and failed delivery follow explicit retry semantics.
- Daemons start only after plugin ready hooks; stopping aborts active remote checks cleanly.
- Content-pipeline remains green against the extracted scheduler backend.
- A fleet brain runs the daily scan unattended; a re-scan that creates nothing produces
  no repeat notification.

## Non-goals

- A Business Development-only daemon.
- Durable content or secrets in heartbeat state.
- A new dashboard framework.
- Identity/space-scoped dedupe before the runtime identity boundary lands.
