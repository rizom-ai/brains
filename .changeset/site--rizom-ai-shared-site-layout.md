---
"@rizom/site-rizom-ai": patch
---

Another Rizom site can now be built on this package. It exports the story page and reading thread (`StoryPage`, `ReadingThread`), the drawing builder (`organism`, `placed`, `gathered`, `ring`, `scatter`), `emphasize`, and `createSiteLayout`, which makes a site's chrome from its bar links, call to action, footer columns and drawings. One of the three sites (`site: "ai" | "work" | "foundation"`) gets the strip naming the three above its bar, its domain in the wordmark, and `threeSiteFooter` gives it a column per site. `createRizomSite` takes a site's `organisms`, whose styles join the story stylesheet, and its own `staticAssets`. A site built on the base no longer serves rizom.ai's drawings or the ATProto lexicons; rizom.ai serves both as before and its pages are unchanged.
