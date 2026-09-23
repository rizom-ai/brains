---
"@brains/utils": patch
---

Remove the unused URL-to-base64 download helper. Binary consumers must use explicitly provisioned owned file transports rather than controller-side response buffering.
