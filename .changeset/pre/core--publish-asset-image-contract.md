---
"@rizom/brain": patch
---

Publish-asset preflight queues image renders through the image job contract, so their data is validated when they are queued. Publish-asset definitions no longer take a `jobType` override or a `"document"` media type, which never generated anything.
