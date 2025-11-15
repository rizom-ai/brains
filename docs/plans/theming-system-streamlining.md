# Theming System Streamlining Plan

**Status**: Planning
**Created**: 2025-01-12
**Updated**: 2025-01-12
**Priority**: High
**Complexity**: High

## Overview

This plan addresses inconsistencies in our theming system to create a standardized, maintainable Tailwind v4 design system that supports multi-site theming via CSS variables. **Critical finding**: Our current implementation misses Tailwind v4's most important theming feature—the `@theme` directive—which automatically generates utilities from CSS variables.

## Current State Analysis

### Architecture

**Theme Structure**:

- Theme packages: `shared/theme-default`, `shared/theme-yeehaa`
- Themes export CSS as strings via `import ... with { type: "text" }`
- Loaded in brain configs: `themeCSS: yeehaaTheme`
- Injected into site builder at build time

**CSS Processing Flow**:

```
Theme CSS → Site Builder → Tailwind v4 PostCSS → HTML output
```

**Tailwind v4 Usage**:

- `@tailwindcss/postcss` v4.1.13
- CSS-first configuration (no `tailwind.config.js` needed)
- `@plugin "@tailwindcss/typography"` for prose styling
- `@source` directive for content detection

**Current Theming Approach** (PROBLEMATIC):

- CSS custom properties defined in `:root`
- **Manual** utility classes in `@layer utilities` (200+ lines per theme!)
- Prose customization via manual `--tw-prose-*` variable setting
- Dark mode via `[data-theme="dark"]` attribute selector

### What's Working Well

✅ **Theme Package Structure**: Clean separation of themes as npm packages
✅ **CSS Variable Foundation**: Semantic naming (`--color-text`, `--color-brand`)
✅ **Dark Mode Implementation**: Attribute-based switching works smoothly
✅ **Typography Plugin Integration**: Properly loaded via `@plugin` directive
✅ **Multi-Site Support**: Different brains can use different themes

### Critical Problem: Missing `@theme` Directive

**The Issue**: Both themes manually define 200+ utility classes like this:

```css
@layer utilities {
  .bg-brand {
    background-color: var(--color-brand);
  }
  .text-brand {
    color: var(--color-brand);
  }
  .border-brand {
    border-color: var(--color-brand);
  }
  .bg-accent {
    background-color: var(--color-accent);
  }
  .text-accent {
    color: var(--color-accent);
  }
  .border-accent {
    border-color: var(--color-accent);
  }
  /* ...190+ more manual definitions! */
}
```

**This is v3-style theming with v4 tooling.** Tailwind v4's `@theme` directive automatically generates all these utilities from CSS variables.

**Proper v4 approach**:

```css
@theme inline {
  --color-brand: var(--runtime-brand);
  --color-accent: var(--runtime-accent);
}

/* Tailwind automatically generates:
   bg-brand, text-brand, border-brand, ring-brand,
   bg-accent, text-accent, border-accent, ring-accent,
   ...and all other color utilities! */
```

**Impact**:

- ❌ 200+ lines of redundant boilerplate per theme
- ❌ No IDE autocomplete for theme utilities
- ❌ Error-prone (easy to miss a utility)
- ❌ Harder to maintain
- ❌ Doesn't leverage v4's design token features

## Problems Identified

### 1. Manual Utility Definitions (CRITICAL)

**Current approach** (both themes):

- Lines 151-263 in `theme-default/src/theme.css`: Manual utility definitions
- Lines 168-333 in `theme-yeehaa/src/theme.css`: Manual utility definitions
- Every color utility manually defined: `bg-*`, `text-*`, `border-*`, etc.

**Why this is wrong**: Tailwind v4's `@theme` directive does this automatically!

### 2. Prose Heading Colors Not Applying

**Issue**: Hacky workaround in `theme-yeehaa/src/theme.css` (lines 231-239):

```css
/* Override prose heading colors to match body text */
article.prose h1,
article.prose h2,
article.prose h3,
article.prose h4,
article.prose h5,
article.prose h6 {
  color: inherit;
}
```

**Root cause**: Prose variables defined in `:root` but not properly exposed via `@theme`, causing typography plugin to use defaults instead of theme colors.

### 3. Inconsistent Component Styling

**Components using theme variables (GOOD)**:

- `Card.tsx`: Uses `bg-theme-subtle`, `border-theme`, `text-theme`
- `EmptyState.tsx`: Uses `text-theme-muted`
- `LinkButton.tsx`: Uses `bg-brand`, `bg-accent`, `text-theme-inverse`

**Components using hardcoded colors (BAD)**:

- `Button.tsx`: Uses `bg-blue-500 hover:bg-blue-700` (hardcoded blue!)
- `ThemeToggle.tsx`: Uses `bg-gray-200`, `bg-gray-800`, `text-gray-800` (hardcoded grays!)

**Impact**: These components don't adapt to theme changes.

### 4. Typography Scale Mismatch

**Theme defines scale** (unused dead code):

```css
--text-h1: 8rem; /* 128px Desktop */
--text-h2: 4.5rem; /* 72px Desktop */
--text-h3: 3rem; /* 48px Desktop */
```

**Components use different sizes**:

```tsx
prose-h1:text-4xl  /* 2.25rem = 36px */
```

**Impact**: Inconsistent typography, unused variables clutter theme files.

### 5. Footer Theme Toggle Visibility

**Issue**: Theme toggle uses semi-transparent white backgrounds (`bg-white/20`) which are invisible on white/yellow backgrounds.

**Current workaround** (theme-specific hacks):

```css
.bg-footer button[aria-label="Toggle dark mode"] {
  background-color: var(--palette-black) !important;
  color: var(--palette-white) !important;
}
```

**Impact**: Requires `!important` hacks instead of proper theming.

## Tailwind v4 Design System Best Practices

### The Proper v4 Pattern

**Our Current Setup (Already Good!)**:

We already have a 2-tier hierarchy that works:

```css
/* ===== TIER 1: PALETTE TOKENS ===== */
/* Pure color values - Foundation layer */
:root {
  --palette-brand-blue: #3921d7;
  --palette-orange: #e7640a;
  --palette-white: #ffffff;
}

/* ===== TIER 2: SEMANTIC TOKENS ===== */
/* Dynamic values that change with theme/mode */
:root {
  --color-brand: var(--palette-brand-blue);
  --color-accent: var(--palette-orange);
  --color-text: var(--palette-gray-900);
  --color-bg: var(--palette-white);
}

[data-theme="dark"] {
  --color-brand: var(--palette-orange); /* Changes at runtime! */
  --color-accent: var(--palette-blue-500);
  --color-text: var(--palette-white);
  --color-bg: var(--palette-gray-900);
}

/* ===== NEW: EXPOSE TO TAILWIND ===== */
/* Reference existing --color-* variables */
@theme inline {
  --color-brand: var(--color-brand);
  --color-accent: var(--color-accent);
  --color-text: var(--color-text);
  --color-bg: var(--color-bg);
  /* ...all other semantic colors */
}

/* ===== RESULT ===== */
/* Tailwind automatically generates:
   bg-brand, text-brand, border-brand, ring-brand, divide-brand,
   bg-accent, text-accent, border-accent, ring-accent, divide-accent,
   bg-text, text-text, border-text, ring-text, divide-text,
   bg-bg, text-bg, border-bg, ring-bg, divide-bg,
   ...and more! No manual definitions needed! */
```

**Key Insight**: We don't need to rename anything! Our existing `--color-*` variables already change at runtime via `[data-theme="dark"]`. We just need to expose them to Tailwind via `@theme inline`.

### Why `@theme inline`?

The `inline` keyword tells Tailwind to resolve CSS variable values at **runtime** (when the page loads) rather than at **build time**. This is essential for:

1. **Dark mode switching**: Variables change when `[data-theme]` attribute changes
2. **Multi-site theming**: Different sites can override `--color-*` variables
3. **Dynamic theming**: JavaScript can change theme colors at runtime

### What Gets Generated Automatically

When you use `@theme inline { --color-brand: var(...); }`, Tailwind generates:

- `bg-brand`, `bg-brand/50`, `bg-brand/75`, etc. (background with opacity)
- `text-brand`, `text-brand/90`, etc. (text color)
- `border-brand`, `border-brand/20`, etc. (borders)
- `ring-brand`, `ring-brand/50`, etc. (focus rings)
- `divide-brand` (divider colors)
- `outline-brand` (outlines)
- `accent-brand` (form accents)
- ...and more!

**No manual utility definitions needed!**

### ✅ Correct v4 Patterns

1. **CSS-First Configuration**: Use `@plugin`, `@theme`, `@source` directives in CSS
2. **`@theme inline` for Runtime Values**: Use for colors that change with theme/mode
3. **Token Hierarchy**: Palette → Semantic (our existing `--color-*` variables)
4. **Semantic Variables**: Use meaningful names (`--color-brand`, not `--blue-500`)
5. **Dark Mode**: Use attribute selectors like `[data-theme="dark"]` to change semantic tokens

### ❌ v3 Patterns to Avoid

1. **Manual Utility Definitions**: Don't write `.bg-brand { background: var(--color-brand); }` manually
2. **JavaScript Config**: Don't use `tailwind.config.js` for theming (v4 is CSS-first)
3. **Theme Extend Object**: Don't configure colors via `theme.extend.colors`
4. **Plugin Arrays**: Don't add plugins in config, use `@plugin` directive

## Recommended Solutions

### Solution 0: Adopt `@theme inline` Pattern (CRITICAL)

**Approach**: Restructure themes to use Tailwind v4's `@theme` directive for automatic utility generation.

**Implementation** (example for `theme-default`):

```css
@import "tailwindcss";
@plugin "@tailwindcss/typography";

/* ===== PALETTE TOKENS ===== */
:root {
  /* Blues */
  --palette-brand-blue: #3921d7;
  --palette-brand-blue-dark-1: #2e007d;
  --palette-brand-blue-dark-2: #0e0027;

  /* Oranges */
  --palette-orange: #e7640a;
  --palette-orange-dark: #c2410c;

  /* Neutrals */
  --palette-white: #ffffff;
  --palette-warm-white: #fffcf6;
  --palette-gray-border: #e2e8f0;

  /* Dark mode neutrals */
  --palette-dark-bg: #0f1114;
  --palette-text-light: #f7fafc;
  --palette-text-muted-dark: #a0aec0;
}

/* ===== RUNTIME SEMANTIC TOKENS ===== */
:root {
  /* Brand/Accent */
  --runtime-brand: var(--palette-brand-blue);
  --runtime-brand-dark: var(--palette-brand-blue-dark-1);
  --runtime-accent: var(--palette-orange);
  --runtime-accent-dark: var(--palette-orange-dark);

  /* Text */
  --runtime-text: var(--palette-brand-blue-dark-2);
  --runtime-text-muted: var(--palette-brand-blue-dark-1);
  --runtime-text-inverse: var(--palette-white);

  /* Backgrounds */
  --runtime-bg: var(--palette-white);
  --runtime-bg-subtle: var(--palette-warm-white);

  /* Borders */
  --runtime-border: var(--palette-gray-border);
}

[data-theme="dark"] {
  /* Brand/Accent (same in dark mode for this theme) */
  --runtime-brand: var(--palette-brand-blue);
  --runtime-brand-dark: var(--palette-brand-blue-dark-1);
  --runtime-accent: var(--palette-orange);
  --runtime-accent-dark: var(--palette-orange-dark);

  /* Text */
  --runtime-text: var(--palette-text-light);
  --runtime-text-muted: var(--palette-text-muted-dark);
  --runtime-text-inverse: var(--palette-brand-blue-dark-2);

  /* Backgrounds */
  --runtime-bg: var(--palette-dark-bg);
  --runtime-bg-subtle: var(--palette-dark-bg);

  /* Borders */
  --runtime-border: rgba(255, 255, 255, 0.1);
}

/* ===== THEME TOKENS (EXPOSED TO TAILWIND) ===== */
@theme inline {
  /* Brand Colors - generates bg-brand, text-brand, border-brand, etc. */
  --color-brand: var(--runtime-brand);
  --color-brand-dark: var(--runtime-brand-dark);
  --color-accent: var(--runtime-accent);
  --color-accent-dark: var(--runtime-accent-dark);

  /* Text Colors - generates text-theme, text-theme-muted, etc. */
  --color-theme: var(--runtime-text);
  --color-theme-muted: var(--runtime-text-muted);
  --color-theme-inverse: var(--runtime-text-inverse);

  /* Background Colors - generates bg-theme, bg-theme-subtle, etc. */
  --color-bg-theme: var(--runtime-bg);
  --color-bg-theme-subtle: var(--runtime-bg-subtle);

  /* Border Colors - generates border-theme, etc. */
  --color-border-theme: var(--runtime-border);

  /* Prose Colors - for typography plugin */
  --color-prose-headings: var(--runtime-text);
  --color-prose-body: var(--runtime-text);
  --color-prose-links: var(--runtime-brand);
  --color-prose-bold: var(--runtime-text);
  --color-prose-code: var(--runtime-text);
}

/* ===== SPECIAL UTILITIES (NOT AUTO-GENERATED) ===== */
@layer utilities {
  /* Gradients (can't be auto-generated from single colors) */
  .bg-theme-gradient {
    background: linear-gradient(
      181deg,
      var(--palette-white) -5.4%,
      var(--palette-warm-white) 73.01%,
      var(--palette-warm-beige) 89.61%,
      var(--palette-light-blue) 150%
    );
  }

  /* Footer-specific overrides (if needed) */
  .bg-footer button[aria-label="Toggle dark mode"]:hover {
    background-color: var(--runtime-brand);
  }
}
```

**What this achieves**:

- ✅ 200+ utility class definitions → **0 manual definitions** (auto-generated!)
- ✅ IDE autocomplete works for theme utilities
- ✅ Easy to add new colors (just add to `@theme inline`)
- ✅ Clear separation: Palette → Runtime → Theme
- ✅ Proper dark mode support
- ✅ Multi-site theming support

### Solution 1: Fix Prose Heading Colors (via `@theme`)

**Approach**: Use `@theme inline` to expose prose colors to the typography plugin.

**Implementation**:

```css
@theme inline {
  /* Prose colors automatically picked up by typography plugin */
  --color-prose-headings: var(--runtime-text);
  --color-prose-body: var(--runtime-text);
  --color-prose-links: var(--runtime-brand);
  --color-prose-bold: var(--runtime-text);
  --color-prose-counters: var(--runtime-text-muted);
  --color-prose-bullets: var(--runtime-text-muted);
  --color-prose-hr: var(--runtime-border);
  --color-prose-quotes: var(--runtime-text-muted);
  --color-prose-quote-borders: var(--runtime-brand);
  --color-prose-captions: var(--runtime-text-muted);
  --color-prose-code: var(--runtime-text);
  --color-prose-pre-code: var(--runtime-text);
  --color-prose-pre-bg: var(--runtime-bg-subtle);
  --color-prose-th-borders: var(--runtime-border);
  --color-prose-td-borders: var(--runtime-border);
}
```

**Remove**:

- Hacky `article.prose h1 { color: inherit; }` override
- Manual prose styling in `@layer utilities`

### Solution 2: Standardize Component Colors

**Approach**: Replace all hardcoded Tailwind color utilities with theme-aware classes.

**Button.tsx changes**:

```tsx
// BEFORE
className = "px-4 py-2 bg-blue-500 hover:bg-blue-700 text-white rounded";

// AFTER
className = "px-4 py-2 bg-brand hover:bg-brand-dark text-theme-inverse rounded";
```

**ThemeToggle.tsx changes**:

```tsx
// BEFORE
const variantClasses = {
  default: "bg-white/20 hover:bg-white/30 text-white",
  light: "bg-gray-200 hover:bg-gray-300 text-gray-800",
  dark: "bg-gray-800 hover:bg-gray-700 text-white",
};

// AFTER
const variantClasses = {
  default: "bg-bg-theme-subtle hover:bg-bg-theme text-theme",
  light: "bg-bg-theme-subtle hover:bg-bg-theme text-theme",
  dark: "bg-bg-theme hover:bg-bg-theme-subtle text-theme-inverse",
};
```

### Solution 3: Typography Scale Cleanup

**Approach**: Remove unused typography scale variables.

**Action**: **DELETE** the following from both theme files:

```css
--text-h1: 8rem;
--text-h2: 4.5rem;
--text-h3: 3rem;
--text-h4: 1.875rem;
--text-body: 1.875rem;
--text-body-mobile: 1.5rem;
```

**Rationale**:

- Prose plugin handles content typography with its own scale
- Tailwind's default scale handles UI typography
- These variables are dead code (never referenced)

## Implementation Plan

### Phase 0: Add `@theme inline` and Delete Manual Utilities (CRITICAL - FIRST)

**Goal**: Adopt proper Tailwind v4 design token pattern using `@theme inline`.

**Tasks**:

1. **Update `shared/theme-default/src/theme.css`**:
   - Keep ALL existing palette and semantic tokens (no renaming!)
   - Add `@theme inline` section that references existing `--color-*` variables
   - **DELETE** entire `@layer utilities` section (lines 151-263)
   - Keep only special utilities (gradients, footer overrides, animations)

2. **Update `shared/theme-yeehaa/src/theme.css`**:
   - Same changes as theme-default
   - **DELETE** entire `@layer utilities` section (lines 168-333)
   - Keep only special utilities

3. **Verify utility generation**:
   - Build site and check generated CSS
   - Verify `bg-brand`, `text-theme`, etc. exist
   - Test IDE autocomplete

4. **Test multi-site theming**:
   - Verify professional-brain uses yeehaa theme
   - Verify collective-brain uses default theme
   - Test theme switching

**Success criteria**:

- ✅ No manual utility definitions (except gradients/special cases)
- ✅ `@theme inline` generates all color utilities automatically
- ✅ IDE autocomplete shows theme utilities
- ✅ Both themes work in light and dark modes
- ✅ Multi-site theming works correctly

**Files to modify**:

- `shared/theme-default/src/theme.css`
- `shared/theme-yeehaa/src/theme.css`

**Lines to delete**:

- theme-default: Lines 151-263 (entire manual utilities section)
- theme-yeehaa: Lines 168-333 (entire manual utilities section)

### Phase 1: Fix Prose Colors (Modified)

**Goal**: Use `@theme inline` to expose prose colors properly.

**Tasks**:

1. **Add prose tokens to `@theme inline`** in both themes:
   - `--color-prose-headings`, `--color-prose-body`, `--color-prose-links`, etc.
   - Reference existing `--color-*` variables

2. **Remove hacky overrides**:
   - Delete `article.prose h1 { color: inherit; }` from yeehaa theme (lines 231-239)

3. **Test**:
   - View blog posts in both themes
   - Verify heading colors match body text
   - Test light and dark modes

**Success criteria**:

- ✅ Prose headings use theme colors without hacks
- ✅ No `color: inherit` overrides needed
- ✅ Works in both themes, both modes

### Phase 2: Standardize Component Colors

**Goal**: All components use theme-aware utility classes.

**Tasks**:

1. **Update `shared/ui-library/src/Button.tsx`**:
   - Replace `bg-blue-500` with `bg-brand`
   - Replace `hover:bg-blue-700` with `hover:bg-brand-dark`
   - Test all button variants

2. **Update `shared/ui-library/src/ThemeToggle.tsx`**:
   - Replace `bg-gray-200`, `bg-gray-800` with theme classes
   - Use auto-generated utilities from `@theme inline`

3. **Audit other components**:
   - Search for `bg-blue`, `bg-gray`, `text-gray`, etc.
   - Replace with theme utilities

4. **Test**:
   - View all components in both themes
   - Test light and dark modes
   - Verify no hardcoded colors remain

**Success criteria**:

- ✅ No hardcoded color utilities (`bg-blue-*`, `text-gray-*`)
- ✅ All components adapt to theme changes
- ✅ Works in both themes, both modes

### Phase 3: Typography Scale Cleanup

**Goal**: Remove unused typography scale variables.

**Tasks**:

1. **Delete from both theme files**:

   ```css
   /* DELETE THESE LINES */
   --text-h1: 8rem;
   --text-h2: 4.5rem;
   --text-h3: 3rem;
   --text-h4: 1.875rem;
   --text-body: 1.875rem;
   --text-body-mobile: 1.5rem;
   --text-h1-mobile: 3.75rem;
   --text-h2-mobile: 3rem;
   --text-h3-mobile: 2.25rem;
   ```

2. **Verify nothing breaks**:
   - Grep for `var(--text-h` to check for usage
   - If found, replace with Tailwind utilities

3. **Test**:
   - Build site
   - Verify typography still looks correct

**Success criteria**:

- ✅ Unused variables removed
- ✅ No references to deleted variables
- ✅ Typography unchanged visually

### Phase 4: Theme Toggle Improvements

**Goal**: Theme toggle works properly without `!important` hacks.

**Tasks**:

1. **Define toggle colors in runtime tokens**:

   ```css
   :root {
     --runtime-toggle-bg: var(--runtime-bg-subtle);
     --runtime-toggle-hover: var(--runtime-brand);
   }
   ```

2. **Add to `@theme inline`**:

   ```css
   @theme inline {
     --color-toggle-bg: var(--runtime-toggle-bg);
     --color-toggle-hover: var(--runtime-toggle-hover);
   }
   ```

3. **Update ThemeToggle component**:
   - Use `bg-toggle-bg`, `hover:bg-toggle-hover`

4. **Remove `!important` hacks** from theme files

**Success criteria**:

- ✅ Theme toggle visible in all contexts
- ✅ No `!important` overrides
- ✅ Works in both themes, both modes

### Phase 5: Update Site Builder Integration

**Goal**: Ensure site builder properly injects theme CSS with `@theme inline`.

**Tasks**:

1. **Verify `base.css` doesn't conflict**:
   - Check if it has `@theme` definitions
   - Ensure theme CSS is injected before base.css processes

2. **Test build process**:
   - Run site builder
   - Verify generated CSS has utility classes
   - Check for duplicates or conflicts

**Success criteria**:

- ✅ Site builder injects theme CSS correctly
- ✅ Utilities generated from `@theme inline`
- ✅ No conflicts or duplicates

### Phase 6: Documentation

**Goal**: Document Tailwind v4 design system patterns for future developers.

**Tasks**:

1. **Create `docs/theming-guide.md`**:
   - Explain 3-tier token hierarchy
   - Document `@theme inline` pattern
   - Show how to add new theme colors
   - Provide examples of creating new themes
   - Explain automatic utility generation

2. **Update `CLAUDE.md`**:
   - Add theming guidelines section
   - Reference theming-guide.md
   - Document v4-specific patterns

3. **Add comments to theme files**:
   - Explain each tier of tokens
   - Document why `inline` keyword is used
   - Note which utilities are auto-generated

**Success criteria**:

- ✅ Complete theming guide exists
- ✅ CLAUDE.md references theming patterns
- ✅ Theme files have explanatory comments
- ✅ New developers can create themes following guide

## Testing Strategy

For each phase:

1. **Visual Testing**:
   - Test in theme-default
   - Test in theme-yeehaa
   - Test light mode
   - Test dark mode
   - Test theme switching
   - Test multiple brains with different themes

2. **Component Testing**:
   - Verify all themed components render correctly
   - Check prose content (blog posts, about pages)
   - Check UI components (buttons, cards, toggles)
   - Check footer, header, navigation

3. **Build Testing**:
   - Verify utilities are generated
   - Check generated CSS for duplicates
   - Verify file size (should be smaller without manual utilities)

4. **IDE Testing**:
   - Verify autocomplete shows theme utilities
   - Check IntelliSense for `bg-brand`, `text-theme`, etc.

5. **Cross-Browser**:
   - Test in Chrome/Edge (Blink)
   - Test in Firefox (Gecko)
   - Test in Safari (WebKit)

## Success Metrics

- ✅ Uses `@theme inline` for automatic utility generation
- ✅ No manual utility class definitions (except special cases like gradients)
- ✅ IDE autocomplete shows theme utilities
- ✅ No `color: inherit` hacks in theme CSS
- ✅ No hardcoded color utilities in components (no `bg-blue-*`, `text-gray-*`)
- ✅ Prose headings correctly colored in all themes/modes
- ✅ Theme toggle visible in all contexts without `!important`
- ✅ All components adapt to theme changes
- ✅ Clear 3-tier token hierarchy documented
- ✅ Comprehensive theming guide exists

## Risks & Mitigations

**Risk**: Breaking existing themes during refactor
**Mitigation**: Test both themes after each phase, maintain visual parity

**Risk**: Site builder integration issues with `@theme inline`
**Mitigation**: Test build process thoroughly, check generated CSS

**Risk**: Components referencing old utility names
**Mitigation**: Keep same naming (`bg-brand`, `text-theme`), just generate differently

**Risk**: Prose plugin behavior with `@theme` tokens
**Mitigation**: Test thoroughly, document current v4 version

**Risk**: Performance impact from `@theme inline`
**Mitigation**: Minimal impact - CSS variables already used, just generation method changes

## Future Enhancements

After completing this plan:

1. **Theme Variants**: High contrast, colorblind-friendly modes
2. **Theme Inheritance**: Extend existing themes instead of duplicating
3. **Runtime Theme Editor**: Visual theme customizer in admin UI
4. **Design Token Export**: Export tokens to Figma, Sketch, etc.
5. **Component Theme Props**: Per-component theme overrides
6. **Automatic Dark Mode**: Generate dark mode from light mode algorithmically

## References

- [Tailwind CSS v4 Documentation](https://tailwindcss.com/docs)
- [Tailwind v4 Theme Configuration](https://tailwindcss.com/docs/theme)
- [Tailwind Typography Plugin](https://github.com/tailwindlabs/tailwindcss-typography)
- [CSS Custom Properties (MDN)](https://developer.mozilla.org/en-US/docs/Web/CSS/--*)
- [Tailwind v4 Beta Announcement](https://tailwindcss.com/blog/tailwindcss-v4-beta)

## Changelog

- **2025-01-12**: Initial planning document created
- **2025-01-12**: Major update - Added `@theme inline` pattern, restructured all phases, added Phase 0 for proper v4 architecture
