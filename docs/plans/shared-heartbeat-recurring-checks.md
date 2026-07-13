# Plan: Shared recurring checks and heartbeat

## Status

Proposed P2 dependency. Do not implement as part of the current Business Development
slice. Opportunity stale alerts exposed the need, but scheduling, dedupe, and delivery are
shared infrastructure.

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

## Proposed boundary

- A shared shell-owned scheduler package owns generic scheduler backend contracts and
  deterministic test implementations.
- A recurring-check service owns cadence, invocation, dedupe, and delivery adaptation.
- Domain plugins own the query/rule that decides what is noteworthy and the alert payload.
- Checks can run on demand for tests and operator previews.

For Business Development, the domain package owns “Warm opportunity has no action for 14
days.” The shared layer owns weekly execution, dedupe, retries, and notification dispatch.

## Delivery order

1. Extract generic scheduler backend contracts from content-pipeline without moving its
   domain-specific scheduler.
2. Add deterministic contract tests for cadence, injected time, dedupe, reset, and failed
   delivery.
3. Implement one recurring-check registration path using shell daemon lifecycle and
   `runtimeState`.
4. Route alerts through a narrow notifications adapter.
5. Adopt it in Business Development as the first consumer.
6. Decide whether generic alert/dashboard surfaces are justified only after a second
   consumer appears.

## Decisions still required

- Shell service versus first-party service plugin ownership.
- Calendar-aligned daily/weekly cadence versus generic cron in the public contract.
- Whether failed delivery consumes or preserves the dedupe key.
- Whether v1 dedupe scope is per brain or includes user/space identity.

## Verification

- Tests advance an injected clock; none sleep on wall time.
- Repeated checks do not duplicate an alert inside the dedupe window.
- A changed/reset domain condition permits a later alert.
- Failed checks and failed delivery follow explicit retry semantics.
- Daemons start only after plugin ready hooks and stop cleanly.
- Content-pipeline remains green against the extracted scheduler backend.

## Non-goals

- A Business Development-only daemon.
- Durable content or secrets in heartbeat state.
- A new dashboard framework.
- Building this before P0 release work or the P1 identity/model/consolidation lanes.
