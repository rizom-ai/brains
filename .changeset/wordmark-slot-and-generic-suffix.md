---
"@rizom/ui": patch
"@brains/ui-library": patch
"@brains/site-professional": patch
---

Generalize `@rizom/ui`'s `Wordmark` and add a wordmark slot to the brain header so non-rizom sites (like yeehaa.io) can render a structured `name.suffix` brand mark.

- `Wordmark` now accepts an optional `name` prop (defaulting to `"rizom"`) and widens `brandSuffix` to `RizomBrandSuffix | string`. Unknown suffixes fall back to `text-accent` for the dot color.
- Brain `Header` accepts a `wordmark?: ComponentChildren` prop that, when provided, replaces the default title/logo rendering.
- `ProfessionalLayout` forwards a new `wordmark` prop through to `Header` so site packages can override the header brand mark without rewriting the layout.
