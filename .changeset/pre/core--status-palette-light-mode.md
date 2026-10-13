---
"@rizom/brain": patch
---

Fix status badges rendering dark in light mode on rizom-themed sites. Both rizom brand themes declared the dark status palette at `:root`, which matches in both modes, so `.bg-status-*` / `.text-status-*` resolved to dark colours even with `data-theme="light"`. The palette now lives once in `@brains/theme-base`, keyed by `[data-theme]`, and the themes keep only genuine deltas.
