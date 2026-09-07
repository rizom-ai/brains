---
"@brains/plugins": minor
"@brains/sdk": minor
---

A declared job can ask to be told once the queue has settled it. `defineJob(...).handle(run, { settled })` takes a second hook that runs once, after the queue has durably recorded the terminal state — after retries, which is why it is not folded into the run: a throwing run may run again, and a child of a bulk mutation is accounted for exactly once, when the queue has given up or succeeded. The hook receives the input the job ran with, the job id, the outcome, and the failure when there was one.

Named consumer: @brains/directory-sync, whose import, export, delete and cleanup jobs settle the durable bulk-mutation child they ran as.
