---
"@rizom/brain": patch
---

A brain's startup sync no longer imports its content repo before the web process reports ready. It pulls and queues every file as import jobs for the worker, so boot time no longer depends on content size and an interrupted import resumes from the job queue. Identity, profile and prompt defaults, onboarding playbooks and the starter identity are created once that import completes or fails, never before the repo's own versions; the worker creates no defaults and follows the identity its imports bring. Chat stays behind the knowledge-base readiness gate until the startup import is in and indexed.
