# Plan: Layout Improvements for Professional Brain

## Context

The professional-site plugin templates use a generic vertical stack layout — same container widths, same section rhythm, same visual weight throughout. With 5 distinctive themes now in place, the layout itself needs to match that level of intentionality. The goal is to create spatial variety, visual hierarchy, and memorable composition using only theme-agnostic semantic classes.

## Changes

### 1. Homepage Hero — Two-Zone Asymmetric Composition

**File**: `plugins/professional-site/src/templates/homepage-list.tsx`

Split the hero into two visual zones: the tagline occupies a tall, wide canvas with tighter leading; the intro paragraph sits below with a right-side offset on desktop, creating a diagonal reading path.

- Tagline: `text-5xl md:text-7xl lg:text-8xl`, `leading-[1.05]`, `tracking-tight`, `max-w-5xl`
- Intro: `max-w-2xl`, `md:ml-auto md:text-right` (right-aligned on desktop, left on mobile)
- Separate padding zones: tagline gets `pt-24 md:pt-40 pb-8`, intro gets `pb-20 md:pb-32`

### 2. ContentSection — Add `variant` Prop

**File**: `shared/ui-library/src/ContentSection.tsx`

Add a `variant` prop with backward-compatible default:

- `"divided"` (default) — current 3-column grid with vertical divider
- `"stacked"` — title as a small uppercase overline (`text-sm tracking-widest text-theme-muted`) above content, with a top border. Used for the homepage About section.

### 3. ContentListItem — Add `featured` Prop

**File**: `shared/ui-library/src/ContentListItem.tsx`

Add optional `featured` boolean. When true, the title renders at `text-2xl md:text-3xl` instead of `text-lg`. ContentSection passes `featured={index === 0}` to the first item. This creates a "lead story" hierarchy within lists.

### 4. Homepage Section Rhythm — Varied Widths and Spacing

**File**: `plugins/professional-site/src/templates/homepage-list.tsx`

Break each section out of the single `max-w-4xl` container into individually-wrapped containers:

- **Essays**: `max-w-5xl`, `py-20 md:py-32` — primary content, widest
- **Presentations**: `max-w-4xl`, `py-12 md:py-20` — secondary, narrower
- **About**: `max-w-5xl`, `py-12 md:py-20`, variant `"stacked"` — distinct closer

Move the CTA section outside the content container so it can go full-width.

### 5. CTA Section — Full-Width Left-Aligned Redesign

**File**: `plugins/professional-site/src/components/CTASection.tsx`

Replace centered-text-with-border layout with a full-width section:

- Remove `text-center`, `border-t`, `mt-16`
- Add `bg-theme-subtle` background, `py-24 md:py-32` for presence
- Left-aligned with `max-w-4xl` inner container
- Overline label: `"Get in Touch"` in small uppercase tracking-widest
- Heading scaled to `text-3xl md:text-4xl lg:text-5xl`, constrained to `max-w-2xl`
- Button + social links in a horizontal flex row, left-aligned

### 6. About Page — Two-Zone Layout

**File**: `plugins/professional-site/src/templates/about.tsx`

Replace the uniform section stack with two visual zones:

- **Zone 1: Story** — full-width prose, no section heading (the content speaks for itself)
- **Zone 2: Structured grid** — `grid md:grid-cols-2 gap-x-16 gap-y-12` containing Expertise, Current Focus, Availability, and Contact
- Section labels change from large `text-2xl font-semibold` headings to small uppercase overlines (`text-sm tracking-widest text-theme-muted`) — these are metadata labels, not content headings

### 7. Scroll-Triggered Content Reveals

**Files**: All 5 theme CSS files + templates

Add `.content-section-reveal` class using CSS `animation-timeline: view()`:

```css
.content-section-reveal {
  animation: contentReveal [timing] both;
  animation-timeline: view();
  animation-range: entry 0% entry 30%;
}
```

Each theme defines `@keyframes contentReveal` per its personality:

- Editorial: `translateY(12px)` fade-up, 600ms ease-out
- Swiss: opacity-only, 400ms
- Geometric: `translateX(-20px)` slide-in, 500ms
- Neo-Retro: `translateY(8px)` gentle fade-up, 500ms ease-out
- Brutalist: instant appear, `steps(1)` 50ms

Apply to content section wrappers in homepage and about templates. Graceful degradation: browsers without support show content immediately.

## Key Files

| File                                                        | Change                              |
| ----------------------------------------------------------- | ----------------------------------- |
| `shared/ui-library/src/ContentSection.tsx`                  | Add `variant` prop                  |
| `shared/ui-library/src/ContentListItem.tsx`                 | Add `featured` prop                 |
| `plugins/professional-site/src/templates/homepage-list.tsx` | Hero, section rhythm, CTA placement |
| `plugins/professional-site/src/templates/about.tsx`         | Two-zone layout                     |
| `plugins/professional-site/src/components/CTASection.tsx`   | Full-width redesign                 |
| `shared/theme-editorial/src/theme.css`                      | `contentReveal` keyframe + class    |
| `shared/theme-swiss/src/theme.css`                          | `contentReveal` keyframe + class    |
| `shared/theme-geometric/src/theme.css`                      | `contentReveal` keyframe + class    |
| `shared/theme-neo-retro/src/theme.css`                      | `contentReveal` keyframe + class    |
| `shared/theme-brutalist/src/theme.css`                      | `contentReveal` keyframe + class    |

## Verification

```bash
bun run typecheck
bun run lint
cd apps/professional-brain && bun run build
# Preview dist/site-preview/index.html in browser
# Check: hero composition, section rhythm, CTA styling, about page grid
# Test with at least editorial, swiss, and brutalist themes
```
