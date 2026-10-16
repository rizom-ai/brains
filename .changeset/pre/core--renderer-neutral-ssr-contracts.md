---
"@brains/contracts": patch
"@brains/ui-library": patch
"@brains/site-engine": patch
---

Renderer-neutral SSR contracts.

`ImageRenderer` was `marked`'s `renderer.image` callback signature —
`(href, title: string | null, text)` — re-exported from the component library
and made the build engine's public contract, so swapping the markdown library
would have been a breaking change to `@brains/site-engine`'s API.
`HeadProps`/`HeadCollectorInterface` had the same inverted ownership.

Both now live in `@brains/contracts` with library-neutral shapes:
`ImageRenderer` takes a `RenderedImageRef` (`{href, alt, title?}`), and
`markdown-html` adapts marked's AST to it at the boundary that owns the marked
dependency. ui-library re-exports the types, so template imports are unchanged.
