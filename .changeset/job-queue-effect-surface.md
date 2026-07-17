---
"@brains/core": patch
"@brains/job-queue": patch
---

Move the internal job-service tags and scoped Layers into an `@brains/job-queue/effect` surface so shell packages can compose queue and runtime ownership across package boundaries without exposing Effect through public runtime APIs.
