# @brains/scheduler

Shared production and deterministic-test scheduling backends.

## Runtime contract

`BunSchedulerBackend` runs cron jobs in process through `Bun.cron`. Cron
expressions use the standard five-field form:

```text
minute hour day-of-month month day-of-week
```

Six-field expressions with seconds are unsupported and fail validation. Jobs
may select an IANA timezone. Each scheduled job runs at most one callback at a
time, reports skipped overlaps and callback errors through backend hooks, and
prevents future cycles while draining active work when `stop()` is called.

Fixed-interval jobs use the same supervised callback lifecycle and can receive
an Effect clock.

## Deterministic tests

Import `TestSchedulerBackend` from `@brains/scheduler/test`. It evaluates cron
cadence with `Bun.cron.parse` while exposing explicit time advancement and
manual tick helpers, so package tests do not wait for wall-clock schedules.
