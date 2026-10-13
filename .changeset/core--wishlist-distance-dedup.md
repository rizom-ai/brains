---
"@rizom/brain": patch
---

Wishlist deduplication now recognises a reworded wish by embedding distance and counts it against the existing wish. Previously only a wish whose title slug repeated exactly was merged. Reworded wishes within the configurable `sameWishDistance` (default 0.3) are shortlisted and confirmed by a short AI check, so opposite requests such as "send emails" and "stop sending emails" stay separate.
