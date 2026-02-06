# Plan: Three Theme Variations for Professional Brain

## Context

The professional-brain currently uses `@brains/theme-yeehaa` (Jost font, red/neutral palette). The user wants to prototype three genuinely different aesthetic directions as separate theme packages, build the site with each, and compare before choosing one.

Each theme must be a **distinctive design experience** — not just a font/color swap. They should differ in typography scale, spatial rhythm, background textures, animations, heading treatments, prose styling, and overall personality.

## Approach

### Step 1: Create three theme packages

Each package follows the identical scaffold structure (copying from `shared/theme-yeehaa/`), differing only in `theme.css`:

```
shared/theme-editorial/       # Variation A: Literary magazine aesthetic
shared/theme-geometric/       # Variation B: Precise, tech-forward geometric
shared/theme-warm-minimal/    # Variation C: Organic, nature-inspired calm
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

**Shared files** (identical across all three, copied from theme-yeehaa):

- `package.json` — only `name` and `description` differ
- `tsconfig.json` — identical
- `src/index.ts` — identical
- `src/types.d.ts` — identical

**Unique file** per theme: `src/theme.css`

Each `theme.css` must implement the full CSS variable contract AND express a distinct aesthetic through the following dimensions:

1. **Font imports** — distinctive Google Fonts pairings (display + body)
2. **Palette tokens** (`--palette-*`) — cohesive color system
3. **Semantic tokens** (`--color-*`) + dark mode overrides
4. **Typography scale** — different sizes, weights, letter-spacing, and rhythm per theme
5. **`@theme inline` block** — expose tokens to Tailwind
6. **Manual utilities** (`.bg-theme`, `.text-theme`, etc.)
7. **Heading treatments** — each theme styles headings uniquely (text-transform, letter-spacing, decorative elements)
8. **Background patterns** — different hero/CTA patterns (editorial lines vs geometric grid vs organic grain)
9. **Animations** — theme-appropriate motion (elegant reveal vs sharp snap vs gentle breathe)
10. **Prose styles** — different reading experiences (magazine-style vs technical precision vs relaxed organic)
11. **Selection highlighting** — themed highlight colors
12. **Focus and interaction styles** — ring colors, hover transitions

### Step 2: Add all three as dependencies

**File:** `apps/professional-brain/package.json`

- Add: `"@brains/theme-editorial": "workspace:*"`
- Add: `"@brains/theme-geometric": "workspace:*"`
- Add: `"@brains/theme-warm-minimal": "workspace:*"`

Run `bun install` to register all workspace packages.

### Step 3: Build each variation

**File:** `apps/professional-brain/brain.config.ts`

For each variation, swap the theme import and rebuild:

```typescript
// Variation A
import professionalTheme from "@brains/theme-editorial";
// Variation B
import professionalTheme from "@brains/theme-geometric";
// Variation C
import professionalTheme from "@brains/theme-warm-minimal";
```

Build each and save the output for comparison. The site output goes to `dist/site-preview/`.

### Theme Specifications

#### A: Editorial — "The Literary Magazine"

**Concept:** High-end literary magazine. Think Monocle meets The Paris Review. Refined, confident, quietly luxurious.

- **Fonts:** Instrument Serif (headings — elegant, high contrast) + Inter Tight (body — crisp, modern complement)
- **Light:** cream `#FAF7F2` bg, ink `#1a1a1a` text, terracotta `#C2533A` accent, stone `#8C8377` muted
- **Dark:** charcoal `#141413` bg, warm white `#EDEBE7` text, lighter terracotta accent
- **Typography scale:** Large serif headings with tight negative tracking (-0.03em). Generous line-height on body (1.8). Refined, readable.
- **Heading treatment:** h1/h2 in serif italic or bold serif. h3+ in small-caps with wide letter-spacing. Decorative thin horizontal rules between sections.
- **Background pattern:** Subtle diagonal hairlines at 45deg — editorial print feel, not dots.
- **Animations:** Elegant fade-up reveals with ease-out timing. No blob — a slow, graceful parallax drift instead.
- **Prose:** Magazine-style with slightly larger body text, generous margins, clear typographic hierarchy. Blockquote styled with a thin left terracotta border and italic serif.
- **Selection:** Terracotta highlight with cream text.
- **Memorable detail:** Thin decorative rules, serif italic headings, and the cream-to-warm gradient give it a printed-on-fine-paper quality.

#### B: Sharp Geometric — "The Precision Machine"

**Concept:** Tech-forward, Stripe/Linear-inspired but bolder. Geometric precision, confident negative space, electric accents.

- **Fonts:** General Sans (headings 600–700, body 400) — clean geometric with personality
- **Light:** cool white `#FAFAFA` bg, near-black `#0C0C0C` text, electric indigo `#4F39F6` accent, zinc `#71717A` muted
- **Dark:** true black `#09090B` bg, zinc-100 `#F4F4F5` text, brighter indigo `#6366F1` accent
- **Typography scale:** Tighter, more compact headings. h1 uses heavy weight (800) with very tight tracking (-0.04em). Smaller body text with precise 1.6 line-height.
- **Heading treatment:** h1/h2 all-uppercase with extreme tight letter-spacing. h3+ medium weight, sentence case. Sharp, mechanical hierarchy.
- **Background pattern:** Fine geometric grid lines (cross-hatch) — not dots. Subtle, precise, engineered.
- **Animations:** Snappy, fast transitions (200ms). Sharp scale-up on hover. A geometric rotation animation instead of blob — precise, mechanical motion.
- **Prose:** Technical documentation feel — tighter spacing, monospace code blocks with indigo-tinted backgrounds, sharp borders on blockquotes.
- **Selection:** Electric indigo highlight with white text.
- **Memorable detail:** The all-caps headings, geometric grid pattern, and electric indigo accents against near-black create an unmistakable precision-engineered feel.

#### C: Warm Minimal — "The Quiet Garden"

**Concept:** Kinfolk/Cereal magazine meets Japanese minimalism. Natural, unhurried, deeply calming. Generous space, organic rhythm.

- **Fonts:** Sora (headings — geometric but soft) + Source Sans 3 (body — neutral, highly readable)
- **Light:** linen `#F5F0E8` bg, dark olive `#2D3227` text, forest `#3D6B50` accent, sage `#8A9A7B` muted
- **Dark:** deep green-black `#121814` bg, linen `#E8E3DB` text, lighter forest `#5A9E72` accent
- **Typography scale:** Generous, breathing. Moderate heading sizes with wide letter-spacing (+0.05em on h3+). Very generous body line-height (1.85). Everything feels spacious.
- **Heading treatment:** Medium weight (500), generous letter-spacing, sentence case. h1 slightly larger but never shouting. Calm, balanced hierarchy.
- **Background pattern:** Subtle noise/grain texture overlay — organic, natural feel. No geometric shapes.
- **Animations:** Slow, gentle breathing animation (10s cycle). Soft fade-ins with long duration (600ms). Everything moves like it's in no rush.
- **Prose:** Relaxed reading pace — generous paragraph spacing, slightly wider measure. Blockquotes with a soft sage left border and extra padding. Natural, book-like reading experience.
- **Selection:** Forest green highlight with linen text.
- **Memorable detail:** The grain texture, breathing animation, and generous whitespace create a sense of calm you can feel. It's the theme equivalent of a deep breath.

## Key files

| File                                        | Action                              |
| ------------------------------------------- | ----------------------------------- |
| `shared/theme-editorial/` (full package)    | Create                              |
| `shared/theme-geometric/` (full package)    | Create                              |
| `shared/theme-warm-minimal/` (full package) | Create                              |
| `apps/professional-brain/package.json`      | Modify (add 3 deps)                 |
| `apps/professional-brain/brain.config.ts`   | Modify (swap imports to build each) |

## Verification

```bash
bun install
bun run typecheck
bun run lint

# Build with each theme (swap import in brain.config.ts between builds)
cd apps/professional-brain && bun run build
# Preview dist/site-preview/index.html
```
