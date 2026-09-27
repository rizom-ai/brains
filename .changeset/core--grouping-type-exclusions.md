---
"@rizom/brain": patch
---

Apply groupings to every eligible content type by default. Replace the explicit contributor checklist with optional `excludeTypes` under a collapsed Exclude types disclosure. Singleton controls, types without frontmatter adapters and binary asset types stay outside grouping participation by convention.

Resolve participation consistently for schema extensions, validation, scoped descriptors and reprojection. Removing an exclusion restores participation without rewriting stored memberships. Preserve unavailable exclusions rather than silently dropping them.

Definitions no longer accept explicit `types` lists. There is no compatibility reader or automatic conversion; smoke's test definitions must use the current document shape when this version is deployed.
