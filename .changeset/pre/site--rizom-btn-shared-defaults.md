---
"@rizom/theme-default": patch
"@rizom/theme-rizom-ai": patch
---

Declare the shared Rizom button defaults once, in `@rizom/theme-default`.

Both brand themes restated the full `--rizom-btn-*` vocabulary; 23 of the
declarations were character-identical. Those now live in the base theme both
brands compose (same `@layer theme` / `:root` scope), with each brand keeping
only its genuine deltas. Composed token values are verified unchanged for both
themes, and sites running the plain default theme now get real button defaults
instead of relying on per-component fallbacks.
