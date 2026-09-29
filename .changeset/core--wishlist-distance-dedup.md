---
"@rizom/brain": patch
---

Wishlist deduplication now recognises a reworded wish by embedding distance and counts it against the existing wish. Previously only a wish whose title slug repeated exactly was merged. The distance is configurable as `sameWishDistance` (default 0.28).
