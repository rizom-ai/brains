---
"@brains/theme-rizom": patch
---

Fix `font-display` weight regression caused by arbitrary `font-variation-settings` overrides.

The previous attempt bound `font-variation-settings: "wght" 520` to the `font-display`
token via `--font-display--font-variation-settings`. That works in isolation, but
arbitrary call-site utilities like `[font-variation-settings:'opsz'_96]` (used in
`Wordmark`, `Ecosystem`, etc.) replace the entire property — dropping the wght axis
and letting the rendered weight fall back to whatever `font-weight` class was on the
element (often `font-normal` → 400).

Switched to a `@utility font-display { font-family: var(--font-display); font-weight: 520; }`
override. CSS `font-weight` propagates to the wght axis natively for variable fonts and
survives partial-axis overrides via `font-variation-settings`. Sections that need a
different weight still pin it via `font-bold`, `font-[380]`, etc.
