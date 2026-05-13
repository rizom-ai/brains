# @rizom/ui

## 0.2.0-alpha.66

## 0.2.0-alpha.65

## 0.2.0-alpha.64

## 0.2.0-alpha.63

## 0.2.0-alpha.62

### Patch Changes

- [`697394f`](https://github.com/rizom-ai/brains/commit/697394f96cf828eca5512cc06c2386b829276212) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Upgrade generated publish-image Docker actions to Node.js 24-compatible major versions.

## 0.2.0-alpha.61

### Patch Changes

- [`4a65833`](https://github.com/rizom-ai/brains/commit/4a65833f1d6380d4348bfdd547e7714c33a41621) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Upgrade generated deploy workflow checkout action to avoid Node.js 20 action runtime warnings.

## 0.2.0-alpha.60

## 0.2.0-alpha.59

## 0.2.0-alpha.58

## 0.2.0-alpha.57

## 0.2.0-alpha.56

## 0.2.0-alpha.55

## 0.2.0-alpha.54

### Patch Changes

- [`c99290b`](https://github.com/rizom-ai/brains/commit/c99290b0297672a79686568146ba918912805083) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Fix ecosystem section headline contrast in dark mode by explicitly using the active site heading token.

## 0.2.0-alpha.53

### Patch Changes

- [`123d311`](https://github.com/rizom-ai/brains/commit/123d311ca35caa8ec576a2ebf7db0ef8f0aec195) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Fix professional/default site rendering with shared Rizom ecosystem sections and deck views.
  - Align the header brand/wordmark with the same content edge used by professional homepage sections.
  - Expose default-theme compatibility tokens for shared Rizom UI fonts and accent colors so ecosystem text is color-correct in dark mode without local site shims.
  - Give presentation decks a reliable themed background fallback in dark mode.

## 0.2.0-alpha.52

### Patch Changes

- [`22bb0fc`](https://github.com/rizom-ai/brains/commit/22bb0fc26d76e6b48fa9952fe4eb0ce560d04cf0) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Generalize `@rizom/ui`'s `Wordmark` and add a wordmark slot to the brain header so non-rizom sites (like yeehaa.io) can render a structured `name.suffix` brand mark.
  - `Wordmark` now accepts an optional `name` prop (defaulting to `"rizom"`) and widens `brandSuffix` to `RizomBrandSuffix | string`. Unknown suffixes fall back to `text-accent` for the dot color.
  - Brain `Header` accepts a `wordmark?: ComponentChildren` prop that, when provided, replaces the default title/logo rendering.
  - `ProfessionalLayout` forwards a new `wordmark` prop through to `Header` so site packages can override the header brand mark without rewriting the layout.

## 0.2.0-alpha.51

## 0.2.0-alpha.50

## 0.2.0-alpha.49

## 0.2.0-alpha.48

## 0.2.0-alpha.47

## 0.2.0-alpha.46

## 0.2.0-alpha.45

## 0.2.0-alpha.44

## 0.2.0-alpha.43

### Patch Changes

- Unify Fraunces display weight across the rizom site family via the central theme.

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

## 0.2.0-alpha.42

## 0.2.0-alpha.41

### Patch Changes

- [`ffdbdd0`](https://github.com/rizom-ai/brains/commit/ffdbdd0c7a771d4382d9d3fa85d54f004211c2f4) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Fix invalid HTML in `Ecosystem`: the linked card variant wrapped its content in an `<a>` and also nested another `<a>` for the link label. Render the inner label as a `<span>` so the outer card is the single click target.

## 0.2.0-alpha.40

### Patch Changes

- [`ff201d9`](https://github.com/rizom-ai/brains/commit/ff201d995bc5b52229e2fb81dfe25d7eb02d8d97) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Unify the rizom-family type system and lift the ecosystem section into shared UI.
  - `@brains/theme-rizom`: Default typography at `:root` is now Fraunces (display), Barlow (body, nav), and JetBrains Mono (label, mono). Profile selectors (`product`, `editorial`, `studio`) keep their accent + secondary colors but no longer override fonts. Adds `--palette-amber-bright` (#f3c14f) and `--color-accent-bright` token (with matching `text-accent-bright` Tailwind utility) for the brighter golden amber used to differentiate sibling sites in ecosystem treatments.
  - `@rizom/ui`: New `Wordmark` component renders the `rizom.<suffix>` mark in Fraunces with an italic muted suffix and a per-suffix dot color (work=accent, foundation=secondary, ai=accent-bright). `Header` and `Footer` now use `Wordmark` instead of inline spans. New `Ecosystem` component implements the typographic 3-up layout (per-suffix top border, role line, tagline, link/here state) and uses `Wordmark` per card.

## 0.2.0-alpha.39

## 0.2.0-alpha.38

## 0.2.0-alpha.37

## 0.2.0-alpha.36

### Patch Changes

- [`23bcdf1`](https://github.com/rizom-ai/brains/commit/23bcdf18ef59b107eb33ff8fa94fbc9a842605c7) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add a publishable `@rizom/ui` package for the app-facing shared Rizom UI layer.

  This extracts the shared Rizom UI primitives used by `rizom.ai` out of `@brains/site-rizom` so extracted Rizom apps can depend on a smaller package boundary.
