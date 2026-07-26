---
"@rizom/site-smoke-canary": patch
---

Declare the preact JSX runtime via a `/** @jsxImportSource preact */` pragma in each shipped `.tsx`. The package ships raw `src` that the brain runtime transpiles live; without the pragma the runtime defaulted to `react/jsx-runtime` and the site failed to boot (`Cannot find module 'react/jsx-runtime'`). The pragma makes the external package self-describing about its JSX runtime instead of depending on the consumer's tsconfig.
