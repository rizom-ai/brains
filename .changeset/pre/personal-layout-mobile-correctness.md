---
"@rizom/brain": patch
---

Fix: mobile layout correctness for the Personal site templates and
shared Header.

The Personal homepage and about templates shipped rigid desktop-first
sizing that overflowed on narrow viewports, and several decorative
classes defined in `theme-default` (`hero-bg-pattern`, `cta-bg-pattern`,
`card-cover-gradient`) were never actually applied by the layouts.
The shared `Header`'s mobile hamburger had no visible default state on
dark backgrounds.

- `sites/personal/src/templates/homepage.tsx`
  - Hero h1: `text-4xl md:text-[56px]` → `text-2xl sm:text-4xl md:text-[56px]`,
    add `text-balance` so the tagline wraps on word boundaries instead of
    clipping at ~390px.
  - Hero inner container: add `w-full` so it fills the flex-col parent
    instead of shrink-wrapping to content width under `items-center`.
  - Hero CTA row: `flex justify-center gap-3` → `flex flex-wrap justify-center gap-3`
    so the two pill buttons stack on narrow viewports.
  - Hero `<header>`: apply `hero-bg-pattern relative overflow-hidden` so
    the theme-default dot pattern and vignette actually render.
  - Recent Posts grid: `grid-cols-1 md:grid-cols-3` →
    `grid-cols-[repeat(auto-fit,minmax(min(100%,280px),360px))] justify-center`
    so a lone post centers instead of stranding in two empty columns.
  - Post card `<img>`: add `card-cover-gradient text-transparent` so a
    failing image falls through to the brand gradient instead of showing
    raw alt text.
  - CTA section: apply `cta-bg-pattern relative overflow-hidden`.

- `sites/personal/src/templates/about.tsx`
  - Same hero h1, inner container, and `hero-bg-pattern` treatment as
    the homepage.

- `sites/personal/src/layouts/PersonalLayout.tsx`
  - Root wrapper: add `overflow-x-clip` as a global horizontal-overflow
    safety net.
  - Footer nav: `flex gap-6` → `flex flex-wrap justify-center gap-x-6 gap-y-2`
    so the nav wraps instead of clipping "Admin" off the right edge.

- `shared/ui-library/src/Header.tsx`
  - Mobile hamburger button: ship a visible default state
    (`text-brand border border-brand/40 bg-brand/10`) so it reads against
    dark headers without relying on each consumer's theme override.
