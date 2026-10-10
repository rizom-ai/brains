---
"@brains/topics": patch
"@brains/plugins": patch
"@brains/core": patch
"@brains/entity-service": patch
---

Replace full-corpus topic projection waves with bounded, resumable per-source voting jobs and role-weighted topic selection. Stronger challengers can replace weak topics at the cap once every source has been read, while unchanged sources avoid AI calls. A failing source is retried alone and abstains after repeated failures instead of blocking extraction. Forward job cancellation through template generation, heal stale votes on settled startup, and release retired topic projection ownership without deleting existing content.
