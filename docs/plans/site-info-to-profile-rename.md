# Rename site-info to profile (Core Entity)

## Overview

Rename the `site-info` entity type to `profile` and move it from site-builder plugin to shell/core as a global brain entity. Profile represents the public-facing identity and content of a brain instance - a core concept, not a plugin-specific concern.

**Key Change**: Profile becomes a core entity type (like identity), available to all plugins and interfaces.

## Rationale

- **Core brain concept**: Profile is fundamental to a brain's public identity, not site-builder-specific
- **Multiple consumers**: MCP, Matrix, and other interfaces may need profile data
- **Clearer semantics**: "profile" better describes public-facing brain content
- **Architectural clarity**: Core entities belong in shell/core, not in plugins

## Changes Required

### 1. Move Schema to Core

**From**: `plugins/site-builder/src/services/site-info-schema.ts`
**To**: `shell/core/src/entities/profile-schema.ts`

**Update schema**:

```typescript
// shell/core/src/entities/profile-schema.ts
import { z } from "zod";

export const profileBodySchema = z.object({
  title: z.string().describe("Site title"),
  description: z.string().describe("Site description"),
  url: z.string().optional().describe("Site URL"),
  copyright: z.string().optional().describe("Copyright notice"),

  socialLinks: z
    .array(
      z.object({
        platform: z.enum([
          "github",
          "instagram",
          "linkedin",
          "email",
          "website",
        ]),
        url: z.string(),
        label: z.string().optional(),
      }),
    )
    .optional()
    .default([]),

  cta: z
    .object({
      heading: z.string(),
      description: z.string(),
      primaryButton: z.object({
        text: z.string(),
        url: z.string(),
      }),
      secondaryButton: z
        .object({
          text: z.string(),
          url: z.string(),
        })
        .optional(),
    })
    .optional(),
});

export type ProfileBody = z.infer<typeof profileBodySchema>;

export const profileSchema = {
  entityType: "profile" as const,
  bodySchema: profileBodySchema,
  slug: "profile",
};
```

**Export from entities index**:

```typescript
// shell/core/src/entities/index.ts
export * from "./profile-schema";
export * from "./identity-schema";
// ... other core entities
```

### 2. Update Site Builder Plugin

**Files to modify**:

- `plugins/site-builder/src/index.ts`
- `plugins/site-builder/src/config.ts`

**Changes**:

1. Remove local schema file
2. Import from shell/core: `import { profileBodySchema, ProfileBody } from "@brains/shell-core"`
3. Update entity queries: `type: "site-info"` → `type: "profile"`
4. Update variable names for clarity
5. Remove schema re-exports

**Example**:

```typescript
// plugins/site-builder/src/index.ts
import { profileBodySchema, ProfileBody } from "@brains/shell-core";

async register(shell: IShell) {
  // Read profile entity
  const profileEntity = await shell.entityService.getEntity("profile", "profile");
  const profile = profileEntity?.body as ProfileBody;

  // Merge with plugin config (navigation, themeMode, etc.)
  const siteConfig = {
    ...profile,
    navigation: this.config.navigation,
    themeMode: this.config.themeMode,
  };
}
```

### 3. Update Plugin Config Schema

**File**: `plugins/site-builder/src/config.ts`

**Remove**:

- Local siteInfo schema definition
- siteInfo from plugin config (read from entity instead)

**Keep**:

- Structural config: navigation, themeMode, routes, layouts, templates

```typescript
export const siteBuilderConfigSchema = z.object({
  templates: z.record(z.any()).optional(),
  routes: z.array(z.any()).optional(),
  layouts: z.record(z.any()).optional(),
  navigation: z
    .object({
      primary: z.array(navigationItemSchema),
      secondary: z.array(navigationItemSchema).optional(),
    })
    .optional(),
  themeMode: z.enum(["light", "dark", "system"]).optional(),
  customTheme: z.record(z.string()).optional(),
});
```

### 4. Seed Content Files

**Rename files in all brains**:

- `apps/test-brain/seed-content/site-info.md` → `profile.md`
- `apps/team-brain/seed-content/site-info.md` → `profile.md`
- `apps/collective-brain/seed-content/site-info.md` → `profile.md`

**Update frontmatter**:

```markdown
---
type: profile
slug: profile
---

# Title

Title goes here
```

### 5. Brain Config Files

**Update plugin config** in `apps/*/brain.config.ts`:

**Add navigation and themeMode** to plugin config (no longer in entity):

```typescript
// apps/test-brain/brain.config.ts
siteBuilderPlugin({
  templates,
  routes,
  layouts,
  navigation: {
    primary: [
      { label: "About", path: "/about" },
      { label: "Notes", path: "/notes" },
    ],
    secondary: [{ label: "Privacy", path: "/privacy" }],
  },
  themeMode: "light",
});
```

**Note**: Profile content (title, description, socialLinks, etc.) comes from entity, not config.

### 6. Tests

**Update tests**:

- `plugins/site-builder/src/*.test.ts` - Update imports and mocks
- `shell/core/src/entities/*.test.ts` - Add profile schema tests if needed

**Changes**:

- Update mock entity types: `"site-info"` → `"profile"`
- Update schema imports: `import { profileBodySchema } from "@brains/shell-core"`
- Update test assertions

## Implementation Steps

### Phase 1: Create Core Profile Schema

1. Create `shell/core/src/entities/profile-schema.ts`
2. Move and update schema from site-builder
3. Export from `shell/core/src/entities/index.ts`
4. Run typecheck: `bun run typecheck`
5. Write tests for schema if needed

### Phase 2: Update Site Builder Plugin

1. Remove `plugins/site-builder/src/services/site-info-schema.ts`
2. Update imports to use `@brains/shell-core`
3. Update entity queries to `type: "profile"`
4. Update plugin to merge entity data with config
5. Update plugin config schema (add navigation/themeMode)
6. Run typecheck: `bun run typecheck`
7. Update plugin tests: `bun test plugins/site-builder`

### Phase 3: Update Seed Content

1. Rename `site-info.md` → `profile.md` in **collective-brain** (start here)
2. Update frontmatter: `type: profile`
3. Rename in team-brain
4. Rename in test-brain
5. Update all frontmatter
6. Test brain startup with new seed content

### Phase 4: Update Brain Configs

1. Start with **collective-brain** brain.config.ts
2. Add `navigation` to site builder plugin config
3. Add `themeMode` to site builder plugin config
4. Remove any explicit profile/siteInfo data from config
5. Run typecheck: `bun run typecheck`
6. Repeat for team-brain and test-brain

### Phase 5: Full Validation

1. Run typecheck: `bun run typecheck`
2. Run all tests: `bun test`
3. Start **collective-brain first** and verify:
   - Profile entity created from seed content
   - Site builder reads profile correctly
   - Navigation from config works
   - Generated sites render properly
4. Then validate team-brain and test-brain
5. Search for remaining references: `git grep -i "site-info"`

## Testing Checklist

### Unit Tests

- [ ] Profile schema in shell/core tests pass
- [ ] Site builder imports from shell/core
- [ ] Entity queries use "profile" type
- [ ] Plugin config schema updated
- [ ] Type checking passes across all packages

### Integration Tests

- [ ] **collective-brain** site builds with profile data (test first)
- [ ] team-brain profile entity created correctly
- [ ] test-brain starts with profile.md seed content
- [ ] Navigation from config renders correctly
- [ ] Theme mode from config applied
- [ ] Social links display from profile entity
- [ ] CTA content from profile entity

### Manual Validation

```bash
# Typecheck
bun run typecheck

# Run tests
bun test

# Start each brain (collective-brain first)
bun apps/collective-brain/brain.config.ts
bun apps/team-brain/brain.config.ts
bun apps/test-brain/brain.config.ts

# Verify profile entities exist
# Check generated sites
# Verify navigation and theme work

# Search for remaining references
git grep -i "site-info"
git grep -i "siteInfo"
```

## Migration for Existing Deployments

If brains are already running with `site-info` entities:

**Option 1: Database migration script**

```typescript
// Run once on deployment
async function migrateSiteInfoToProfile(entityService: EntityService) {
  const siteInfo = await entityService.getEntity("site-info", "site-info");
  if (siteInfo) {
    // Create profile with content fields only
    await entityService.createEntity({
      type: "profile",
      slug: "profile",
      body: {
        title: siteInfo.body.title,
        description: siteInfo.body.description,
        url: siteInfo.body.url,
        copyright: siteInfo.body.copyright,
        socialLinks: siteInfo.body.socialLinks,
        cta: siteInfo.body.cta,
        // navigation and themeMode move to config
      },
    });
    await entityService.deleteEntity("site-info", "site-info");
  }
}
```

**Option 2: Fresh start**

- Delete database, let seed-content recreate entities
- Update brain configs with navigation/themeMode
- Redeploy

## Success Criteria

1. ✅ Profile schema in `shell/core/src/entities/`
2. ✅ Site builder imports from `@brains/shell-core`
3. ✅ All seed-content files renamed to `profile.md`
4. ✅ Navigation and themeMode in plugin config
5. ✅ Profile entity contains only content fields
6. ✅ All tests passing
7. ✅ TypeScript strict mode satisfied
8. ✅ All three brains start successfully
9. ✅ Generated sites work correctly
10. ✅ No "site-info" references remain

## Files Changed Summary

### New Files

- `shell/core/src/entities/profile-schema.ts` - Core profile entity schema

### Removed Files

- `plugins/site-builder/src/services/site-info-schema.ts` - Moved to core

### Renamed Files

- `apps/*/seed-content/site-info.md` → `profile.md` (all brains)

### Modified Files

- `shell/core/src/entities/index.ts` - Export profile schema
- `plugins/site-builder/src/index.ts` - Import from core, use profile entity
- `plugins/site-builder/src/config.ts` - Update config schema
- `plugins/site-builder/src/*.test.ts` - Update tests
- `apps/*/brain.config.ts` - Add navigation/themeMode to plugin config

## Architecture Benefits

### Before (Plugin-specific)

```
site-builder plugin
  └─ owns site-info schema
  └─ only site-builder can use it
  └─ tightly coupled
```

### After (Core entity)

```
shell/core
  └─ profile schema (global)
      ├─ site-builder reads it
      ├─ MCP interface could expose it
      ├─ Matrix interface could use it
      └─ any plugin can access it
```

## Timeline Estimate

- **Phase 1** (Core schema): 45 minutes
- **Phase 2** (Site builder): 1.5 hours
- **Phase 3** (Seed content): 30 minutes
- **Phase 4** (Configs): 1 hour
- **Phase 5** (Validation): 1 hour

**Total**: ~4.75 hours

## Notes

- Profile is now a **core brain entity**, not plugin-specific
- Schema lives in `shell/core` alongside identity
- Site builder becomes a **consumer** of profile, not owner
- Navigation and themeMode are **structural config**, stay in plugin config
- Profile entity contains **pure content** (title, description, socialLinks, cta, copyright)
- Multiple plugins/interfaces can read profile for different purposes
