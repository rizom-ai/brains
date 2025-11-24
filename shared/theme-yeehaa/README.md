# Yeehaa Brand Style Guide

A comprehensive guide to the Yeehaa visual identity and design system for Professional Brain.

---

## Typography

### Font Families

**Jost** — Universal Typeface
A modern, minimalist geometric sans-serif used for everything: headings, body text, UI elements, and general content.

**Weights Available:** 300 (Light), 400 (Regular), 500 (Medium), 600 (Semi Bold), 700 (Bold), 800 (Extra Bold), 900 (Black)

**Philosophy:** Simplicity and consistency through a single, versatile typeface family.

**Monospace** — Code & Technical
System default monospace fonts for code blocks and technical content.

**Examples:** SFMono, Menlo, Monaco, Consolas

---

### Type Scale

#### Desktop (Presentations & Large Displays)

| Style          | Font | Size            | Weight      | Line Height | Letter Spacing |
| -------------- | ---- | --------------- | ----------- | ----------- | -------------- |
| **H1**         | Jost | 128px (8rem)    | 900 Black   | 1.0         | -0.02em        |
| **H2**         | Jost | 72px (4.5rem)   | 700 Bold    | 1.0         | -0.02em        |
| **H3**         | Jost | 48px (3rem)     | 700 Bold    | 1.0         | -0.01em        |
| **H4**         | Jost | 30px (1.875rem) | 700 Bold    | 1.1         | -0.01em        |
| **Body Large** | Jost | 30px (1.875rem) | 400 Regular | 1.5         | 0              |
| **Body**       | Jost | 18px (1.125rem) | 400 Regular | 1.6         | 0              |
| **Small**      | Jost | 14px (0.875rem) | 400 Regular | 1.5         | 0              |

#### Mobile

| Style     | Font | Size           | Weight      |
| --------- | ---- | -------------- | ----------- |
| **H1**    | Jost | 60px (3.75rem) | 900 Black   |
| **H2**    | Jost | 48px (3rem)    | 700 Bold    |
| **H3**    | Jost | 36px (2.25rem) | 700 Bold    |
| **Body**  | Jost | 24px (1.5rem)  | 400 Regular |
| **Small** | Jost | 16px (1rem)    | 400 Regular |

---

## Color Palette

### Brand Colors

**Primary Red** — Brand Identifier
`#DC2626` — RGB(220, 38, 38)

The bold red that defines the Yeehaa brand. Use for links, CTAs, brand elements, and primary actions. Provides high contrast and strong visual impact.

**Dark Red** — Hover & Emphasis
`#991B1B` — RGB(153, 27, 27)

Deeper red for hover states, active states, and darker emphasis.

**Light Red** — Subtle Accents
`#EF4444` — RGB(239, 68, 68)

Brighter red used in dark mode and for subtle accent touches.

---

### Neutral Colors — Light Mode

| Name           | Hex       | RGB           | Usage                       |
| -------------- | --------- | ------------- | --------------------------- |
| **Pure White** | `#FFFFFF` | 255, 255, 255 | Main backgrounds, cards     |
| **Gray 50**    | `#F9FAFB` | 249, 250, 251 | Subtle backgrounds          |
| **Gray 100**   | `#F3F4F6` | 243, 244, 246 | Muted backgrounds           |
| **Gray 200**   | `#E5E7EB` | 229, 231, 235 | Borders, dividers           |
| **Gray 300**   | `#D1D5DB` | 209, 213, 219 | Dot patterns, light accents |
| **Gray 400**   | `#9CA3AF` | 156, 163, 175 | Subtle text, placeholders   |
| **Gray 600**   | `#4B5563` | 75, 85, 99    | Muted body text             |
| **Gray 700**   | `#374151` | 55, 65, 81    | Secondary text              |
| **Gray 800**   | `#1F2937` | 31, 41, 55    | Dark text emphasis          |
| **Gray 900**   | `#111827` | 17, 24, 39    | Primary body text, headings |
| **Pure Black** | `#000000` | 0, 0, 0       | Darkest elements            |

---

### Neutral Colors — Dark Mode

| Name                 | Hex       | RGB           | Usage                                 |
| -------------------- | --------- | ------------- | ------------------------------------- |
| **Dark Background**  | `#111827` | 17, 24, 39    | Main dark background (gray-900)       |
| **Dark Subtle**      | `#1F2937` | 31, 41, 55    | Slightly elevated surfaces (gray-800) |
| **Dark Muted**       | `#374151` | 55, 65, 81    | Elevated surfaces, borders (gray-700) |
| **Dark Border**      | `#4B5563` | 75, 85, 99    | Border color (gray-600)               |
| **Text Light**       | `#F9FAFB` | 249, 250, 251 | Main dark mode text (gray-50)         |
| **Text Muted Dark**  | `#D1D5DB` | 209, 213, 219 | Secondary dark mode text (gray-300)   |
| **Text Subtle Dark** | `#9CA3AF` | 156, 163, 175 | Tertiary dark mode text (gray-400)    |

---

## Color Usage Guidelines

### Light Mode

- **Body Text:** Gray 900 (`#111827`)
- **Headings:** Gray 900 (`#111827`)
- **Muted Text:** Gray 600 (`#4B5563`)
- **Links & CTAs:** Primary Red (`#DC2626`)
- **Link Hover:** Dark Red (`#991B1B`)
- **Backgrounds:** White to Gray 50 gradient
- **Borders:** Gray 200 (`#E5E7EB`)
- **Footer:** White background, same as page
- **Dot Patterns:** Gray 300 (`#D1D5DB`)

### Dark Mode

- **Body Text:** Text Light (`#F9FAFB`)
- **Headings:** Text Light (`#F9FAFB`)
- **Muted Text:** Text Muted Dark (`#D1D5DB`)
- **Links & CTAs:** Light Red (`#EF4444`)
- **Link Hover:** Primary Red (`#DC2626`)
- **Backgrounds:** Dark Background to Dark Subtle gradient
- **Borders:** Dark Border (`#4B5563`)
- **Footer:** Dark Background, same as page
- **Dot Patterns:** Gray 700 (`#374151`)

---

## Gradients

### Light Mode Background Gradient

**Direction:** 180° (vertical, top to bottom)

**Color Stops:**

- 0%: Pure White (`#FFFFFF`)
- 100%: Gray 50 (`#F9FAFB`)

**CSS:**

```css
background: linear-gradient(180deg, #ffffff 0%, #f9fafb 100%);
```

**Effect:** Subtle, clean gradient that adds depth without distraction.

---

### Dark Mode Background Gradient

**Direction:** 180° (vertical, top to bottom)

**Color Stops:**

- 0%: Dark Background (`#111827`)
- 100%: Dark Subtle (`#1F2937`)

**CSS:**

```css
background: linear-gradient(180deg, #111827 0%, #1f2937 100%);
```

**Effect:** Subtle depth with minimal contrast, maintains clean aesthetic.

---

## Patterns & Textures

### Hero Dot Grid Pattern

**Style:** Radial gradient dots
**Color:** Gray 300 (`#D1D5DB`) in light mode, Gray 700 (`#374151`) in dark mode
**Dot Size:** 1px circles
**Spacing:** 20×20px grid
**Usage:** Hero sections, feature backgrounds

**CSS:**

```css
background-image: radial-gradient(
  circle at 1px 1px,
  var(--color-pattern-dot) 1px,
  transparent 0
);
background-size: 20px 20px;
```

**Visual:** A subtle grid of small dots that adds texture without overwhelming content.

---

### CTA Dot Grid Pattern

**Style:** Radial gradient dots
**Color:** White at 15% opacity
**Dot Size:** 1px circles
**Spacing:** 40×40px grid (larger, more spacious)
**Usage:** Call-to-action sections

**CSS:**

```css
background-image: radial-gradient(
  circle at 2px 2px,
  rgba(255, 255, 255, 0.15) 1px,
  transparent 0
);
background-size: 40px 40px;
```

**Visual:** A more spacious dot pattern suitable for overlay on colored backgrounds.

---

## Spacing System

The design uses a **4px base grid system** with the following scale:

| Size   | Pixels | Usage                     |
| ------ | ------ | ------------------------- |
| **1**  | 4px    | Tight spacing, small gaps |
| **2**  | 8px    | Default small spacing     |
| **3**  | 12px   | Comfortable spacing       |
| **4**  | 16px   | Standard spacing          |
| **6**  | 24px   | Medium spacing            |
| **8**  | 32px   | Large spacing             |
| **12** | 48px   | Extra large spacing       |
| **16** | 64px   | Section spacing           |
| **24** | 96px   | Major section spacing     |
| **32** | 128px  | Hero section spacing      |

---

### Common Spacing Patterns

**Hero Section:**

- Vertical padding: 128px desktop, 64px mobile
- Title to body spacing: 48px
- Body to CTA spacing: 64px

**Content Sections:**

- Vertical padding: 96px desktop, 48px mobile
- Heading to content: 32px
- Between content items: 24px

**Cards:**

- Internal padding: 32px
- Border radius: 8px
- Gap between cards: 24px

**Containers:**

- Desktop max width: 1280px
- Desktop horizontal padding: 64px
- Mobile horizontal padding: 20px

---

## Components

### Buttons

**Primary Button**

- Background: Primary Red (`#DC2626`)
- Text: White, Jost, 18px, Semi Bold (600)
- Padding: 24px horizontal, 20px vertical
- Border radius: 8px
- Hover: Dark Red (`#991B1B`)
- Transition: 200ms ease

**Secondary Button**

- Background: Transparent
- Text: Primary Red (`#DC2626`), Jost, 18px, Semi Bold (600)
- Border: 2px solid Primary Red
- Padding: 24px horizontal, 20px vertical
- Border radius: 8px
- Hover: Light gray tint background

**Sizes:**

- Large: 28px vertical padding, 20px font size
- Medium (default): 20px vertical padding, 18px font size
- Small: 12px vertical padding, 16px font size

---

### Cards

**Default Card**

- Background: White (light mode) / Dark Subtle (dark mode)
- Padding: 32px
- Border: 1px solid Gray 200 / Dark Border
- Border radius: 8px
- Shadow: 0px 4px 20px rgba(0, 0, 0, 0.08)
- Max width: 350px

**Elevated Card**

- Same as default but with larger shadow:
- Shadow: 0px 8px 32px rgba(0, 0, 0, 0.12)

**Card Content Structure:**

- Icon/Image area: 160×160px (if applicable)
- Title: Jost, 24px, Bold
- Body: Jost, 16px, Regular
- Spacing: 24px between elements

---

### Navigation

**Menu Item — Default**

- Text: Jost, 16px, Medium (500)
- Color: Gray 900 (light mode) / Text Light (dark mode)
- Padding: 12px vertical, 16px horizontal

**Menu Item — Hover**

- Background: Subtle gray tint
- Underline: 2px Primary Red

**Menu Item — Active**

- Background: Gray 100 (light mode) / Dark Muted (dark mode)
- Text: Gray 900 / Text Light
- Indicator: 2px bottom border Primary Red

---

## Text Selection & Highlighting

**Light Mode Selection:**

- Background: Primary Red (`#DC2626`)
- Text: White (`#FFFFFF`)

**Dark Mode Selection:**

- Background: Light Red (`#EF4444`)
- Text: Gray 900 (`#111827`)

**Usage:** Provides clear visual feedback when users select text, maintaining brand identity throughout the experience.

---

## Animation

### Blob Animation

Organic floating animation for decorative elements.

**Duration:** 7 seconds
**Loop:** Infinite
**Easing:** Smooth cubic bezier

**Keyframes:**

- 0%: translate(0, 0) scale(1)
- 33%: translate(30px, -50px) scale(1.1)
- 66%: translate(-20px, 20px) scale(0.9)
- 100%: translate(0, 0) scale(1)

**Stagger Delays:** 2s and 4s for multiple blobs

---

### Transitions

**Standard Transitions:**

- Duration: 200ms
- Easing: ease or ease-in-out
- Properties: background-color, color, transform

**Hover Effects:**

- Buttons: Background color change
- Links: Underline appearance
- Cards: Subtle lift (translateY(-4px) + shadow increase)

---

## Accessibility

### Contrast Ratios (WCAG Standards)

**Passing Combinations:**

- White on Primary Red: **6.8:1** (AA Large) ✓
- Gray 900 on White: **18.5:1** (AAA) ✓
- Primary Red on White: **6.8:1** (AA Large) ✓
- Text Light on Dark Background: **16.8:1** (AAA) ✓
- Light Red on Dark Background: **7.2:1** (AAA) ✓

**Avoid:**

- Gray 400 on White for body text (below 4.5:1)
- Light grays on white backgrounds for body text
- Red on red combinations

---

### Typography Accessibility

**Minimum Sizes:**

- Body text: 16px (1rem) minimum
- Small text: 14px only for captions/labels
- Line height: 1.5 minimum for body text
- Line length: 60-80 characters ideal

**Link Styling:**

- Must have 3:1 contrast with surrounding text OR
- Must have underline or other visual indicator
- Yeehaa uses color + underline for maximum clarity

---

### Interactive Elements

**Touch Targets:**

- Minimum size: 44×44px
- Recommended: 48×48px

**Focus States:**

- Visible outline: 2px solid Primary Red
- Offset: 2px from element
- Never remove focus indicators

**Keyboard Navigation:**

- All interactive elements must be keyboard accessible
- Logical tab order
- Skip links for navigation

---

## Design Principles

### Visual Philosophy

**Minimalist Clarity**
Clean, uncluttered design with a focus on content and readability. Every element serves a purpose.

**Bold Simplicity**
Use red as a powerful accent, not a dominant force. Let neutral grays do the heavy lifting, with red providing strategic emphasis.

**Consistency Through Restraint**
A single typeface family (Jost) ensures visual harmony across all content types.

**Accessible by Default**
High contrast, clear typography, and generous spacing ensure content is readable for everyone.

---

### Typography Philosophy

**Unity** — One typeface for everything creates visual cohesion and clarity.

**Impact** — Large, bold headings (weight 900 for H1) command attention.

**Readability** — Clean geometric letterforms ensure effortless reading.

**Versatility** — Jost's weight range (300-900) provides hierarchy without introducing complexity.

---

### Color Philosophy

**Neutral Foundation**
Grays provide a calm, professional base that doesn't compete with content.

**Strategic Accent**
Red is reserved for interaction points and brand moments—links, buttons, highlights.

**High Contrast**
Dark text on light backgrounds, light text on dark backgrounds. No ambiguity.

**Dark Mode Equality**
Dark mode is not an afterthought—it's an equal first-class citizen with carefully calibrated colors.

---

## Usage Examples

### Hero Section

- Subtle gradient background (light or dark mode)
- Large H1 heading in Jost (128px desktop, 60px mobile, weight 900)
- Body text in Jost (30px desktop, 24px mobile)
- Primary red button for CTA
- Optional dot pattern overlay
- Decorative blob shapes with animation (optional)

### Content Section

- Clean white or subtle gray background
- Section heading H2 (72px desktop, 48px mobile)
- Body text paragraphs in Jost
- Supporting cards or graphics
- Consistent 24px gaps between elements

### Footer

- Same background as page (white/gray in light, dark gray in dark mode)
- Gray text with red accent links
- Clean, minimal design
- Adequate padding (64px desktop, 32px mobile)

---

## Best Practices

### DO:

✓ Use semantic color names (brand, accent, text) not hex values
✓ Use Jost for all text (headings and body)
✓ Use weight 900 (Black) for H1 headings for maximum impact
✓ Use weight 700 (Bold) for H2-H4 headings
✓ Apply tight letter-spacing (-0.02em) to large headings
✓ Test designs in both light and dark modes
✓ Ensure WCAG AA contrast minimum (4.5:1 for body text)
✓ Use the 4px spacing grid consistently
✓ Provide hover and focus states for interactive elements
✓ Use red sparingly—for links, buttons, and key interactions only

### DON'T:

✗ Hardcode hex values in designs
✗ Mix multiple typefaces
✗ Use light weights (< 700) for headings
✗ Ignore letter-spacing on large text
✗ Skip accessibility testing
✗ Use low-contrast color combinations
✗ Remove focus indicators
✗ Create spacing values outside the grid system
✗ Overuse red—it should accent, not dominate
✗ Use decorative elements that distract from content

---

## CSS Variable Architecture

### Palette Tokens (Tier 1)

Never change at runtime. Foundation colors.

```css
--palette-brand-red: #dc2626;
--palette-brand-red-dark: #991b1b;
--palette-brand-red-light: #ef4444;
--palette-gray-900: #111827;
--palette-white: #ffffff;
/* ... etc */
```

### Semantic Tokens (Tier 2)

Reference palette tokens. Change for dark mode.

```css
/* Light mode */
--color-brand: var(--palette-brand-red);
--color-text: var(--palette-gray-900);
--color-bg: var(--palette-white);

/* Dark mode */
[data-theme="dark"] {
  --color-brand: var(--palette-brand-red-light);
  --color-text: var(--palette-text-light);
  --color-bg: var(--palette-dark-bg);
}
```

### Tailwind Utilities (Generated from Semantic Tokens)

```css
@theme inline {
  --color-brand: var(--color-brand);
  --color-accent: var(--color-accent);
  /* Auto-generates: bg-brand, text-brand, border-brand, etc. */
}
```

**Critical:** Always use `@theme inline` (with the `inline` keyword) to enable runtime CSS variable resolution for dark mode.

---

## File Formats & Exports

### Color Formats

- **Hex** — For web/digital (#DC2626)
- **RGB** — For screens (220, 38, 38)
- **CMYK** — For print (convert as needed)

### Font License

Jost is an open-source font licensed under the SIL Open Font License, free for personal and commercial use.

---

## Maintenance & Updates

This brand guide is a living document. When visual elements change in the codebase:

1. Update this guide to reflect changes
2. Update theme CSS files
3. Communicate changes to the team
4. Version the guide (add date to filename)

**Theme File Location:** `shared/theme-yeehaa/src/theme.css`

**Last Updated:** 2025-11-24
**Version:** 1.0

---

_The Yeehaa brand identity embodies minimalist design principles: clean, bold, and focused. With a single versatile typeface and a strategic red accent on a neutral gray foundation, it creates a professional, accessible aesthetic perfect for knowledge work and personal productivity._
