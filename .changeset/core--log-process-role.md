---
"@rizom/brain": patch
---

Every line a supervised child process logs now names that process. Text lines start with `[web]`, `[worker]` or `[git-broker]`, and JSON lines (the `logFile` output) carry a `role` field, so an error from one process can no longer be read as coming from another. Lines from the supervisor itself, and from a brain started in a single process (chat, startup checks, development), stay unlabeled.
