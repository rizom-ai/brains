---
"@rizom/brain": patch
---

Honor explicit citable:false exclusions even when no entity type opts into citations. Keep published-only list and count views bounded when callers supply lifecycle-status filters or publishedOnly:false: intersect those filters with the publication gate instead of exposing drafts. Preserve unbounded preview behavior and custom per-type published statuses.
