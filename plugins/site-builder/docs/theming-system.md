# Theming System Design

## Overview

The site builder theming system allows users to customize the appearance of their generated sites through CSS custom properties (variables). This provides a flexible, maintainable way for users to create unique-looking sites without modifying component code.

## Requirements

1. **Custom Styling**: Users can override default colors, fonts, spacing, and other design tokens
2. **Simple Integration**: Theme customization through a single CSS file
3. **Package Support**: Themes can be imported from npm packages
4. **Build-time Processing**: Themes are processed and optimized during build
5. **Extensible**: System can be extended with runtime theme switching in the future

## Architecture

### Theme File

Users provide custom themes as CSS files containing variable overrides:

```css
/* Custom theme example - theme.css */
:root {
  /* Brand Colors */
  --color-brand: #0066cc;
  --color-brand-dark: #0052a3;
  --color-brand-light: #3385ff;

  /* Typography */
  --font-family-sans: "Inter", system-ui, sans-serif;

  /* Spacing, borders, etc. */
  --radius-base: 8px;
}
```

### Configuration

Theme files are specified in `brain.config.ts`:

```typescript
// Option 1: Local file path (default)
export default {
  siteBuilder: {
    themeFile: "./theme.css", // Default value
  },
};

// Option 2: Imported module
import myTheme from "@my-org/brand-theme";

export default {
  siteBuilder: {
    themeFile: myTheme, // CSS string from package
  },
};
```

### CSS Layer Order

The build process combines CSS in this specific order:

1. **Base Tailwind CSS** - Core utilities and resets
2. **Default Theme Variables** - Built-in design tokens
3. **Custom Theme** - User overrides (if provided)
4. **Component Styles** - Component-specific styles using variables
5. **Utility Classes** - Tailwind utilities using theme variables

### Processing Pipeline

```
theme.css or imported theme
         ↓
    [Read/Import]
         ↓
    [Validate CSS]
         ↓
    [Inject into build]
         ↓
    [Process with PostCSS/Tailwind]
         ↓
    [Output final CSS]
```

## Implementation Plan

### Phase 1: Core Theme Support (Current)

1. **Ensure Consistent Variable Usage** (First Priority)
   - Audit all components to use theme CSS variables
   - Replace hardcoded colors with semantic variables
   - Update utility classes to use theme variables
   - Verify all components respect theme customization

2. **Config Schema Update**
   - Add `themeFile` field to SiteBuilderConfig
   - Support string paths and imported modules
   - Default to "./theme.css"

3. **Build Process Integration**
   - Load theme file during build
   - Inject after default variables
   - Process through existing CSS pipeline

4. **Theme Template**
   - Create comprehensive theme.template.css
   - Document all customizable variables
   - Include usage examples

### Phase 2: Enhanced Features (Future)

1. **Runtime Theme Switching**
   - Multiple theme support
   - LocalStorage persistence
   - Theme switcher component

2. **Theme Validation**
   - Validate required variables
   - Type checking for values
   - Build-time warnings

3. **Theme Marketplace**
   - Community themes
   - Theme preview system
   - Auto-installation

## Customizable Variables

### Colors

```css
/* Brand Palette */
--color-brand: #6366f1;
--color-brand-dark: #4f46e5;
--color-brand-light: #a5b4fc;
--color-accent: #ea580c;

/* Semantic Colors */
--color-text: #1a202c;
--color-text-muted: #718096;
--color-text-inverse: #ffffff;

/* Backgrounds */
--color-bg: #ffffff;
--color-bg-subtle: #f7fafc;
--color-bg-muted: #e2e8f0;

/* States */
--color-success: #10b981;
--color-warning: #f59e0b;
--color-error: #ef4444;
--color-info: #3b82f6;
```

### Typography

```css
/* Font Families */
--font-family-sans: "DM Sans", system-ui, sans-serif;
--font-family-serif: Georgia, serif;
--font-family-mono: "Fira Code", monospace;

/* Font Sizes */
--font-size-xs: 0.75rem;
--font-size-sm: 0.875rem;
--font-size-base: 1rem;
--font-size-lg: 1.125rem;
--font-size-xl: 1.25rem;
--font-size-2xl: 1.5rem;
--font-size-3xl: 1.875rem;
--font-size-4xl: 2.25rem;

/* Line Heights */
--line-height-tight: 1.25;
--line-height-base: 1.5;
--line-height-relaxed: 1.75;
```

### Spacing & Layout

```css
/* Spacing Scale */
--spacing-xs: 0.25rem;
--spacing-sm: 0.5rem;
--spacing-md: 1rem;
--spacing-lg: 1.5rem;
--spacing-xl: 2rem;
--spacing-2xl: 3rem;

/* Container */
--container-max-width: 1280px;
--container-padding: 1rem;

/* Borders */
--radius-sm: 0.25rem;
--radius-base: 0.375rem;
--radius-lg: 0.5rem;
--radius-full: 9999px;

--border-width: 1px;
--border-color: #e2e8f0;
```

### Shadows & Effects

```css
/* Shadows */
--shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
--shadow-base: 0 1px 3px rgba(0, 0, 0, 0.1);
--shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.1);

/* Transitions */
--transition-fast: 150ms ease;
--transition-base: 250ms ease;
--transition-slow: 350ms ease;

/* Opacity */
--opacity-disabled: 0.5;
--opacity-hover: 0.8;
```

## Usage Examples

### Basic Theme Customization

```css
/* my-theme.css */
:root {
  /* Use brand colors */
  --color-brand: #ff6b6b;
  --color-brand-dark: #ff5252;
  --color-brand-light: #ff8787;

  /* Custom fonts */
  --font-family-sans: "Poppins", sans-serif;

  /* Adjust spacing */
  --spacing-base: 1.25rem;

  /* Rounded corners */
  --radius-base: 12px;
}
```

### Dark Theme Preparation

```css
/* Future: Dark theme support */
[data-theme="dark"] {
  --color-bg: #1a202c;
  --color-bg-subtle: #2d3748;
  --color-text: #f7fafc;
  --color-text-muted: #cbd5e0;
  --color-border: #4a5568;
}
```

### Package-based Theme

```typescript
// @acme/brand-theme/index.js
export default `
  :root {
    --color-brand: #0ea5e9;
    --font-family-sans: 'Inter', sans-serif;
    /* ... more brand variables ... */
  }
`;

// brain.config.ts
import acmeTheme from "@acme/brand-theme";

export default {
  siteBuilder: {
    themeFile: acmeTheme,
  },
};
```

## Testing Strategy

1. **Unit Tests**
   - Theme file loading
   - CSS injection order
   - Variable override behavior

2. **Integration Tests**
   - Build with custom theme
   - Package import handling
   - Missing theme fallback

3. **Visual Tests**
   - Theme application verification
   - Component styling with variables
   - Cross-browser compatibility

## Migration Path

For existing sites:

1. Current hardcoded values remain as defaults
2. No breaking changes - theme file is optional
3. Gradual adoption - override only what's needed

## Security Considerations

1. **CSS Injection**: Sanitize imported CSS to prevent malicious code
2. **File Access**: Validate theme file paths to prevent directory traversal
3. **Build-time Only**: No runtime evaluation of theme code

## Future Enhancements

1. **Theme Builder UI**: Visual tool for creating themes
2. **Theme Inheritance**: Extend base themes with modifications
3. **Component Variants**: Theme-specific component styles
4. **Responsive Themes**: Different variables for breakpoints
5. **CSS-in-JS Support**: Theme objects for styled-components/emotion

## Conclusion

This theming system provides a flexible, user-friendly way to customize site appearance while maintaining consistency and performance. The CSS variable approach ensures compatibility with modern browsers and integrates seamlessly with the existing Tailwind CSS setup.
