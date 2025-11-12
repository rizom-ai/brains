# Theming System Streamlining Plan

**Status**: Planning
**Created**: 2025-01-12
**Priority**: Medium
**Complexity**: Medium

## Overview

This plan addresses inconsistencies in our theming system to create a standardized, maintainable approach for styling components and content. The codebase uses Tailwind v4's CSS-first architecture, and we need to ensure all theming follows v4 best practices.

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

**Theming Approach**:

- CSS custom properties defined in `@layer theme` (standard CSS, not Tailwind-specific)
- Utility classes in `@layer utilities` that reference variables
- Prose customization via `--tw-prose-*` variables in `@layer utilities`
- Dark mode via `[data-theme="dark"]` attribute selector

### What's Working Well

✅ **Theme Package Structure**: Clean separation of themes as npm packages
✅ **CSS Variable Foundation**: Semantic naming (`--color-text`, `--color-brand`)
✅ **Dark Mode Implementation**: Attribute-based switching works smoothly
✅ **Typography Plugin Integration**: Properly loaded via `@plugin` directive
✅ **Prose Variable Definitions**: Themes define `--tw-prose-*` variables correctly

## Problems Identified

### 1. Prose Heading Colors Not Applying

**Issue**: The hacky workaround in `theme-yeehaa/src/theme.css` (lines 231-239):

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

**Why it exists**: The `--tw-prose-headings` variable defined in `:root` isn't being picked up by prose elements.

**Root cause**: Prose variables need to be defined on `.prose` selector in `@layer utilities`, not in `:root`. While the themes DO define variables in the prose utility block, they may not be comprehensive enough or may be overridden.

**Impact**: Headings don't use theme colors, requiring hacky overrides with `color: inherit`.

### 2. Inconsistent Component Styling

**Components using theme variables (GOOD)**:

- `Card.tsx`: Uses `bg-theme-subtle`, `border-theme`, `text-theme`
- `EmptyState.tsx`: Uses `text-theme-muted`
- `LinkButton.tsx`: Uses `bg-brand`, `bg-accent`, `text-theme-inverse`
- `CardTitle.tsx`: Uses `text-theme`, `hover:text-brand`

**Components using hardcoded colors (INCONSISTENT)**:

- `Button.tsx`: Uses `bg-blue-500 hover:bg-blue-700` (hardcoded blue!)
- `ThemeToggle.tsx`: Uses `bg-gray-200`, `bg-gray-800`, `text-gray-800` (hardcoded grays!)

**Impact**: These components don't adapt to theme changes and break the theming system's consistency.

### 3. Typography Scale Mismatch

**Theme defines scale**:

```css
--text-h1: 8rem; /* 128px Desktop */
--text-h2: 4.5rem; /* 72px Desktop */
--text-h3: 3rem; /* 48px Desktop */
```

**Components use different sizes**:

```tsx
prose-h1:text-4xl  /* 2.25rem = 36px - completely different! */
```

**Impact**: Inconsistent typography across the site, theme scale variables go unused.

### 4. Footer Theme Toggle Visibility

**Issue**: Theme toggle button in footer uses semi-transparent white backgrounds (`bg-white/20`) which are invisible on white/yellow backgrounds.

**Current workaround**: Theme-specific CSS overrides in `theme-yeehaa`:

```css
.bg-footer button[aria-label="Toggle dark mode"] {
  background-color: var(--palette-black) !important;
  color: var(--palette-white) !important;
}
```

**Impact**: Requires theme-specific hacks instead of proper theming.

## Tailwind v4 Best Practices

Our theming system should follow these v4 patterns:

### ✅ Correct v4 Patterns

1. **CSS-First Configuration**: Use `@plugin`, `@theme`, `@source` directives in CSS
2. **Prose Customization**: Define `--tw-prose-*` variables on `.prose` selector in `@layer utilities`
3. **Semantic Variables**: Use CSS custom properties with semantic names
4. **Dark Mode**: Use attribute selectors like `[data-theme="dark"]`

### ❌ v3 Patterns to Avoid

1. **JavaScript Config**: Don't use `tailwind.config.js` for theming (v4 is CSS-first)
2. **Theme Extend Object**: Don't configure prose via `theme.extend.typography`
3. **Plugin Arrays**: Don't add plugins in config, use `@plugin` directive

## Recommended Solutions

### Solution 1: Fix Prose Heading Colors

**Approach**: Ensure comprehensive `--tw-prose-*` variable definitions in `@layer utilities`.

**Implementation**:

```css
@layer utilities {
  .prose {
    /* Text colors */
    --tw-prose-body: var(--color-text);
    --tw-prose-headings: var(--color-text); /* KEY: Use same color as body */
    --tw-prose-lead: var(--color-text);
    --tw-prose-links: var(--color-brand);
    --tw-prose-bold: var(--color-text);
    --tw-prose-counters: var(--color-text-muted);
    --tw-prose-bullets: var(--color-text-muted);
    --tw-prose-hr: var(--color-border);
    --tw-prose-quotes: var(--color-text-muted);
    --tw-prose-quote-borders: var(--color-brand);
    --tw-prose-captions: var(--color-text-muted);
    --tw-prose-code: var(--color-text);
    --tw-prose-pre-code: var(--color-text);
    --tw-prose-pre-bg: var(--color-bg-muted);
    --tw-prose-th-borders: var(--color-border);
    --tw-prose-td-borders: var(--color-border);
  }

  [data-theme="dark"] .prose {
    /* Dark mode overrides */
    --tw-prose-body: var(--color-text);
    --tw-prose-headings: var(--color-text);
    /* ... etc */
  }
}
```

**Files to modify**:

- `shared/theme-default/src/theme.css`
- `shared/theme-yeehaa/src/theme.css`

**Remove**:

- Hacky `article.prose h1 { color: inherit; }` override

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
  default: "bg-theme-muted hover:bg-theme text-theme",
  light: "bg-theme-subtle hover:bg-theme text-theme",
  dark: "bg-theme-dark hover:bg-theme-muted text-theme-inverse",
};
```

**Files to modify**:

- `shared/ui-library/src/Button.tsx`
- `shared/ui-library/src/ThemeToggle.tsx`

### Solution 3: Typography Scale Consistency

**Approach**: Decide on one source of truth for typography scale.

**Option A**: Use theme scale variables in components (via Tailwind's `theme()` function if needed)
**Option B**: Let prose plugin handle all typography, remove custom scale
**Option C**: Define scale in `@theme` directive and reference throughout

**Recommendation**: Option B - Let prose plugin handle content typography, use Tailwind's default scale for UI components. Remove unused typography scale variables from themes.

**Files to review**:

- `shared/theme-default/src/theme.css` (remove `--text-h1` etc. if unused)
- `shared/theme-yeehaa/src/theme.css` (remove `--text-h1` etc. if unused)
- `shared/ui-library/src/ProseContent.tsx` (verify prose handles typography)
- `shared/ui-library/src/ProseHeading.tsx` (verify consistency)

### Solution 4: Proper Theme Toggle Styling

**Approach**: Define theme-aware toggle variants instead of per-theme overrides.

**Add to theme CSS** (`@layer utilities`):

```css
.theme-toggle {
  background-color: var(--color-bg-muted);
  color: var(--color-text);
}

.theme-toggle:hover {
  background-color: var(--color-brand);
  color: var(--color-text-inverse);
}
```

**Update ThemeToggle.tsx** to use `theme-toggle` class.

**Remove**: Theme-specific `!important` overrides for footer buttons.

## Implementation Plan

### Phase 1: Fix Prose Colors (Highest Priority)

**Goal**: Make prose headings respect theme colors without hacks.

**Tasks**:

1. Update `shared/theme-yeehaa/src/theme.css`:
   - Ensure comprehensive `--tw-prose-*` definitions in `.prose` utility
   - Set `--tw-prose-headings: var(--color-text)`
   - Remove `article.prose h1 { color: inherit; }` hack
2. Update `shared/theme-default/src/theme.css`:
   - Same comprehensive `--tw-prose-*` definitions
3. Test prose heading colors in both themes, both light/dark modes

**Success criteria**: Prose headings use `--color-text` without any hacky overrides.

### Phase 2: Standardize Component Colors

**Goal**: All components use theme-aware utility classes.

**Tasks**:

1. Update `shared/ui-library/src/Button.tsx`:
   - Replace `bg-blue-500` with `bg-brand`
   - Replace `hover:bg-blue-700` with `hover:bg-brand-dark`
   - Ensure all button variants use theme classes
2. Update `shared/ui-library/src/ThemeToggle.tsx`:
   - Replace hardcoded gray colors with theme classes
   - Use `bg-theme-muted`, `text-theme`, etc.
3. Audit other UI components for hardcoded colors
4. Test all components in both themes, both modes

**Success criteria**: No component has hardcoded color utilities like `bg-blue-*`, `text-gray-*`.

### Phase 3: Typography Scale Cleanup (Optional)

**Goal**: Remove unused typography scale variables or ensure consistent usage.

**Tasks**:

1. Determine if `--text-h1`, `--text-h2`, etc. are actually used
2. If unused, remove from both theme files
3. If used, document where and ensure consistency
4. Update ProseContent/ProseHeading if needed

**Success criteria**: Typography scale is either used consistently or removed.

### Phase 4: Theme Toggle Improvements (Nice to Have)

**Goal**: Theme toggle works properly in all contexts without theme-specific overrides.

**Tasks**:

1. Define `.theme-toggle` utility class in themes
2. Update ThemeToggle component to use new class
3. Remove footer-specific `!important` overrides
4. Test toggle in footer, header, and standalone contexts

**Success criteria**: Theme toggle visible and functional everywhere without per-theme hacks.

### Phase 5: Documentation

**Goal**: Document theming patterns for future developers.

**Tasks**:

1. Create `docs/theming-guide.md` with:
   - v4-specific patterns we use
   - How to create new themes
   - Component styling guidelines
   - Prose customization approach
2. Add comments to theme files explaining variable usage
3. Update CLAUDE.md with theming guidelines

**Success criteria**: New developers can create themes and theme-aware components following documented patterns.

## Testing Strategy

For each phase:

1. **Visual Testing**:
   - Test in theme-default
   - Test in theme-yeehaa
   - Test light mode
   - Test dark mode
   - Test theme switching

2. **Component Testing**:
   - Verify all themed components render correctly
   - Check prose content (blog posts, about pages)
   - Check UI components (buttons, cards, toggles)
   - Check footer, header, navigation

3. **Cross-Browser**:
   - Test in Chrome/Edge (Blink)
   - Test in Firefox (Gecko)
   - Test in Safari (WebKit)

## Success Metrics

- ✅ No `color: inherit` hacks in theme CSS
- ✅ No hardcoded color utilities in components (no `bg-blue-*`, `text-gray-*`)
- ✅ Prose headings correctly colored in all themes/modes
- ✅ Theme toggle visible in all contexts
- ✅ All components adapt to theme changes
- ✅ Consistent typography throughout site
- ✅ Documentation exists for theming patterns

## Risks & Mitigations

**Risk**: Breaking existing themes during refactor
**Mitigation**: Test both themes after each change, maintain backward compatibility

**Risk**: Prose plugin behavior changes in future v4 updates
**Mitigation**: Document current v4 version, test after Tailwind updates

**Risk**: Components using themes break if variable names change
**Mitigation**: Don't rename existing variables, only add new ones or improve definitions

**Risk**: Performance impact from more CSS variables
**Mitigation**: CSS variables have minimal performance cost, modern browsers handle them well

## Future Enhancements

After completing this plan, consider:

1. **Theme Variants**: Support for more than just light/dark (high contrast, colorblind-friendly)
2. **Dynamic Theming**: Runtime theme switching via JavaScript
3. **Theme Generator**: CLI tool to scaffold new themes
4. **Component Theme Props**: Allow per-component theme overrides
5. **CSS-in-JS Migration**: Evaluate if Tailwind v4's features reduce need for CSS-in-JS

## References

- [Tailwind CSS v4 Documentation](https://tailwindcss.com/docs)
- [Tailwind Typography Plugin](https://github.com/tailwindlabs/tailwindcss-typography)
- [CSS Custom Properties (MDN)](https://developer.mozilla.org/en-US/docs/Web/CSS/--*)
- [Tailwind v4 Alpha Announcement](https://tailwindcss.com/blog/tailwindcss-v4-alpha)

## Changelog

- **2025-01-12**: Initial planning document created
