---
"@rizom/brain": patch
---

The dashboard's site health widget renders without React warnings: it passed `class` instead of `className` and gave its fixed children as unkeyed lists, so every render logged warnings.
