---
"@rizom/brain": patch
---

Remove the `@rizom/brain/themes` subpath export. It existed so a standalone site repo could call `composeTheme` itself; that consumer (`apps/mylittlephoney`) is deprecated and no theme needs it — a theme is a CSS string, and the shell prepends the shared base when the brain resolves. The function is now internal to `@brains/theme-base` and named `withThemeBase`, which says which base it adds.
