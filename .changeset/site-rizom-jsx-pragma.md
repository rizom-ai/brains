---
"@rizom/site-rizom": patch
---

Add the `/** @jsxImportSource preact */` pragma to the ui components and runtime layout. Production bundling already compiled them as Preact, but under `bun test` the pragma-less files fell back to the React JSX runtime and rendered as empty strings — the frame was untestable from consuming packages.
