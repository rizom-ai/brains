---
"@rizom/ops": patch
---

Include an exact version-and-pin-set digest in every pinned runtime image tag, including short readable tags, and refuse colliding requirements instead of dropping one. Normalize duplicate pins and preserve deterministic ordering.

Pinned images use new immutable tags after this change. Existing registry tags must not be overwritten or retagged as a migration workaround.
