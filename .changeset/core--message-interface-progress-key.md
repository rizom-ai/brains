---
"@rizom/brain": patch
---

An author-defined message interface now edits its reply when a job that reply started makes progress or finishes. Before, its progress and completion events never reached it: the interface listened under its plugin id, while the job recorded only the channel type. A turn now records which installed interface it came through, and its jobs and tool events are routed back to that interface, so two installed interfaces with the same channel type no longer pick up each other's jobs. Built-in interfaces behave as before.
