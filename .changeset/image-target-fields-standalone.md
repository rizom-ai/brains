---
"@rizom/brain": patch
---

Treat image-targeted image generation requests as standalone image generation so plain prompts do not fail when a model supplies image target fields, and rebuild the local brain runtime before dev starts so web-chat card changes are not hidden by stale bundles.
