---
"@rizom/brain": patch
---

Add `buildThemePackage` to `@brains/build-tools` so theme packages share one publish-artifact builder, and drop the `@theme inline` declarations the rizom brand themes restated verbatim from `@brains/theme-base`. The composed CSS is unchanged — verified by compiling both themes through the real Tailwind pipeline before and after.
