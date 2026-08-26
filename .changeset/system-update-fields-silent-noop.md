---
"@brains/core": patch
---

Reject `system_update` field updates that the entity adapter would discard. Entity types whose frontmatter is built from the entity body, such as `topic`, keep no metadata for those keys, so a fields-only update reported success while leaving content and contentHash unchanged. The tool now explains the problem and points at full content replacement.
