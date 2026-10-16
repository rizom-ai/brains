---
"@rizom/ops": patch
---

Add image derivation to the ops registry model: `siteImageTag` (moved from rover-pilot's local copy), `sitePackagesFor`, and `requiredImages` — the image set the declared fleet state requires, derived purely from resolved users. This lets rover-pilot's Build workflow build exactly what a config push declares (default image per brain version in use, plus one per-instance sites image per site override) instead of relying on manual dispatches, and lets its deploy resolve tags through the same function so build and deploy can never disagree.
