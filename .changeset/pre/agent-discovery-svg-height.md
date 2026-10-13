---
"@brains/agent-discovery": patch
---

Drop the invalid height="auto" attribute from the proximity map svg.
"auto" is not an SVG length, so browsers rejected it and logged a console
error on every page view; both surfaces already size the svg via CSS.
