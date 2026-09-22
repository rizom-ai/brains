---
"@brains/db": patch
"@brains/contracts": minor
"@brains/plugins": minor
"@brains/web-chat": minor
---

Capture and inspect raw Chat upload bodies natively before file retention. Coordinate both browser clients on raw blobs with encoded filename metadata, without multipart compatibility. Preserve cancellation, measured size limits, and durable acknowledgements across retirement failures. Explicit capture and message-upload inspector provisioning is required.
