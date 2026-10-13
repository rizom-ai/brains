---
"@brains/scheduler": patch
"@rizom/brain": patch
---

A native cron-stop failure no longer bypasses admitted callback draining or scheduler scope finalizers. Scheduled jobs prevent further callback admission and finish cleanup before reporting failures, preserving a single failure's identity and aggregating multiple failures in cleanup order.
