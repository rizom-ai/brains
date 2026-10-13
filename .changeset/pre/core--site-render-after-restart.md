---
"@rizom/brain": patch
---

Render the site once after every start, so an upgrade's template, component and style changes reach the published site even when no content changed; unchanged builds are still skipped while the app runs. The per-template `renderVersion` option is removed.
