---
"@brains/core": patch
---

Reject `system_update` field updates that the entity adapter would discard. The persistence probe now compares requested values with both extracted metadata and serialized frontmatter, while allowing valid metadata deletions. The tool explains silent no-ops and points callers at full content replacement.
