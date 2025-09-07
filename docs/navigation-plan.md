# Navigation System Plan

## Overview

This document outlines the implementation plan for adding navigation to the Personal Brain website generation system, starting with footer navigation as the foundation for understanding data flow and architecture.

## Goals

1. **Enable plugin-contributed navigation** - Plugins can register navigation items
2. **Maintain simplicity** - Start with footer, expand later
3. **Reuse existing infrastructure** - Extend RouteRegistry rather than create new systems
4. **Focus on data architecture** - Get the data model right before complex UI

## Phase 1: Footer Navigation (Current Focus)

### Scope

- Footer navigation only (no header/main navigation yet)
- Internal links only (routes within the site)
- Flat list of links (no grouping/sections)
- Globally consistent (same footer on all pages)
- Static generation (no client-side interactivity)

### Schema Extension

Extend the existing `RouteDefinitionSchema` with optional navigation metadata:

```typescript
// plugins/site-builder/src/types/routes.ts
export const RouteDefinitionSchema = z.object({
  // ... existing fields ...
  id: z.string(),
  path: z.string(),
  title: z.string(),
  description: z.string(),
  sections: z.array(SectionDefinitionSchema),
  pluginId: z.string().optional(),
  sourceEntityType: z.string().optional(),

  // NEW: Optional navigation metadata
  navigation: z
    .object({
      show: z.boolean().default(false), // Display in navigation?
      label: z.string().optional(), // Override title for nav display
      slot: z.enum(["footer"]).default("footer"), // Navigation slot (only footer for now)
      priority: z.number().min(0).max(100).default(50), // Display order (0-100)
    })
    .optional(),
});
```

### Priority Convention

Recommended priority ranges for consistent ordering:

- **0-20**: Core/system pages (Home, Search)
- **30-70**: Plugin-registered pages (Links, Topics, Summaries)
- **80-100**: Site-specific pages (About, Contact, Privacy)

### Data Flow Architecture

```
1. Plugin Registration
   ↓
   plugin.register({
     path: "/links",
     title: "Links Collection",
     navigation: {
       show: true,
       label: "Links",
       slot: "footer",
       priority: 40
     }
   })
   ↓
2. RouteRegistry Storage
   ↓
   routeRegistry.routes = Map<path, RouteDefinition>
   ↓
3. Navigation Extraction
   ↓
   routeRegistry.getNavigationItems("footer")
   // Returns sorted array of nav items
   ↓
4. Site Builder
   ↓
   const footerNav = routeRegistry.getNavigationItems("footer")
   const html = renderPage({ footerNavigation: footerNav })
   ↓
5. Footer Component
   ↓
   <Footer navigation={footerNavigation} />
```

### Implementation Steps

#### Step 1: Extend Route Schema

```typescript
// plugins/site-builder/src/types/routes.ts
export const NavigationMetadataSchema = z
  .object({
    show: z.boolean().default(false),
    label: z.string().optional(),
    slot: z.enum(["footer"]).default("footer"),
    priority: z.number().min(0).max(100).default(50),
  })
  .optional();

export const RouteDefinitionSchema = z.object({
  // ... existing fields ...
  navigation: NavigationMetadataSchema,
});
```

#### Step 2: Add Navigation Extraction to RouteRegistry

```typescript
// plugins/site-builder/src/lib/route-registry.ts
export class RouteRegistry {
  // ... existing methods ...

  /**
   * Get navigation items for a specific slot
   */
  getNavigationItems(slot: "footer" = "footer"): NavigationItem[] {
    const items: NavigationItem[] = [];

    for (const [path, route] of this.routes.entries()) {
      if (route.navigation?.show && route.navigation?.slot === slot) {
        items.push({
          label: route.navigation.label || route.title,
          href: path,
          priority: route.navigation.priority || 50,
        });
      }
    }

    // Sort by priority (lower numbers first)
    return items.sort((a, b) => a.priority - b.priority);
  }
}

export interface NavigationItem {
  label: string;
  href: string;
  priority: number;
}
```

#### Step 3: Create Footer Component

```typescript
// shared/default-site-content/src/footer/layout.tsx
import type { JSX } from "preact";

export interface FooterNavigationItem {
  label: string;
  href: string;
}

export interface FooterData {
  navigation: FooterNavigationItem[];
  copyright?: string;
}

export const FooterLayout = ({ navigation, copyright }: FooterData): JSX.Element => {
  const currentYear = new Date().getFullYear();
  const defaultCopyright = `© ${currentYear} Personal Brain. All rights reserved.`;

  return (
    <footer className="footer-section bg-gray-900 text-white py-12 mt-20">
      <div className="container mx-auto px-4">
        {/* Navigation Links */}
        <nav className="footer-navigation mb-8">
          <ul className="flex flex-wrap justify-center gap-6">
            {navigation.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  className="text-gray-300 hover:text-white transition-colors"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {/* Copyright */}
        <div className="text-center text-gray-400 text-sm">
          {copyright || defaultCopyright}
        </div>
      </div>
    </footer>
  );
};
```

```typescript
// shared/default-site-content/src/footer/schema.ts
import { z } from "@brains/utils";

export const FooterSchema = z.object({
  navigation: z.array(
    z.object({
      label: z.string(),
      href: z.string(),
    }),
  ),
  copyright: z.string().optional(),
});

export type FooterData = z.infer<typeof FooterSchema>;
```

```typescript
// shared/default-site-content/src/footer/index.ts
export { FooterLayout } from "./layout";
export { FooterSchema, type FooterData } from "./schema";
```

#### Step 4: Update PreactBuilder to Include Footer

```typescript
// plugins/site-builder/src/lib/preact-builder.ts
private async buildRoute(
  route: RouteDefinition,
  context: BuildContext,
): Promise<void> {
  // ... existing section rendering ...

  // Get footer navigation
  const footerNavigation = context.routeRegistry
    .getNavigationItems("footer")
    .map(item => ({ label: item.label, href: item.href }));

  // Render footer
  const footerHtml = this.renderFooter({
    navigation: footerNavigation
  });

  // Combine sections with footer
  const fullContent = `
    ${renderedSections.join('\n')}
    ${footerHtml}
  `;

  // ... rest of page generation ...
}

private renderFooter(data: FooterData): string {
  const FooterComponent = h(FooterLayout, data);
  return render(FooterComponent);
}
```

#### Step 5: Update Default-Site-Content Plugin

```typescript
// shared/default-site-content/src/index.ts
export const defaultRoutes: RouteDefinition[] = [
  {
    id: "home",
    path: "/",
    title: "Home",
    description: "Welcome to Personal Brain",
    navigation: {
      show: true,
      label: "Home",
      slot: "footer",
      priority: 10,
    },
    sections: [
      // ... existing sections ...
    ],
  },
];
```

#### Step 6: Update Plugin Routes

```typescript
// plugins/link/src/plugin.ts
const routes: RouteDefinition[] = [
  {
    id: "links-list",
    path: "/links",
    title: "Links",
    description: "Saved links and bookmarks",
    navigation: {
      show: true,
      label: "Links",
      slot: "footer",
      priority: 40,
    },
    sections: [...],
  },
  // Detail pages don't have navigation.show = true
  {
    id: "link-detail",
    path: "/links/:id",
    title: "Link Detail",
    navigation: undefined, // Or omit entirely
    sections: [...],
  },
];
```

### Testing Plan

1. **Unit Tests**
   - RouteRegistry.getNavigationItems() returns correct items
   - Navigation items are sorted by priority
   - Only routes with `show: true` are included

2. **Component Tests**
   - Footer renders navigation items
   - Footer handles empty navigation array
   - Footer displays copyright text

3. **Integration Tests**
   - Plugins can register routes with navigation
   - Footer appears on all generated pages
   - Navigation links are correct

### Migration Strategy

Since the navigation field is optional, existing code continues to work:

1. Deploy schema change (backward compatible)
2. Update plugins one by one to add navigation metadata
3. Deploy footer component
4. Update site builder to include footer

No breaking changes or data migration required.

## Phase 2: External Links & Sections

### External Links Support

```typescript
navigation: z.object({
  // ... existing fields ...
  external: z.boolean().default(false), // Mark as external link
  target: z.enum(["_self", "_blank"]).optional(), // Link target
}).optional(),
```

### Footer Sections

```typescript
// Group navigation items by section
export interface FooterSection {
  title: string;
  items: FooterNavigationItem[];
}

// Footer receives sections instead of flat list
export interface FooterData {
  sections: FooterSection[];
  copyright?: string;
}
```

## Phase 3: Header Navigation

### Additional Slots

```typescript
slot: z.enum([
  "header",    // Main header navigation
  "footer",    // Footer navigation
  "mobile",    // Mobile-specific menu
  "user",      // User account menu
  "sidebar",   // Documentation sidebar
]).default("footer"),
```

### Dropdown Support

```typescript
navigation: z.object({
  // ... existing fields ...
  children: z.array(NavigationItemSchema).optional(), // Nested items
}).optional(),
```

## Phase 4: Dynamic Features

### Client-Side Interactivity

- Mobile hamburger menu
- Dropdown menus
- Active page highlighting
- Smooth scroll

### User-Specific Navigation

- Show/hide based on authentication
- Role-based navigation items
- Personalized menu items

## Success Criteria

### Phase 1 (Footer Navigation)

- [x] Routes can include navigation metadata
- [x] Plugins can register navigation items
- [x] Footer displays navigation from all plugins
- [x] Navigation items are properly ordered
- [x] Footer appears on all pages

### Phase 2

- [ ] External links supported
- [ ] Footer sections/grouping implemented
- [ ] Social media links in footer

### Phase 3

- [ ] Header navigation component
- [ ] Multiple navigation slots working
- [ ] Responsive mobile menu

### Phase 4

- [ ] Interactive navigation features
- [ ] User-specific navigation
- [ ] Advanced navigation patterns

## Design Decisions

1. **Extend RouteRegistry** - Reuse existing infrastructure instead of new registry
2. **Optional navigation field** - Backward compatible, no migration needed
3. **Numeric priorities** - More flexible than named priorities
4. **Props-based components** - Footer receives data, doesn't fetch it
5. **Predefined slots** - Predictable, themeable locations
6. **Progressive enhancement** - Start simple, add features incrementally

## Alternative Approaches Considered

### Separate Navigation Registry

- ❌ More complex
- ❌ Duplicate data management
- ❌ Synchronization issues

### Automatic Navigation Discovery

- ❌ Less control
- ❌ Includes unwanted pages
- ❌ Can't control ordering

### Configuration Files

- ❌ Static, not plugin-friendly
- ❌ Manual maintenance
- ❌ Out of sync with actual routes

## Implementation Checklist

- [ ] Extend RouteDefinitionSchema with navigation field
- [ ] Add getNavigationItems method to RouteRegistry
- [ ] Create Footer component with schema and layout
- [ ] Update PreactBuilder to render footer
- [ ] Add navigation metadata to default-site-content routes
- [ ] Update plugin routes with navigation metadata
- [ ] Write unit tests for navigation extraction
- [ ] Write component tests for Footer
- [ ] Document navigation system for plugin developers
- [ ] Create example of plugin with navigation
