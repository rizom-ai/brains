---
version: alpha
name: Rizom
description: Bioluminescent, mycelial design system for a living work ecosystem where independent experts thrive together.
colors:
  bg-deep: "#0D0A1A"
  bg-subtle: "#0E0B1E"
  bg-card: "#1A0A3E"
  bg-light: "#F2EEE8"
  text-light: "#1A1625"
  white: "#FFFFFF"
  amber-dark: "#C45A08"
  amber: "#E87722"
  amber-light: "#FFA366"
  amber-glow: "#FFD4A8"
  amber-bright: "#F3C14F"
  purple: "#6B2FA0"
  purple-light: "#8C82C8"
  purple-muted: "#818CF8"
  success: "#4ADE80"
typography:
  display-2xl:
    fontFamily: Fraunces
    fontSize: 96px
    fontWeight: 520
    lineHeight: 0.9
    letterSpacing: -0.03em
  display-xl:
    fontFamily: Fraunces
    fontSize: 72px
    fontWeight: 520
    lineHeight: 0.95
    letterSpacing: -0.03em
  display-lg:
    fontFamily: Fraunces
    fontSize: 56px
    fontWeight: 520
    lineHeight: 1.1
    letterSpacing: -0.02em
  display-md:
    fontFamily: Fraunces
    fontSize: 40px
    fontWeight: 520
    lineHeight: 1.1
    letterSpacing: -0.02em
  display-sm:
    fontFamily: Fraunces
    fontSize: 30px
    fontWeight: 520
    lineHeight: 1.2
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Barlow
    fontSize: 18px
    fontWeight: 400
    lineHeight: 1.7
  body-md:
    fontFamily: Barlow
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.8
  body-sm:
    fontFamily: Barlow
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.7
  label-md:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: 0.12em
  label-sm:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: 0.14em
rounded:
  none: 0px
  sm: 6px
  md: 12px
  lg: 20px
  xl: 28px
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  2xl: 48px
  3xl: 64px
  section: 112px
  max-width: 1152px
components:
  button-primary:
    backgroundColor: "{colors.amber}"
    textColor: "{colors.white}"
    typography: "{typography.body-md}"
    rounded: "{rounded.full}"
    padding: 12px 20px
  button-primary-hover:
    backgroundColor: "{colors.amber-light}"
    textColor: "{colors.bg-deep}"
    rounded: "{rounded.full}"
  button-secondary:
    backgroundColor: "{colors.bg-card}"
    textColor: "{colors.white}"
    rounded: "{rounded.full}"
    padding: 12px 20px
  card-panel:
    backgroundColor: "{colors.bg-card}"
    textColor: "{colors.white}"
    rounded: "{rounded.lg}"
    padding: 24px
  card-editorial:
    backgroundColor: "{colors.bg-light}"
    textColor: "{colors.text-light}"
    rounded: "{rounded.sm}"
    padding: 32px
  badge:
    backgroundColor: "{colors.bg-subtle}"
    textColor: "{colors.amber-light}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.full}"
    padding: 6px 10px
  nav-link:
    textColor: "{colors.white}"
    typography: "{typography.label-sm}"
    padding: 8px
---

# Design System

## Overview

Rizom is a living work ecosystem: independent experts forming trusted teams through complementary rhythms, shared ownership, and light-touch governance. The interface should feel organic, intelligent, and grounded — a mycelial network made legible for professional collaboration.

The design north star is: **work becomes play with purpose**.

Every surface should communicate three ideas at once:

- **Agency** — people choose collaborators and own outcomes.
- **Governance** — facilitators, quality standards, and community norms keep the system healthy.
- **Emergence** — teams form naturally through visible patterns, not rigid hierarchy.

If a design only feels free, it risks chaos. If it only feels structured, it becomes corporate. Rizom lives in the balance.

## Colors

Use a restrained bioluminescent palette. Deep indigo-black is the default substrate; amber carries warmth, value, and active energy; purple marks ecosystem-scale intelligence and transitions between individual and collective activity.

- **Deep background** (`#0D0A1A`): primary dark surface.
- **Card depth** (`#1A0A3E`): panels, product cards, layered surfaces.
- **Light paper** (`#F2EEE8`): light mode and editorial surfaces.
- **Amber dark** (`#C45A08`): editorial/foundation accent and light-mode accent.
- **Amber** (`#E87722`): default/studio accent.
- **Amber light** (`#FFA366`): luminous product accent in dark mode.
- **Purple** (`#6B2FA0`, `#8C82C8`, `#818CF8`): secondary ecosystem signal.

Dark mode is the designed default. Light should occupy no more than roughly 15% of dense hero compositions. Glow must be functional: connection, signal, warmth, or value transfer.

## Typography

Rizom uses an editorial × diagnostic register:

- **Fraunces** for display: reflective, organic, and high-trust.
- **Barlow** for body: warm, readable, professional.
- **JetBrains Mono** for labels and instrument readouts: precise, technical, infrastructural.

Headlines should feel spacious and slightly literary, never SaaS-shouty. Body copy should use generous line-height and moderate line length. Labels may be uppercase, but keep them quiet and purposeful.

## Layout

Layouts should be asymmetrical but intentional. Use strong grids underneath, then let selected elements break rhythm like growth finding its path.

- Prefer staggered cards, offset annotations, and layered panels.
- Use long vertical rhythm and generous section spacing.
- Lead each section with one strong idea, not many equal columns.
- Let proof points and network fragments orbit the core message.
- Use white space as soil: calm, breathable, and structurally important.

## Components

Components should feel like illuminated soil samples or collaboration cells.

- **Buttons:** rounded, warm, clear, and sparse. Primary buttons should be reserved for the most important action on a screen.
- **Cards:** translucent and low-border in dark mode; tactile warm paper in light/editorial contexts.
- **Badges:** small diagnostic signals, usually mono, uppercase, and accent-colored.
- **Navigation:** quiet and persistent. Active states should use accent light or underline rather than heavy fills.
- **Network graphics:** branching, non-hierarchical, and purposeful; never generic neon grids.

Hover states should feel like activation, not gamified bounce.

## Motion

Motion should mimic natural emergence.

- Connections draw gradually, like mycelium finding roots.
- Sections reveal through subtle rise/fade, not snapping.
- Use staggered timing for networks and grouped cards.
- Avoid springy consumer-app motion, confetti, or aggressive parallax.
- Honor reduced-motion preferences.

## Imagery

Preferred motifs:

- Branching mycelial lines.
- Distributed nodes and clusters.
- Layered maps of teams, cores, and value flow.
- Real collaborative moments with natural posture and diverse environments.
- Data visualizations that breathe: rhythm patterns, trust signals, team formations.

Avoid corporate stock handshakes, rigid org charts, overly symmetrical network diagrams, decorative nature imagery disconnected from function, and generic AI neon grids.

## Voice

Rizom copy should sound like a knowing guide: vivid, grounded, and honest about difficulty.

Use phrases like:

- “agency with governance”
- “teams form through complementary rhythms”
- “work becomes play with purpose”
- “own your future”
- “the rhizome grows beneath your feet”
- “not everyone is ready; the rhizome doesn’t judge”

Avoid extraction language such as “optimize,” “leverage,” and “synergize.” Do not promise perfect matches, total freedom without standards, or platform-only transformation.

## Do's and Don'ts

- Do balance agency and governance in every major surface.
- Do use the rhizome/mycelial metaphor to explain function, not decoration.
- Do keep the palette restrained enough for glow to matter.
- Do maintain WCAG AA contrast for text and interactive states.
- Do pair poetic copy with concrete labels and clear CTAs.
- Don't use amber and purple as decoration without meaning.
- Don't make layouts so organic that hierarchy becomes unclear.
- Don't rely on color alone to distinguish state.
- Don't let animated network backgrounds block readability.

## Implementation Notes

Use the shared theme tokens in `shared/theme-rizom/src/theme.css` and shared UI primitives in `shared/rizom-ui/src/`. The site composition package lives in `sites/rizom/src/`. Brand source material lives in `apps/rizom-foundation/brain-data/RizomBrandBook.md`.
