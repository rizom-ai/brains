---
"@brains/plugins": minor
"@brains/sdk": minor
---

Add declarative create routing to the entity surface. An entity declares `create` keyed by the shape of the create input — `fromPrompt`, `fromUpload`, `fromContent` — and each route either delegates to a declared job or rejects with a message. An unlisted shape proceeds to ordinary creation.

This is deliberately data rather than a callback. The internal `interceptCreate` hook hands a package the create path and reports whatever outcome it returns, so a package could claim it created something it did not. With routing, the runtime enqueues the job and builds the result itself, so the reported outcome describes what actually happened.
