---
"@rizom/brain": patch
---

Replace Croner with Bun's in-process cron scheduler and rename `CronerBackend` to `BunSchedulerBackend`. Content pipeline schedules now use standard five-field cron expressions; six-field expressions with seconds are rejected with a migration error.
