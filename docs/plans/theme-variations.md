# Plan: Five Theme Variations for Professional Brain

## Context

The professional-brain currently uses `@brains/theme-yeehaa` (Jost font, red/neutral palette). The goal is to prototype five genuinely different aesthetic directions as separate theme packages, build the site with each, and compare before choosing one.

Each theme must be a **distinctive design experience** — not just a font/color swap. They differ in typography scale, spatial rhythm, background textures, animations, heading treatments, prose styling, and overall personality.

## Approach

### Step 1: Create five theme packages

Each package follows the identical scaffold structure (copying from `shared/theme-yeehaa/`), differing only in `theme.css`:

```
shared/theme-editorial/       # A: Literary magazine — refined, serif, warm
shared/theme-swiss/           # B: International style — disciplined, grid, bold accent
shared/theme-geometric/       # C: Precision machine — tech-forward, indigo, sharp
shared/theme-neo-retro/       # D: Warm analog — rounded, nostalgic, friendly
shared/theme-brutalist/       # E: The statement — dark-first, raw, monospace
```

Each contains:

```
├── package.json          # @brains/theme-{name}
├── tsconfig.json         # Extends @brains/typescript-config/base.json
├── src/
│   ├── index.ts          # Same export pattern (themeCSS + customizeTheme)
│   ├── types.d.ts        # Same CSS module declaration
│   └── theme.css         # Unique theme design
```

**Shared files** (identical across all five, copied from theme-yeehaa):

- `package.json` — only `name` and `description` differ
- `tsconfig.json` — identical
- `src/index.ts` — identical
- `src/types.d.ts` — identical

**Unique file** per theme: `src/theme.css`

Each `theme.css` must implement the full CSS variable contract AND express a distinct aesthetic:

1. **Font imports** — distinctive Google Fonts pairings (display + body)
2. **Palette tokens** (`--palette-*`) — cohesive color system
3. **Semantic tokens** (`--color-*`) + dark mode overrides
4. **Typography scale** — different sizes, weights, letter-spacing, and rhythm
5. **`@theme inline` block** — expose tokens to Tailwind
6. **Manual utilities** (`.bg-theme`, `.text-theme`, etc.)
7. **Heading treatments** — unique per theme (text-transform, tracking, decorative elements)
8. **Background patterns** — editorial lines vs grid vs grain vs paper texture vs scan lines
9. **Animations** — theme-appropriate motion personality
10. **Prose styles** — different reading experiences
11. **Selection highlighting** — themed highlight colors
12. **Focus and interaction styles** — ring colors, hover transitions

### Step 2: Add all five as dependencies

**File:** `apps/professional-brain/package.json`

- Add: `"@brains/theme-editorial": "workspace:*"`
- Add: `"@brains/theme-swiss": "workspace:*"`
- Add: `"@brains/theme-geometric": "workspace:*"`
- Add: `"@brains/theme-neo-retro": "workspace:*"`
- Add: `"@brains/theme-brutalist": "workspace:*"`

Run `bun install` to register all workspace packages.

### Step 3: Build each variation

**File:** `apps/professional-brain/brain.config.ts`

For each variation, swap the theme import and rebuild:

```typescript
import professionalTheme from "@brains/theme-editorial"; // A
import professionalTheme from "@brains/theme-swiss"; // B
import professionalTheme from "@brains/theme-geometric"; // C
import professionalTheme from "@brains/theme-neo-retro"; // D
import professionalTheme from "@brains/theme-brutalist"; // E
```

Build each and save the output for comparison. The site output goes to `dist/site-preview/`.

---

## Theme Specifications

### A: Editorial — "The Literary Magazine"

**Concept:** High-end literary magazine. Think Monocle meets The Paris Review. Refined, confident, quietly luxurious.

- **Fonts:** Instrument Serif (headings — elegant, high contrast) + Inter Tight (body — crisp, modern complement)
- **Light:** cream `#FAF7F2` bg, ink `#1a1a1a` text, terracotta `#C2533A` accent, stone `#8C8377` muted
- **Dark:** charcoal `#141413` bg, warm white `#EDEBE7` text, lighter terracotta `#D4654E` accent
- **Typography scale:** Large serif headings with tight negative tracking (-0.03em). Generous line-height on body (1.8). Refined, readable.
- **Heading treatment:** h1/h2 in bold serif with negative tracking. h3+ in small-caps with wide letter-spacing. Decorative thin horizontal rules between sections.
- **Background pattern:** Subtle diagonal hairlines at 45deg — editorial print feel, not dots.
- **Animations:** Elegant fade-up reveals with ease-out timing. No blob — a slow, graceful drift animation instead (12s cycle).
- **Prose:** Magazine-style with slightly larger body text, generous margins. Blockquotes with a thin left terracotta border and italic serif.
- **Selection:** Terracotta highlight with cream text.
- **Memorable detail:** The cream background, serif headings, and thin rules give it a printed-on-fine-paper quality.

### B: Swiss/International — "The Confident Grid"

**Concept:** International Typographic Style. Disciplined, timeless, supremely confident. The design says nothing unnecessary — and that's the point.

- **Fonts:** Schibsted Grotesk (one family for everything — headings 700, body 400) — proper neo-grotesque with Swiss DNA
- **Light:** pure white `#FFFFFF` bg, near-black `#0F0F0F` text, vermillion `#E63312` accent, medium gray `#737373` muted
- **Dark:** near-black `#0F0F0F` bg, white `#FAFAFA` text, brighter vermillion `#FF4422` accent
- **Typography scale:** Strict modular scale. h1 bold at large size but never excessive. Body at comfortable reading size with 1.65 line-height. Everything precisely measured.
- **Heading treatment:** h1 in bold, sentence case, tight tracking (-0.02em). h3+ uppercase with very wide letter-spacing (+0.12em) — classic Swiss treatment. Clean hierarchy through weight and spacing alone.
- **Background pattern:** None. Pure negative space. The grid is implied, not drawn.
- **Animations:** Minimal — sharp, fast fades (150ms). Motion is functional, never decorative. No blob, no drift.
- **Prose:** Clean, precise. Generous whitespace between paragraphs. Blockquotes with a thick left vermillion bar. No ornament.
- **Selection:** Vermillion highlight with white text.
- **Memorable detail:** The radical simplicity. One font, one accent color, pure space. It's confident enough to say nothing extra.

### C: Sharp Geometric — "The Precision Machine"

**Concept:** Tech-forward, Stripe/Linear-inspired but bolder. Geometric precision, confident negative space, electric accents.

- **Fonts:** Syne (headings 700–800 — geometric, bold, distinctive) + DM Sans (body 400 — clean geometric complement)
- **Light:** cool white `#FAFAFA` bg, near-black `#0C0C0C` text, electric indigo `#4F39F6` accent, zinc `#71717A` muted
- **Dark:** true black `#09090B` bg, zinc-100 `#F4F4F5` text, brighter indigo `#6366F1` accent
- **Typography scale:** Tighter, more compact headings. h1 uses heavy weight (800) with very tight tracking (-0.04em). Precise 1.6 body line-height.
- **Heading treatment:** h1/h2 all-uppercase with extreme tight letter-spacing. h3+ medium weight, sentence case. Sharp, mechanical hierarchy.
- **Background pattern:** Fine geometric cross-hatch grid lines. Subtle, precise, engineered.
- **Animations:** Snappy, fast transitions (200ms). Sharp scale-up on hover. A geometric rotation animation (8s) — precise, mechanical.
- **Prose:** Technical documentation feel — tighter spacing, monospace code blocks with indigo-tinted backgrounds, sharp borders on blockquotes.
- **Selection:** Electric indigo highlight with white text.
- **Memorable detail:** The all-caps headings, geometric grid, and electric indigo create an unmistakable engineered precision.

### D: Neo-Retro — "The Warm Analog"

**Concept:** Warm, analog, nostalgic but modern. Like a well-designed poster from a studio that appreciates craft. Approachable without being childish.

- **Fonts:** Bricolage Grotesque (headings — warm, slightly quirky, characterful) + Libre Franklin (body — classic, readable, quietly retro)
- **Light:** warm cream `#FDF6EC` bg, espresso `#2C1810` text, coral `#E8735A` accent, dusty teal `#5B8A8A` secondary/muted
- **Dark:** deep brown-black `#1A1210` bg, warm cream `#F5EDE0` text, lighter coral `#F09880` accent
- **Typography scale:** Friendly, slightly large. h1 bold with moderate tracking. Generous body text at 1.75 line-height. Everything feels warm and inviting.
- **Heading treatment:** h1/h2 bold with slight negative tracking (-0.01em). h3+ regular weight with gentle letter-spacing. No uppercase — everything sentence case, approachable.
- **Background pattern:** Subtle paper/noise grain texture overlay — analog, tactile feel. Like looking at nice stationery.
- **Animations:** Soft, bouncy easing (ease-in-out with slight overshoot feel). Gentle 500ms fades. A slow drift animation (14s) with subtle scale breathing.
- **Prose:** Warm reading experience — generous paragraph spacing, slightly larger body text. Blockquotes with a rounded left coral border and warm-tinted background. Inviting.
- **Selection:** Coral highlight with cream text.
- **Memorable detail:** The paper grain texture, warm colors, and Bricolage Grotesque headings create something that feels handcrafted and genuine. It's the theme that makes you want to read.

### E: Dark Brutalist — "The Statement"

**Concept:** Unapologetic, bold, raw. Dark-first, monospace headings, high contrast. This is a portfolio that says "I don't follow trends — I set them."

- **Fonts:** Space Mono (headings — raw, brutalist monospace) + Work Sans (body 400 — clean, neutral, lets mono dominate)
- **Light:** off-white `#F0F0F0` bg, near-black `#0A0A0A` text, neon green `#00FF66` accent, dark gray `#555555` muted
- **Dark (default):** near-black `#0A0A0A` bg, off-white `#E0E0E0` text, neon green `#00FF66` accent, gray `#666666` muted
- **Typography scale:** Compact and dense. h1 at moderate size but ALL CAPS monospace with wide letter-spacing (+0.08em) — creates tension. Body at standard size, 1.6 line-height. Efficient.
- **Heading treatment:** ALL CAPS on all headings. Monospace throughout. Wide letter-spacing on h1/h2, tighter on h3+. Raw, industrial hierarchy.
- **Background pattern:** Subtle horizontal scan lines (1px lines every 4px at very low opacity) — CRT/terminal aesthetic.
- **Animations:** Harsh, instant transitions (100ms). No organic motion. A glitch-style animation — small random translate jitter on hover. Everything is intentionally raw.
- **Prose:** Dense, no-nonsense. Tighter paragraph spacing. Monospace code blocks that feel native to the design. Blockquotes with a thick neon-green left border, no background. Raw.
- **Selection:** Neon green highlight with black text.
- **Memorable detail:** The monospace headings, neon green accents, and scan lines make this unmistakable. You remember this site because it refused to look like everyone else.

---

## Key files

| File                                      | Action                              |
| ----------------------------------------- | ----------------------------------- |
| `shared/theme-editorial/` (full package)  | Create                              |
| `shared/theme-swiss/` (full package)      | Create                              |
| `shared/theme-geometric/` (full package)  | Create                              |
| `shared/theme-neo-retro/` (full package)  | Create                              |
| `shared/theme-brutalist/` (full package)  | Create                              |
| `apps/professional-brain/package.json`    | Modify (add 5 deps)                 |
| `apps/professional-brain/brain.config.ts` | Modify (swap imports to build each) |

## Verification

```bash
bun install
bun run typecheck
bun run lint

# Build with each theme (swap import in brain.config.ts between builds)
cd apps/professional-brain && bun run build
# Preview dist/site-preview/index.html
```
