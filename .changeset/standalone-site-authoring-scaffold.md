---
"@rizom/brain": patch
---

Improve standalone site authoring for published `@rizom/brain` consumers.

- auto-discover local `src/site.ts` and `src/theme.css` when `brain.yaml`
  omits `site.package` / `site.theme`
- widen `@rizom/brain/site` to expose both personal and professional site
  authoring symbols under one public subpath
- make `brain init` scaffold `src/site.ts` and `src/theme.css` while keeping
  `brain.yaml` pinned to the model's built-in site/theme until the operator
  opts into the local convention
