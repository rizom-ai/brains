---
"@rizom/brain": patch
---

Apply groupings to every eligible content type by default. Replace the explicit contributor checklist with optional `excludeTypes` under a collapsed Exclude types disclosure. Singleton controls, types without frontmatter adapters and binary asset types stay outside grouping participation by convention.

Resolve participation consistently for schema extensions, validation, scoped descriptors and reprojection. Removing an exclusion restores participation without rewriting stored memberships. Preserve unavailable exclusions rather than silently dropping them.

Prevent queued directory imports from undoing newer Studio saves. Capture per-file entity revisions at admission and use atomic conditional upserts; skip stale work with a visible issue while preserving source files and pending exports. Conditional upserts never retry a raced create as an unconditional update.

Definitions no longer accept explicit `types` lists. There is no compatibility reader or automatic conversion; smoke's test definitions must use the current document shape when this version is deployed.
