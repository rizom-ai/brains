---
"@rizom/brain": patch
---

Converge the entity media attachment providers on shared factories. `@brains/media-page-composer` gains a `renderPrintablePdf` primitive alongside `renderOgImagePng` plus `createOgImageProvider`/`createPrintableProvider`, and the blog OG image provider moves off its hand-rolled temp-dir/server/screenshot path onto the shared pipeline it had drifted away from.
