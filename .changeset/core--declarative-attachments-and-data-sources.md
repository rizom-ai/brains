---
"@brains/plugins": minor
"@brains/sdk": minor
"@brains/media-page-composer": patch
---

Add two more declarative entity capabilities: `attachments`, where the runtime owns provider registration and teardown, and `defineDataSource`, a general data source that receives a narrow entity reader instead of the entity service so it can span entity types.

`MediaAttachmentContext` in `@brains/media-page-composer` is now a structural interface naming the four members providers use, rather than a `Pick` of the runtime plugin context. The `Pick` named `entityService`, which cannot cross the published declaration boundary.
