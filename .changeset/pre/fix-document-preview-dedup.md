---
"@brains/document-plugin": patch
---

Ensure generated PDF previews create the requested document id instead of reusing a different deduped artifact, keeping returned attachment URLs valid after jobs complete.
