---
"@brains/plugins": patch
"@brains/entity-service": patch
"@brains/media-page-composer": patch
"@brains/sdk": patch
"@rizom/brain": patch
---

`defineEntity` now accepts `create` routing and `attachments`, and `@rizom/brain/entities` exports `EntityCreateRouting`, `EntityCreateRoute`, `EntityCreateResolution`, `EntityCreateContext`, `EntityCreateUploadReader`, `EntityCreateAttachment`, `EntityCreateCheck`, `EntityAttachmentDeclaration`, `MediaAttachmentContext` and `AttachmentProvider`. A declared type decides how `system_create` treats uploads, attachments, content and prompts: it can check a request before the user confirms it, then create, reuse, update or refuse, and the runtime performs the write with the caller's visibility and attribution. A route can also claim upload media types from the upload endpoint. Declared attachment providers are built from a frozen, read-only media context that only reads public records, and `@brains/media-page-composer` providers accept that same context.
