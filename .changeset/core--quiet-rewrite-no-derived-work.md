---
"@rizom/brain": patch
---

The rewrite on start no longer redoes work derived from a row's meaning. A restated row keeps its topic votes and failure counts under its new content hash, so topic extraction does not read it again or replace topics. A FAQ's fresh embedding from the rewrite no longer folds it into a near-duplicate. The shell announces the restated rows on `system:entities:restated` before startup content settles, and embedding-ready events carry `restated: true` for them.
