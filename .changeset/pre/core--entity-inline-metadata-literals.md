---
"@brains/plugins": patch
"@rizom/brain": patch
---

Metadata written inline in `defineEntity` — a seed, a stub, a decoded document, a create route's resolution or allocation, a generation result — keeps its literal types without an annotation, also from a callback that takes no parameters, and is also accepted read-only.
