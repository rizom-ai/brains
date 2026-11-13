---
"@rizom/brain": patch
---

Every line a supervised child process writes now names that process: its log lines, its startup failures and its crash reports. Text lines start with `[web]`, `[worker]` or `[git-broker]`, and JSON lines (the `logFile` output) carry a `role` field, so an error from one process can no longer be read as coming from another. Lines from the supervisor itself, and from a brain started in a single process (chat, startup checks, development), stay unlabeled.
