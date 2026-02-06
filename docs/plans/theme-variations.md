# Plan: Three Theme Variations for Professional Brain

## Context

The professional-brain currently uses `@brains/theme-yeehaa` (Jost font, red/neutral palette). The user wants to prototype three different aesthetic directions as separate theme packages, build the site with each, and compare before choosing one.

## Approach

### Step 1: Create three theme packages

Each package follows the identical scaffold structure (copying from `shared/theme-yeehaa/`), differing only in `theme.css`:

```
shared/theme-editorial/       # Variation A: Serif, warm cream, terracotta
shared/theme-geometric/       # Variation B: Geometric sans, cool, electric indigo
shared/theme-warm-minimal/    # Variation C: Organic, linen, forest green
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

Each `theme.css` must implement the full CSS variable contract:

1. Font imports (Google Fonts)
2. Palette tokens (`--palette-*`)
3. Semantic tokens (`--color-*`) + dark mode overrides
4. `@theme inline` block
5. Manual utilities (`.bg-theme`, `.text-theme`, etc.)
6. Prose styles, component patterns, animations, focus rings, component utilities

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

#### A: Editorial

- **Fonts:** Instrument Serif (headings) + Inter Tight (body)
- **Light:** cream `#FAF7F2` bg, ink `#1a1a1a` text, terracotta `#C2533A` accent, stone `#8C8377` muted
- **Dark:** charcoal `#141413` bg, warm white `#EDEBE7` text, lighter terracotta accent

#### B: Sharp Geometric

- **Fonts:** General Sans (headings 600-700, body 400)
- **Light:** cool white `#FAFAFA` bg, near-black `#0C0C0C` text, electric indigo `#4F39F6` accent, zinc `#71717A` muted
- **Dark:** true black `#09090B` bg, zinc-100 `#F4F4F5` text, brighter indigo accent

#### C: Warm Minimal

- **Fonts:** Sora (headings) + Source Sans 3 (body)
- **Light:** linen `#F5F0E8` bg, dark olive `#2D3227` text, forest `#3D6B50` accent, sage `#8A9A7B` muted
- **Dark:** deep green-black `#121814` bg, linen `#E8E3DB` text, lighter forest accent

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
