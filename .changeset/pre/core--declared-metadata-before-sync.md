---
"@rizom/brain": patch
---

A brain upgraded past the release that made declared types read their frontmatter as metadata no longer fails its first sync from git. Startup brought stored rows up to their types only after directory sync had begun planning its import, so a row the old entity class wrote, such as the style guide, could not be read and the whole initial sync failed; ready-state defaults were then skipped until the next start. Stored rows are now reconciled before the import is queued.
