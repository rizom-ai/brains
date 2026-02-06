# Plan: Elevate Brutalist Theme — CRT Terminal Aesthetic

## Context

The brutalist theme has strong foundations — neon green palette, Space Mono typography, CRT scan lines, uppercase headings — but the shared UI components bring rounded corners, smooth transitions, and an organic wave divider that contradict brutalist principles. The theme currently looks _themed_ but doesn't feel _committed_.

**Goal**: Make every element feel like it's rendered on a CRT terminal monitor. Exposed structure, instant interactions, manufactured precision. One distinctive detail (blinking cursor) that someone will remember.

**Philosophy**: Brutalism treats the interface as exposed infrastructure. Borders are structural, not decorative. Colors are signals, not moods. Interactions are mechanical, not organic.

## Changes

All CSS changes go in `shared/theme-brutalist/src/theme.css`. One small backward-compatible change to `AnimatedWaveDivider.tsx`.

### 1. Sharp Corners — Kill All Rounded Edges

Unlayered CSS (outside `@layer`) to override Tailwind's rounded utilities:

```css
a[class*="rounded-"],
span[class*="rounded-"],
button[class*="rounded-"],
div[class*="rounded-"] {
  border-radius: 0;
}
```

Affects: LinkButton (all sizes use `rounded-lg/xl/2xl`), TagsList pills (`rounded-full`), prose images (`rounded-lg`). Scoped to elements with explicit rounded classes.

### 2. Brutal Divider — Replace Wave with Hard Line

**File**: `plugins/professional-site/src/components/AnimatedWaveDivider.tsx`
Add `wave-divider` class to the wrapper div (no visual change for other themes):

```tsx
<div className={`wave-divider w-full h-16 md:h-20 ...`}>
```

**File**: `shared/theme-brutalist/src/theme.css`
Override the organic wave into a stark neon line:

```css
.wave-divider {
  height: 3px;
  background-color: var(--color-brand);
  overflow: visible;
}
.wave-divider svg {
  display: none;
}
```

### 3. Phosphor Glow — CRT Monitor Effect (Dark Mode Only)

Text-shadow on the hero heading that mimics CRT phosphor persistence:

```css
[data-theme="dark"] .hero-bg-pattern h1 {
  text-shadow:
    0 0 30px rgba(0, 255, 102, 0.25),
    0 0 60px rgba(0, 255, 102, 0.08);
}
```

Subtle atmospheric glow — the heading appears to emit light. Only in dark mode where neon green is primary.

### 4. Terminal Cursor — Blinking Block After Hero Title

```css
.hero-bg-pattern h1::after {
  content: "█";
  color: var(--color-brand);
  animation: cursor-blink 1s steps(1) infinite;
  margin-left: 0.1em;
}

@keyframes cursor-blink {
  0%,
  50% {
    opacity: 1;
  }
  50.01%,
  100% {
    opacity: 0;
  }
}
```

The single most distinctive detail. Transforms the hero from "text on a page" to "text being typed on a terminal." Draws the eye to the title.

### 5. Instant Transitions — No Organic Motion

Override smooth transitions with mechanical step timing:

```css
a,
button,
span {
  transition-timing-function: steps(1);
  transition-duration: 100ms;
}
```

All state changes snap. CRT pixels don't fade between colors; they flip.

### 6. Structural Borders — Visible Grid Infrastructure

```css
/* Borders between content list items */
.homepage-list li + li,
.about-page li + li {
  border-top: 2px solid var(--color-border);
  padding-top: 1.25rem;
}

/* Thicker, branded vertical divider in ContentSection */
.homepage-list .md\:border-l,
.about-page .md\:border-l {
  border-left-width: 2px;
  border-color: var(--color-brand);
}

/* CTA structural separator */
.cta-bg-pattern {
  border-top: 4px solid var(--color-brand);
}
```

Brutalist architecture exposes structural elements. These borders define the grid.

### 7. Industrial Tags — Terminal Badges

Transform soft pill tags into square, bordered, monospace labels:

```css
span[class*="rounded-full"]:not([class*="bg-transparent"]) {
  border: 1px solid var(--color-border);
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
```

Tags become `DESIGN` `JAVASCRIPT` `ARCHITECTURE` — industrial classification labels, not friendly pills.

### 8. Glitch-on-Hover — Micro-Interaction

Reuse the existing `@keyframes glitch` for a one-shot hover distortion on interactive elements:

```css
.content-section-reveal a:hover,
.cta-bg-pattern a:hover {
  animation: glitch 200ms 1;
}

/* Don't glitch prose links — they need calm readability */
.prose a:hover {
  animation: none;
}
```

Brief CRT distortion on hover. Memorable without being disruptive.

### 9. Button Treatment — Industrial Controls

```css
a[class*="bg-brand"][class*="text-theme-inverse"] {
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-family: var(--font-mono);
  border: 2px solid var(--color-brand);
}

[data-theme="dark"] a[class*="bg-brand"][class*="text-theme-inverse"]:hover {
  background-color: transparent;
  color: var(--color-brand);
}
```

Primary buttons become uppercase monospace with thick borders. Dark mode hover inverts the fill (background disappears, text becomes green) — a reversal, not a softening.

## Key Files

| File                                                               | Change                                  |
| ------------------------------------------------------------------ | --------------------------------------- |
| `shared/theme-brutalist/src/theme.css`                             | All CSS overrides (items 1, 3–9)        |
| `plugins/professional-site/src/components/AnimatedWaveDivider.tsx` | Add `wave-divider` class to wrapper div |

## Verification

```bash
bun run typecheck
bun run lint
cd apps/professional-brain && bun run build
# Preview dist/site-preview/index.html in browser
# Check both light and dark modes
# Verify: sharp corners, neon line divider, phosphor glow (dark),
#   blinking cursor, instant transitions, structural borders,
#   industrial tags, glitch hover, button treatment
# Confirm other themes unaffected (switch to editorial, verify normal appearance)
```
