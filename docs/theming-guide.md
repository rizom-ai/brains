# Theming Guide

> **Complete guide to the Brains theming system using Tailwind v4**

This guide explains how themes work in the Brains project, how to customize existing themes, and how to create new themes using Tailwind v4 best practices.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [How Themes Work](#how-themes-work)
- [Adding New Colors](#adding-new-colors)
- [Creating a New Theme](#creating-a-new-theme)
- [Dark Mode Implementation](#dark-mode-implementation)
- [Multi-Site Theming](#multi-site-theming)
- [Common Patterns](#common-patterns)
- [Troubleshooting](#troubleshooting)

---

## Architecture Overview

### 2-Tier Token Hierarchy

Our theming system uses a **2-tier hierarchy** that provides both flexibility and maintainability:

```
┌─────────────────┐
│ Palette Tokens  │ ← Raw color values (never change at runtime)
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│ Semantic Tokens │ ← Meaningful names (change with theme/mode)
└─────────────────┘
```

**Tier 1: Palette Tokens** - The foundation

- Raw color values that never change
- Named by color family, not by purpose
- Examples: `--palette-brand-blue`, `--palette-orange`, `--palette-black`

**Tier 2: Semantic Tokens** - The interface

- Reference palette tokens
- Named by purpose/intent
- Change at runtime for dark mode
- Examples: `--color-brand`, `--color-text`, `--color-bg`

### Why This Approach?

✅ **Semantic meaning**: `--color-brand` is clearer than `--color-blue-500`
✅ **Runtime flexibility**: Dark mode just swaps semantic token values
✅ **Maintainability**: Change palette colors without touching components
✅ **Consistency**: Same token names across all themes

---

## How Themes Work

### CSS Variable Flow

```css
/* ===== TIER 1: PALETTE (Never changes) ===== */
:root {
  --palette-brand-blue: #3921d7;
  --palette-orange: #ea580c;
  --palette-black: #000000;
  --palette-white: #ffffff;
}

/* ===== TIER 2: SEMANTIC (Changes at runtime) ===== */
:root {
  /* Light mode defaults */
  --color-brand: var(--palette-brand-blue);
  --color-accent: var(--palette-orange);
  --color-bg: var(--palette-white);
  --color-text: var(--palette-brand-blue-dark-2);
}

[data-theme="dark"] {
  /* Dark mode overrides */
  --color-brand: var(--palette-orange); /* Swapped! */
  --color-accent: var(--palette-brand-yellow);
  --color-bg: var(--palette-black);
  --color-text: var(--palette-white);
}

/* ===== EXPOSE TO TAILWIND ===== */
@theme inline {
  /* Auto-generates: bg-brand, text-brand, border-brand, etc. */
  --color-brand: var(--color-brand);
  --color-accent: var(--color-accent);
  /* ... more colors ... */
}
```

### The `@theme inline` Directive

**What it does**: Tells Tailwind v4 to generate utilities from CSS variables **at runtime**.

**Why `inline`?**: The `inline` keyword makes Tailwind use `var(--color-brand)` directly in the generated CSS instead of resolving it at build time. This is **essential** for dark mode and multi-site theming.

**Example output**:

```css
/* Tailwind auto-generates these from @theme inline: */
.bg-brand {
  background-color: var(--color-brand);
}
.text-brand {
  color: var(--color-brand);
}
.border-brand {
  border-color: var(--color-brand);
}
.ring-brand {
  --tw-ring-color: var(--color-brand);
}
/* Plus hover:, focus:, dark:, etc. variants! */
```

### Special Utilities

Some utilities need custom logic and can't be auto-generated:

```css
@layer utilities {
  /* bg-theme and text-theme use DIFFERENT variables */
  .bg-theme {
    background-color: var(--color-bg);
  }
  .text-theme {
    color: var(--color-text);
  }

  /* Conditional utilities that change in dark mode */
  .text-nav {
    color: var(--color-brand);
  }
  [data-theme="dark"] .text-nav {
    color: var(--color-accent);
  }
}
```

---

## Adding New Colors

### Step 1: Add Palette Token (if needed)

```css
/* shared/theme-default/src/theme.css */
:root {
  /* Add new palette color */
  --palette-success-green: #10b981;
  --palette-danger-red: #ef4444;
}
```

### Step 2: Add Semantic Token

```css
/* Add semantic tokens for both light and dark modes */
:root {
  --color-success: var(--palette-success-green);
  --color-danger: var(--palette-danger-red);
}

[data-theme="dark"] {
  /* Adjust for dark mode if needed */
  --color-success: #34d399; /* Lighter for dark backgrounds */
  --color-danger: #f87171;
}
```

### Step 3: Expose to Tailwind

```css
@theme inline {
  /* Add to @theme inline block */
  --color-success: var(--color-success);
  --color-danger: var(--color-danger);
}
```

### Step 4: Use in Components

```tsx
// Now you can use these utilities:
<button className="bg-success text-white">Success</button>
<div className="border-danger text-danger">Error</div>
```

**Auto-generated utilities** you get for free:

- `bg-success`, `bg-danger`
- `text-success`, `text-danger`
- `border-success`, `border-danger`
- `ring-success`, `ring-danger`
- Plus all variants: `hover:bg-success`, `focus:text-danger`, etc.

---

## Creating a New Theme

### Option 1: Duplicate Existing Theme

```bash
# Copy theme-default as starting point
cp -r shared/theme-default shared/theme-mytheme

# Update package.json
cd shared/theme-mytheme
# Edit: name, description, etc.
```

### Option 2: From Scratch

**1. Create package structure**:

```
shared/theme-mytheme/
├── package.json
├── src/
│   └── theme.css
└── README.md
```

**2. Create theme.css**:

```css
/* ===== TIER 1: PALETTE TOKENS ===== */
:root {
  /* Define your color palette */
  --palette-primary: #6366f1;
  --palette-secondary: #ec4899;
  --palette-light: #f8fafc;
  --palette-dark: #0f172a;
}

/* ===== TIER 2: SEMANTIC TOKENS ===== */
:root {
  /* Light mode (default) */
  --color-brand: var(--palette-primary);
  --color-accent: var(--palette-secondary);
  --color-bg: var(--palette-light);
  --color-text: var(--palette-dark);

  /* More semantic tokens... */
}

[data-theme="dark"] {
  /* Dark mode overrides */
  --color-bg: var(--palette-dark);
  --color-text: var(--palette-light);
}

/* ===== EXPOSE TO TAILWIND ===== */
@theme inline {
  --color-brand: var(--color-brand);
  --color-accent: var(--color-accent);
  /* Expose all colors you want utilities for */
}

/* ===== SPECIAL UTILITIES ===== */
@layer utilities {
  /* Theme utilities where bg/text need different variables */
  .bg-theme {
    background-color: var(--color-bg);
  }
  .text-theme {
    color: var(--color-text);
  }
}
```

**3. Register with Turbo**:

Add to `turbo.json` if needed, and reference in your brain config.

**4. Use in brain.config.ts**:

```typescript
import mytheme from "@brains/theme-mytheme";

export default {
  themeCSS: mytheme,
  // ... other config
};
```

---

## Dark Mode Implementation

### How Dark Mode Works

1. **JavaScript toggles attribute**: `document.documentElement.dataset.theme = 'dark'`
2. **CSS responds**: `[data-theme="dark"]` selectors activate
3. **Semantic tokens swap**: `--color-brand` points to different palette color
4. **Components update**: All utilities reference semantic tokens via `var()`

### Dark Mode Best Practices

**✅ DO**:

```css
/* Semantic tokens that swap at runtime */
:root {
  --color-text: var(--palette-gray-900);
}

[data-theme="dark"] {
  --color-text: var(--palette-gray-100);
}
```

**❌ DON'T**:

```css
/* Hard-coding colors defeats the purpose */
.my-component {
  color: #1f2937; /* Hard-coded! Won't change in dark mode */
}

/* Use semantic tokens instead */
.my-component {
  color: var(--color-text); /* ✅ Works in all modes */
}
```

### Testing Dark Mode

```typescript
// In your component/page
<button onclick="toggleTheme()">Toggle Dark Mode</button>

<script>
function toggleTheme() {
  const current = document.documentElement.dataset.theme;
  document.documentElement.dataset.theme = current === 'dark' ? 'light' : 'dark';
}
</script>
```

---

## Multi-Site Theming

### How It Works

Each brain can specify its own theme in `brain.config.ts`:

```typescript
// apps/professional-brain/brain.config.ts
import yeehaa from "@brains/theme-yeehaa";

export default {
  themeCSS: yeehaa,
  // ...
};

// apps/collective-brain/brain.config.ts
import defaultTheme from "@brains/theme-default";

export default {
  themeCSS: defaultTheme,
  // ...
};
```

### Site Builder Integration

The site builder concatenates CSS in the correct order:

1. **base.css** - Tailwind setup, plugins, font fallbacks
2. **theme CSS** - Your chosen theme with `@theme inline` blocks
3. **Tailwind processing** - Generates utilities from both

**Result**: Each site gets its own theme, but all use the same component code!

---

## Common Patterns

### Pattern 1: Conditional Colors

When a component needs different colors in different contexts:

```css
/* Example: Navigation text changes in dark mode */
.text-nav {
  color: var(--color-brand);
}
[data-theme="dark"] .text-nav {
  color: var(--color-accent);
}
```

### Pattern 2: Footer-Specific Styling

```css
/* Footer text should use footer-specific color */
.bg-footer .text-theme-inverse {
  color: var(--color-footer-text);
}
```

### Pattern 3: Component Variants

```typescript
// ThemeToggle.tsx
const variantClasses = {
  default: "bg-white/20 hover:bg-white/30 text-white",
  footer: "bg-theme-toggle hover:bg-theme-toggle-hover text-theme-toggle-icon",
};
```

### Pattern 4: Typography Integration

```css
@theme inline {
  /* Typography plugin respects these */
  --tw-prose-body: var(--color-text);
  --tw-prose-headings: var(--color-heading);
  --tw-prose-links: var(--color-brand);
}
```

---

## Troubleshooting

### Issue: Utilities not generating

**Symptom**: Classes like `bg-mybrand` don't work.

**Solution**: Make sure you added the color to `@theme inline`:

```css
@theme inline {
  --color-mybrand: var(--color-mybrand); /* Must be here! */
}
```

### Issue: Dark mode not working

**Symptom**: Colors don't change when toggling dark mode.

**Checklist**:

1. ✅ Using semantic tokens (`--color-brand`) not palette tokens?
2. ✅ Defined `[data-theme="dark"]` overrides?
3. ✅ Using `@theme inline` not `@theme`?
4. ✅ JavaScript setting `document.documentElement.dataset.theme`?

### Issue: Colors wrong in production

**Symptom**: Colors look different in built site vs development.

**Common cause**: Using `@theme` instead of `@theme inline`.

**Solution**:

```css
/* ❌ WRONG - resolves at build time */
@theme {
  --color-brand: #3921d7;
}

/* ✅ CORRECT - resolves at runtime */
@theme inline {
  --color-brand: var(--color-brand);
}
```

### Issue: !important needed for specificity

**Symptom**: Having to use `!important` to override styles.

**Solution**: Use proper CSS specificity instead:

```css
/* ❌ WRONG - using !important as a crutch */
.my-button {
  background: var(--color-brand) !important;
}

/* ✅ CORRECT - increase specificity properly */
.bg-footer .my-button {
  background: var(--color-brand);
}
```

Or create a component variant with the right specificity built-in.

---

## Key Takeaways

1. **2-Tier Hierarchy**: Palette → Semantic (never skip semantic layer!)
2. **@theme inline**: Required for runtime CSS variable resolution
3. **Semantic Tokens**: Always use these in components, never palette tokens
4. **Auto-Generation**: Let Tailwind generate utilities, don't write them manually
5. **Special Utilities**: Only for cases where bg/text need different variables
6. **Dark Mode**: Just swap semantic token values in `[data-theme="dark"]`
7. **Multi-Site**: Each brain chooses its theme, components work with all

---

## Further Reading

- [Tailwind CSS v4 Documentation](https://tailwindcss.com/docs)
- [CSS Custom Properties (MDN)](https://developer.mozilla.org/en-US/docs/Web/CSS/--*)
- Theme Examples:
  - [theme-default](../shared/theme-default/src/theme.css)
  - [theme-yeehaa](../shared/theme-yeehaa/src/theme.css)

---

**Questions?** Check existing themes for examples, or ask in the team channel.
