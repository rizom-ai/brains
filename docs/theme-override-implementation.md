# Theme Override Implementation Plan

## Overview
Implement a theme override system for the site-builder plugin that allows apps (like test-brain) to customize their site appearance using CSS custom properties. The implementation will leverage Bun's native CSS import capabilities.

## Current State
- The site-builder plugin has a comprehensive theming system design documented
- Default theme variables are defined in `plugins/site-builder/src/styles/tailwind-input.css`
- CSS is processed in `PreactBuilder.processStyles()` method
- No theme override mechanism is currently implemented

## Implementation Approach

### 1. Configuration Schema Update
**File**: `plugins/site-builder/src/config.ts`

Add a `themeCSS` field to the siteBuilderConfigSchema:
- Type: optional string (containing CSS)
- Will accept imported CSS strings using Bun's import syntax
- No filesystem paths - purely CSS string content

### 2. Theme File Creation
**File**: `apps/test-brain/theme.css`

Create a CSS file with custom property overrides:
```css
:root {
  /* Custom brand colors */
  --color-brand: #custom-color;
  --color-brand-dark: #custom-dark;
  /* Additional overrides... */
}
```

### 3. Brain Config Integration
**File**: `apps/test-brain/brain.config.ts`

Import and use the theme CSS:
```typescript
import themeCSS from "./theme.css" with { type: "text" };

// In plugin configuration:
siteBuilderPlugin({
  templates,
  routes,
  layouts: { default: DefaultLayout },
  themeCSS, // Pass imported CSS string
})
```

### 4. CSS Processing Pipeline Update
**File**: `plugins/site-builder/src/lib/preact-builder.ts`

Modify the `processStyles()` method to:
1. Read the base tailwind-input.css
2. Inject the custom theme CSS if provided
3. Process through the CSS processor
4. Maintain proper layer ordering

CSS Layer Order:
1. Base Tailwind CSS (resets, utilities)
2. Default theme variables (from tailwind-input.css)
3. **Custom theme overrides** (injected from config)
4. Component styles
5. Utility classes

### 5. Plugin Update
**File**: `plugins/site-builder/src/plugin.ts`

Pass the theme CSS from config to the SiteBuilder instance and ensure it's available during the build process.

## Technical Details

### CSS Injection Strategy
The custom theme CSS will be injected as a string concatenation:
```typescript
const finalCSS = baseTailwindCSS + '\n' + (config.themeCSS || '') + '\n' + componentStyles;
```

### Bun CSS Import Syntax
Uses Bun's native CSS import with type assertion:
```typescript
import cssContent from "./file.css" with { type: "text" };
```

This returns the CSS file contents as a string, avoiding any filesystem operations at runtime.

### Theme Variable Scope
All theme customizations use CSS custom properties (variables) defined on `:root`:
- Colors: `--color-brand`, `--color-accent`, etc.
- Typography: `--font-family-sans`, `--font-size-base`, etc.  
- Spacing: `--spacing-md`, `--radius-base`, etc.
- Effects: `--shadow-lg`, `--transition-base`, etc.

## Benefits
1. **No filesystem dependencies**: Pure string-based CSS injection
2. **Build-time processing**: Themes are processed and optimized during build
3. **Type safety**: CSS imports are handled by Bun's module system
4. **Simple API**: Just import CSS and pass to config
5. **Full customization**: Any CSS variable can be overridden

## Testing Strategy
1. Create a test theme with obvious visual changes (e.g., bright colors)
2. Build the site with theme override
3. Verify CSS variables are properly overridden in generated CSS
4. Check both preview and production builds
5. Ensure Docker builds work with theme imports

## Future Enhancements
- Support for dark mode theme variants
- Multiple theme support with runtime switching
- Theme validation and type checking
- Theme inheritance (extending base themes)

## Implementation Steps
1. ✅ Research current implementation
2. ✅ Design theme override approach  
3. ⏳ Update configuration schema
4. ⏳ Create test theme file
5. ⏳ Implement CSS injection in build pipeline
6. ⏳ Update brain.config.ts with theme import
7. ⏳ Test builds locally
8. ⏳ Test Docker deployment
9. ⏳ Document usage in main theming docs