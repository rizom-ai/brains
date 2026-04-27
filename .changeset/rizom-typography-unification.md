---
"@brains/theme-rizom": patch
"@rizom/ui": patch
---

Unify Fraunces display weight across the rizom site family via the central theme.

`@brains/theme-rizom` now binds `font-variation-settings: "wght" 520` to the
`--font-display` token (Tailwind v4's `--font-{name}--font-variation-settings`
modifier syntax). Every `font-display` utility in every consuming site (rizom.ai,
rizom.foundation, rizom.work) inherits the same display weight automatically,
removing the per-site `font-normal`/`font-bold`/`font-[520]` drift that built up
during early-alpha iteration. Sites can still override locally for pull-quote
treatments via `[font-variation-settings:'wght'_380]`.

Also drops the `ProductCard` / `ProductIllustration` exports from `@rizom/ui`
(and the matching re-exports from `@brains/site-rizom`). The product-card
treatment turned out to be rizom.ai-specific in both layout and tone, so the
component now lives locally inside the rizom.ai repo. Other sites in the
ecosystem don't render product cards.
