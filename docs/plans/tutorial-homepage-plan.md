# Tutorial Homepage Implementation Plan

**Date:** 2025-10-17
**Status:** Approved - Ready for Implementation

## Goal

Make the tutorial README the default homepage for new teams, automatically transitioning to the normal homepage after the team has content.

### User Requirements

- **Initial state:** Show tutorial README as homepage at `/` for new teams
- **After first build:** Homepage shows normal intro, tutorial accessible at `/tutorial`
- **Trigger:** When site has been built at least once (indicates team is set up)

## Implementation Strategy

### Phase 1: Create Tutorial Template Package

**Location:** `shared/tutorial-content/`

**Package Structure:**

```
shared/tutorial-content/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # Main exports
│   ├── templates.ts          # Template exports
│   ├── routes.ts             # Route definitions
│   └── tutorial/
│       ├── index.ts          # Tutorial template
│       ├── schema.ts         # Tutorial content schema
│       ├── formatter.ts      # Tutorial formatter
│       ├── layout.tsx        # Preact component
│       └── content.md        # Tutorial markdown content
```

**Template Design:**

- **Schema:** Simple schema with `markdown` field containing README content
- **Layout:** Preact component that renders markdown to HTML
- **Formatter:** Simple markdown formatter
- **Style:** Uses minimal layout (same as current homepage)

**Route Definition:**

```typescript
{
  id: "tutorial",
  path: "/tutorial",
  title: "Getting Started Tutorial",
  description: "Step-by-step guide to using Team Brain",
  layout: "minimal",
  navigation: {
    show: true,
    label: "Tutorial",
    slot: "secondary",
    priority: 90
  },
  sections: [{ id: "tutorial", template: "tutorial" }],
}
```

### Phase 2: Create Conditional Homepage Template

**Location:** `shared/default-site-content/src/home-content/`

**Conditional Logic:**

```typescript
// Check if this is first build (no entities exist yet)
const entityCount = await context.entityService.countEntities();

if (entityCount === 0) {
  // Return tutorial markdown for brand new installs
  return tutorialContent;
} else {
  // Return normal intro content for established teams
  return introContent;
}
```

**Modified Home Route:**

```typescript
{
  id: "home",
  path: "/",
  title: "Home",
  description: "Team Brain - Getting Started",
  layout: "minimal",
  navigation: { show: true, label: "Home", slot: "primary", priority: 10 },
  sections: [
    {
      id: "welcome",
      template: "home-content", // New conditional template
    }
  ],
}
```

### Phase 3: Update Team Brain Configuration

**Location:** `apps/team-brain/brain.config.ts`

**Changes:**

1. Import tutorial content:

   ```typescript
   import { tutorialTemplate, tutorialRoutes } from "@brains/tutorial-content";
   ```

2. Update siteBuilderPlugin:
   ```typescript
   siteBuilderPlugin({
     templates: [...templates, tutorialTemplate],
     routes: [...routes, ...tutorialRoutes],
     layouts: {
       default: DefaultLayout,
       minimal: MinimalLayout,
     },
     themeCSS,
   });
   ```

### Phase 4: Copy Tutorial Content

**Source:** `apps/team-brain/seed-content/README.md`
**Destination:** `shared/tutorial-content/src/tutorial/content.md`

- Copy complete tutorial markdown
- Embed as default content in tutorial template
- Keep original README.md as seed content for directory sync

## File Changes Summary

### New Files (8 files)

- `shared/tutorial-content/package.json`
- `shared/tutorial-content/tsconfig.json`
- `shared/tutorial-content/src/index.ts`
- `shared/tutorial-content/src/templates.ts`
- `shared/tutorial-content/src/routes.ts`
- `shared/tutorial-content/src/tutorial/index.ts`
- `shared/tutorial-content/src/tutorial/schema.ts`
- `shared/tutorial-content/src/tutorial/formatter.ts`
- `shared/tutorial-content/src/tutorial/layout.tsx`
- `shared/tutorial-content/src/tutorial/content.md`

### Modified Files (2 files)

- `apps/team-brain/brain.config.ts` - Add tutorial imports and configuration
- `shared/default-site-content/src/routes.ts` - Add conditional home-content template

### Optional Files

- `shared/default-site-content/src/home-content/` - Conditional template (if implementing Phase 2)

## Benefits

1. **Better Onboarding:** New teams immediately see comprehensive tutorial
2. **Always Accessible:** Tutorial permanently available at `/tutorial`
3. **Progressive Disclosure:** Homepage automatically transitions when team has content
4. **No Breaking Changes:** Existing deployments continue working normally
5. **Maintainable:** Single source of truth for tutorial content

## Technical Details

### Entity Count Check

```typescript
// In conditional template
const count = await context.entityService.countEntities({
  entityTypes: ["link", "topic", "note"],
});
```

### Markdown Rendering

- Use existing markdown utilities from `@brains/utils`
- Sanitize HTML output for security
- Preserve formatting, code blocks, and checkboxes

### Navigation Slots

- **Primary navigation:** Home (priority 10)
- **Secondary navigation:** Tutorial (priority 90)
- Tutorial accessible but not prominent after initial setup

## Testing Plan

1. **New Installation:**
   - Install team-brain
   - Visit `/` - should show tutorial
   - Build site - should still show tutorial (no content yet)
   - Add first link
   - Rebuild site - homepage shows intro, tutorial at `/tutorial`

2. **Existing Installation:**
   - Has existing content
   - Homepage shows normal intro
   - `/tutorial` shows tutorial content
   - Both accessible via navigation

3. **Direct Navigation:**
   - `/` - Conditional homepage
   - `/tutorial` - Always tutorial
   - Navigation links work correctly

## Migration Notes

- No migration needed for existing deployments
- New package added to monorepo dependencies
- Team brain config updated (backward compatible)
- Automatic behavior based on content presence

## Implementation Order

1. ✅ Plan approved and documented
2. ⏳ Create `tutorial-content` package with basic structure
3. ⏳ Implement tutorial template with markdown layout
4. ⏳ Copy README content to tutorial template
5. ⏳ Update team-brain config
6. ⏳ (Optional) Implement conditional homepage template
7. ⏳ Test with clean install
8. ⏳ Test with existing content
9. ⏳ Update workspace dependencies
10. ⏳ Build and verify

## Notes

- Keep this plan updated as implementation progresses
- Document any deviations or discoveries
- Update status when complete
