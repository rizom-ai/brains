---
"@rizom/brain": patch
---

Extract the runtime-state status engine that directory-sync and site-builder each hand-rolled into `SerializedStatusStore` in `@brains/plugins`, on top of a shared `SerialQueue`. Fixes a latent race in site-builder's startup reconciliation, which read and wrote its status document outside the write queue and so could clobber a concurrent build mutation.
