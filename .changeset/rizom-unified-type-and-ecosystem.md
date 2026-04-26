---
"@brains/theme-rizom": patch
"@rizom/ui": patch
---

Unify the rizom-family type system and lift the ecosystem section into shared UI.

- `@brains/theme-rizom`: Default typography at `:root` is now Fraunces (display), Barlow (body, nav), and JetBrains Mono (label, mono). Profile selectors (`product`, `editorial`, `studio`) keep their accent + secondary colors but no longer override fonts. Adds `--palette-amber-bright` (#f3c14f) and `--color-accent-bright` token (with matching `text-accent-bright` Tailwind utility) for the brighter golden amber used to differentiate sibling sites in ecosystem treatments.
- `@rizom/ui`: New `Wordmark` component renders the `rizom.<suffix>` mark in Fraunces with an italic muted suffix and a per-suffix dot color (work=accent, foundation=secondary, ai=accent-bright). `Header` and `Footer` now use `Wordmark` instead of inline spans. New `Ecosystem` component implements the typographic 3-up layout (per-suffix top border, role line, tagline, link/here state) and uses `Wordmark` per card.
