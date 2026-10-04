---
"@rizom/brain": patch
---

Restore the topic-distribution explanation when visible source content exists but no visible topics have been extracted. The configured service reports whether automatic extraction is enabled, respects its source-type selection and caller visibility, and excludes drafts from public counts.

Insight callbacks receive a frozen, detached `projectionSourceTypes` name list. This exposes source eligibility, not entity registries, configuration objects or storage. Both entity and service insight hosts construct the same narrow view.
