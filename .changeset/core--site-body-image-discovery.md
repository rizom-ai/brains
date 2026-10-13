---
"@brains/site-builder-plugin": patch
"@brains/image": patch
---

Site builds prepare the images a page's Markdown body references, not only cover and OG images, so `![alt](entity://image/id)` and reference-style images (full, collapsed and shortcut) render as optimized site images. Before, a body image had no prepared entry and the renderer left its `entity://` source unresolved. Discovery is structural: images in code, raw HTML, ordinary links and unused definitions are ignored, and the durable Markdown is never rewritten. `mapMarkdownImageUrls` in `@brains/image` maps image destinations, reference-style ones included.
