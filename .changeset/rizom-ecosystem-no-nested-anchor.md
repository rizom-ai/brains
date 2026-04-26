---
"@rizom/ui": patch
---

Fix invalid HTML in `Ecosystem`: the linked card variant wrapped its content in an `<a>` and also nested another `<a>` for the link label. Render the inner label as a `<span>` so the outer card is the single click target.
