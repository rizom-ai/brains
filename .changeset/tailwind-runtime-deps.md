---
"@rizom/brain": patch
---

Fix: declare tailwind runtime dependencies so the site builder's CSS
pipeline can resolve `@import "tailwindcss"` and `@plugin
"@tailwindcss/typography"` at build time.

The bundled `@tailwindcss/postcss` runs PostCSS against
`plugins/site-builder/src/styles/base.css` which begins with
`@import "tailwindcss"`. PostCSS resolves that import against the
consumer's `node_modules/`, not against the `@rizom/brain` bundle. If
`tailwindcss` isn't in the consumer's `node_modules`, the CSS build
throws `Can't resolve 'tailwindcss'` during the first site build.

Adds as regular `dependencies`:

- `tailwindcss` (^4.1.11)
- `@tailwindcss/postcss` (^4.1.13)
- `@tailwindcss/typography` (^0.5.19)
- `postcss` (^8.5.6)

`@tailwindcss/oxide` stays in `optionalDependencies` — it's the
native part of tailwind v4 and may fail to install on unsupported
platforms. The pure-JS packages above always install cleanly.
