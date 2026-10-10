---
"@rizom/brain": patch
"@brains/web-chat": patch
"@brains/studio": patch
---

Rebuild math-rendering UI assets with KaTeX 0.18.2, which ignores inherited renderer settings such as `trust`. Use reviewed repository overrides for postcss-selector-parser 7.1.6 and only the legacy esbuild-kit loader's esbuild 0.25.12 dependency, leaving other esbuild copies and AI/Chat SDK, model, Effect and database dependencies unchanged.

Check actual installed dependency paths and rendering/loader behavior during dependency validation; a patched lockfile alone does not prove an existing installation was replaced.

Repository overrides are not inherited by downstream applications. The published Tailwind typography package still pins the vulnerable CSS parser, so consumers need their own parser override or a fixed parent package. This release does not claim a clean dependency audit: braces and sprintf-js findings remain.
