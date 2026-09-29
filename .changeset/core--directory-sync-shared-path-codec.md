---
"@brains/entity-service": patch
"@brains/directory-sync": patch
"@brains/eslint-config": patch
---

Use the shared entity-path codec for directory-sync ID interpretation without changing existing filesystem placement. Decode stored IDs losslessly while retaining strict validation for newly authored paths. Permit only the named codec functions through the entity-service package import boundary.
