---
"@rizom/brain": minor
---

Retire the private `@brains/rizom-ecosystem` package and remove its `rizom-ecosystem` capability from the canonical catalog. Rizom sites now own their ecosystem or faces content through their site section packages, and existing instances must remove `rizom-ecosystem` from `add` and any `rizom-ecosystem:ecosystem` template references.
