# Default Site Redesign Plan

## Overview
Rename the current default-site-content to product-site-content and create a new, more appropriate default site for Personal Brain applications.

## Decisions Made

### Q1: Rename existing package to product-site-content?
**Yes** - The current templates (hero, features, products, CTA) are clearly product/marketing oriented.

### Q2: Should the new default be minimal/clean focused on content?
**Yes, with nuance** - Focus on summarizing/representing the gist of the brain's content.

### Q3: Include smart summary of brain content?
**Yes** - Display AI-generated synthesis of main themes and insights.

### Q4: Include search/query interface?
**Optional later** - Make it an optional enhancement, not part of initial default.

### Q5: Show recent items/activity?
**No** - That's what the dashboard is for.

### Q6: Include brain statistics?
**No** - Also handled by dashboard.

### Q7: Support dark/light mode from start?
**Yes** - Use CSS custom properties and localStorage for preference.

### Q8: Single-page or multi-page?
**Single-page home** - Plus any pages registered by plugins (dashboard, etc.)

### Q9: Static or dynamic content generation?
**Static** - Generated at build time for performance.

### Q10: Include hero section?
**Compact intro** - Not a full marketing hero, but a minimal introduction section (30-40% viewport height).

## Final Plan

### Phase 1: Rename existing package
1. Rename `@brains/default-site-content` to `@brains/product-site-content`
2. Update package.json name
3. Update all imports in test-brain and other packages
4. Keep all existing templates as-is (hero, features, products, cta)

### Phase 2: Create new minimal default-site-content

#### Core components:

1. **Compact Intro Section** (30-40% viewport height):
   - Brain title (from site config)
   - One-line description
   - Subtle visual element (gradient/pattern)
   - Clean, minimal design

2. **Brain Overview Section**: 
   - AI-generated summary of the brain's main themes and content
   - Static generation at build time
   - Shows the "gist" of what the brain contains
   - Organized by key themes or topics

3. **Simple Navigation Header**:
   - Site title
   - Links to plugin-registered pages (dashboard, etc.)
   - Dark/light mode toggle

4. **Minimal Footer**:
   - Copyright
   - Powered by Personal Brain link

#### Design principles:
- Single-page home with compact intro + content summary
- Clean, minimal design focusing on readability
- Dark/light mode support from the start
- Mobile-responsive
- Fast loading (static generation)

### Phase 3: Implementation steps
1. Create new package directory structure
2. Move existing package to product-site-content
3. Update all imports and dependencies
4. Create new templates:
   - intro template (compact hero)
   - overview template (brain summary)
   - navigation template
   - footer template
5. Create default layout with dark/light mode support
6. Implement theme toggle with localStorage
7. Test with test-brain app

### File structure:
```
shared/default-site-content/        # New minimal default
├── src/
│   ├── intro/       # Compact intro section
│   ├── overview/    # Brain overview/summary
│   ├── navigation/  # Header navigation
│   ├── footer/      # Simple footer
│   ├── layouts/     # Default layout
│   ├── templates.ts
│   └── routes.ts

shared/product-site-content/        # Renamed from default
├── src/
│   ├── hero/        # Full marketing hero
│   ├── features/    # Feature sections
│   ├── products/    # Product showcase
│   ├── cta/         # Call-to-action
│   └── ...
```

## Future Enhancements
- Search/query interface (optional add-on)
- Multiple theme variations
- More layout options
- Dynamic content updates