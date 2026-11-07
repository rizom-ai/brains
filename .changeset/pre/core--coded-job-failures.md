---
"@brains/content-service": patch
"@brains/job-queue": patch
"@brains/plugins": patch
"@brains/sdk": patch
"@rizom/brain": patch
---

A durable job's failure is recorded in its public form, the `SdkError` data `{ code, message }`, beside the diagnostic message, in a new `lastErrorPublic` column. `jobs.status()` on a service job reports that `code` and, as `error`, its public message: an `SdkError`'s `publicMessage` when it was given one, else the code's standard message, never the message a failure was thrown with, so a status reader never sees what a handler meant only for operators. A failure recorded without a valid public form reads as `handler_failed`. A thrown `SdkError` keeps its code, any other error is `handler_failed`, an answer outside the job's output schema is `invalid_response`, a requester whose account is gone is `permission_denied`, a job no package handles is `no_handler`, a superseded one `cancelled`, and an expired attempt `deadline_exceeded`.
