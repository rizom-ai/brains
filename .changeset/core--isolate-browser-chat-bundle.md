---
"@rizom/brain": patch
"@brains/utils": patch
"@brains/contracts": patch
---

Build the browser-safe Chat export separately from server library chunks. Server subpaths still share their runtime, while browser consumers no longer inherit Node-only imports through shared chunks. Keep frontmatter-only contract parsing independent of Markdown AST initialization, so the export also loads in headless runtimes without a DOM. Verify the exact packed export with the existing browser-build and headless canary.
