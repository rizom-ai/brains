---
"@rizom/brain": patch
---

An anchor profile whose content is invalid, such as one carrying a key the profile schema no longer accepts, is now quarantined by directory sync as `anchor-profile.md.invalid` with its content intact. Before, the failure was treated as retryable, so on a brain's first start the default "Unknown" profile was written over the author's file, and with git sync pushed back to the content repository. A persist validator can now report that content is invalid in itself with a schema-phase validation error, which is kept rather than treated as a live policy refusal.
