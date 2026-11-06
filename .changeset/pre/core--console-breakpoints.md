---
"@rizom/brain": patch
---

The console's layout conditions are one canonical set. Every `@media` and `@container` rule in the app controls, the operator renderer and Studio is one of the named conditions in `@brains/app-ui-react/breakpoints`, and a test rejects any other. The near-duplicate widths that had drifted apart now share one value: 700px rules move to 720px, and 860px, 960px and 1000px rules move to 900px, so layouts switch at the same widths across the console.
