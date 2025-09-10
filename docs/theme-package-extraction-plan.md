# Theme Package Extraction Plan

## Overview

Extract the default theme from the site-builder plugin into a separate package to enable cleaner separation of concerns and easier theme management.

## Motivation

- **Cleaner separation**: Site-builder plugin focuses on build mechanics, not styling opinions
- **Easier theme switching**: Apps can choose between different theme packages
- **Independent versioning**: Themes can evolve without affecting the core builder
- **Smaller core**: Site-builder plugin becomes lighter
- **Theme ecosystem**: Community can publish themes as npm packages

## Implementation Plan

### 1. Create Theme Package Structure

```
shared/theme-default/
├── src/
│   ├── theme.css      # Main theme styles
│   └── index.ts       # Export theme as string
├── package.json
├── tsconfig.json
└── README.md
```

### 2. Extract Theme-Specific CSS

**Move to `shared/theme-default/src/theme.css`:**

- Default font import (`@import url('https://fonts.googleapis.com/css2?family=DM+Sans...')`)
- All CSS custom properties for colors, typography, spacing
- Theme layer with light/dark mode variables
- Custom utility classes (text-theme, bg-theme, etc.)
- Animation utilities
- Hero background patterns
- Prose styles for dark mode

**Keep in `plugins/site-builder/src/styles/base.css`:**

```css
@import "tailwindcss";
@source "./**/*.html";

/* Base layer - minimal setup for font fallbacks */
@layer base {
  body {
    font-family: var(--font-sans, ui-sans-serif, system-ui, sans-serif);
  }

  .font-sans {
    font-family: var(--font-sans, ui-sans-serif, system-ui, sans-serif);
  }

  .font-mono {
    font-family: var(--font-mono, ui-monospace, monospace);
  }
}
```

### 3. Theme Package Setup

**`shared/theme-default/package.json`:**

```json
{
  "name": "@brains/theme-default",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./css": "./src/theme.css"
  },
  "files": ["src"],
  "dependencies": {},
  "devDependencies": {
    "@brains/typescript-config": "workspace:*"
  }
}
```

**`shared/theme-default/src/index.ts`:**

```typescript
// Export theme CSS as a string for Bun imports
import themeCSS from "./theme.css" with { type: "text" };

export default themeCSS;
export { themeCSS };
```

### 4. Update Site-Builder Plugin

- Rename `tailwind-input.css` to `base.css`
- Remove all theme-specific styles from base.css
- Update `preact-builder.ts` to reference the new base.css file
- Update imports in tests

### 5. Usage Pattern

**Without custom theme (using default):**

```typescript
import { siteBuilderPlugin } from "@brains/site-builder-plugin";
import defaultTheme from "@brains/theme-default";

export default {
  plugins: [
    siteBuilderPlugin({
      templates,
      routes,
      layouts,
      themeCSS: defaultTheme, // Use the default theme
    }),
  ],
};
```

**With custom theme:**

```typescript
import { siteBuilderPlugin } from "@brains/site-builder-plugin";
import customTheme from "./theme.css" with { type: "text" };

export default {
  plugins: [
    siteBuilderPlugin({
      templates,
      routes,
      layouts,
      themeCSS: customTheme, // Use custom theme
    }),
  ],
};
```

**With no theme (bare Tailwind):**

```typescript
import { siteBuilderPlugin } from "@brains/site-builder-plugin";

export default {
  plugins: [
    siteBuilderPlugin({
      templates,
      routes,
      layouts,
      themeCSS: "", // No theme, just base Tailwind
    }),
  ],
};
```

### 6. Documentation Updates

**Site-builder README:**

- Remove theme-specific configuration
- Add section on theme usage
- Show examples with different theme packages

**Theme-default README:**

- Document all available CSS variables
- Show customization examples
- List included utility classes

### 7. Testing Updates

- Update existing tests to work with minimal base CSS
- Add tests for theme package exports
- Verify font extraction still works correctly

## Benefits

1. **Modularity**: Themes become first-class packages
2. **Flexibility**: Apps can easily switch themes or go themeless
3. **Maintainability**: Theme updates don't require site-builder updates
4. **Extensibility**: Easy to create theme variants or custom themes

## Migration Notes

Since backward compatibility is not required:

- Existing apps will need to install `@brains/theme-default` if they want the current styling
- Or they can use this as an opportunity to create their own theme
- The site will still build without a theme, just with minimal Tailwind styles
