---
"@brains/utils": patch
"@brains/contracts": patch
"@brains/build-tools": patch
"@brains/ai-evaluation": patch
"@brains/entity-service": patch
"@brains/job-queue": patch
"@brains/atproto": patch
"@brains/topics": patch
---

Give every unbounded loop an explicit shape. Schema unwrapping, workspace version resolution, redirect following, job-drain polling, SQLite write retries and atomic enqueue retries now recurse once per step, so each step's exit condition sits in its own signature. Stream reading and checkpoint draining keep a loop, but one with a real condition in its head rather than an open `for (;;)` and an interior break.

Behaviour is unchanged: the same retry budgets, backoff, redirect limits and cursor advancement apply. The atomic enqueue retry now closes its failed transaction before opening the next one rather than after, which was already the intent.
