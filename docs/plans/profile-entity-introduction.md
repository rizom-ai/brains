# Profile Entity Introduction

## Overview

Introduce a new `profile` entity to properly separate three distinct concerns that are currently conflated:

1. **Identity** - The brain's AI personality and behavior
2. **Profile** - The person/organization's public presence (NEW)
3. **Site-info** - The website's presentation and configuration

## Problem Statement

Currently, site-info mixes two different concerns:

- **Website presentation**: title, description, CTA, theme
- **Profile information**: socialLinks, contact info, bio

This creates confusion:

```typescript
// Current collective-brain config
identity: {
  name: "Rizom",  // Actually the person/org name, not the brain's!
  role: "...",    // This IS the brain's role
}

siteInfo: {
  title: "Rizom",      // Site title
  socialLinks: [...],  // Person/org's social links, not site's
}
```

## Solution: Three Distinct Entities

### 1. Identity (Brain)

**Purpose**: AI personality and behavior
**Fields**: role, purpose, values
**Example**:

```yaml
type: identity
slug: identity
---
# Identity

## Role
Collective knowledge coordinator

## Purpose
Coordinate collective knowledge, facilitate collaboration...

## Values
- openness
- collaboration
- innovation
```

### 2. Profile (Person/Organization) - NEW

**Purpose**: Public profile of the person/organization
**Fields**: name, description, socialLinks, contact info
**Example**:

```yaml
type: profile
slug: profile
---
# Profile

## Name
Rizom

## Description
Open-source collective building privacy-first tools

## Social Links
- LinkedIn: https://linkedin.com/company/rizom-collective
- GitHub: https://github.com/rizom-ai
- Email: contact@rizom.ai
```

### 3. Site-info (Website)

**Purpose**: Website presentation and configuration
**Fields**: title, description, CTA, copyright, navigation, theme
**Example**:

```yaml
type: site-info
slug: site-info
---
# Site Info

## Title
Rizom

## Description
The Rizom collective's knowledge hub

## CTA
Heading: Unlock your full potential
Button: Join Rizom
Link: https://linkedin.com/company/rizom-collective
```

## Profile Entity Design

### Schema

**Location**: `shell/profile-service/src/schema.ts`

```typescript
import { z } from "@brains/utils";
import { baseEntitySchema } from "@brains/entity-service";

/**
 * Profile entity schema
 * Represents the public profile of the person or organization
 */
export const profileSchema = baseEntitySchema.extend({
  id: z.literal("profile"),
  entityType: z.literal("profile"),
});

export type ProfileEntity = z.infer<typeof profileSchema>;

/**
 * Profile body schema - public profile information
 */
export const profileBodySchema = z.object({
  name: z.string().describe("Name (person or organization)"),
  description: z.string().optional().describe("Short description or biography"),
  website: z.string().optional().describe("Primary website URL"),
  email: z.string().optional().describe("Contact email"),
  socialLinks: z
    .array(
      z.object({
        platform: z
          .enum(["github", "instagram", "linkedin", "email", "website"])
          .describe("Social media platform"),
        url: z.string().describe("Profile or contact URL"),
        label: z.string().optional().describe("Optional display label"),
      }),
    )
    .optional()
    .describe("Social media and contact links"),
});

export type ProfileBody = z.infer<typeof profileBodySchema>;
```

### Service

**Location**: `shell/profile-service/src/profile-service.ts`

Similar pattern to IdentityService:

- Singleton with getInstance/resetInstance/createFresh
- Caching for performance
- Default profile creation if none exists
- `getProfile()` convenience method

### Adapter

**Location**: `shell/profile-service/src/adapter.ts`

- Markdown parsing and generation
- Structured content formatting
- Entity conversion

## Migration Plan

### Data Reorganization

**From site-info to profile**:

- `socialLinks` → profile entity
- Contact information (email, website)
- Any biographical/description data

**Stays in site-info**:

- `title`, `description`
- `cta` (call to action)
- `copyright` (stays here as it's about the site's content rights)
- `navigation`, `themeMode` (website config)

### Implementation Steps

#### Phase 1: Create Profile Service Package ✅ COMPLETED

1. ✅ Create `shell/profile-service/` package
2. ✅ Create schema (`src/schema.ts`)
3. ✅ Create adapter (`src/adapter.ts`)
4. ✅ Create service (`src/profile-service.ts`)
5. ✅ Create `src/index.ts` exports
6. ✅ Add package.json
7. ✅ Add tsconfig.json
8. ✅ Run typecheck: `bun run typecheck`
9. ✅ All tests passing (25 tests)
10. ✅ Committed and pushed: `49a397b5`

**Notes:**

- Used `description` field instead of `bio` for clarity
- Implemented proper Zod validation using `z.input<typeof schema>` to handle `exactOptionalPropertyTypes`
- Established pattern for optional fields in adapters using StructuredContentFormatter

#### Phase 2: Update Site Builder Plugin ⏳ PENDING

1. Add profile-service dependency
2. Update site builder to read both profile and site-info
3. Merge profile.socialLinks into site data
4. Update types to reflect split
5. Run typecheck: `bun run typecheck`
6. Update plugin tests

**Note:** Before implementing this phase, we should revisit site-info service to create a proper adapter following the same pattern as profile-service and identity-service. Currently, site-info has custom behavior that differs from other services.

#### Phase 3: Create Profile Seed Content (collective-brain first) ⏳ PENDING

1. Create `apps/collective-brain/seed-content/profile.md`
2. Populate with Rizom org data:
   - name: "Rizom"
   - description: "Open-source collective..."
   - socialLinks: LinkedIn, GitHub, Email
3. Test brain startup

#### Phase 4: Update Site-info (remove profile data) ⏳ PENDING

1. Update `apps/collective-brain/seed-content/site-info.md`
2. Remove socialLinks (now in profile)
3. Keep: title, description, CTA, copyright
4. Test site generation

#### Phase 5: Update Brain Config (Remove Data Duplication) ⏳ PENDING

**Goal**: Config should only contain code/structure, not data. All entity data should come from seed-content.

1. Remove `identity` object from brain.config.ts (data now in seed-content/identity.md)
2. Remove `siteInfo` object from brain.config.ts (data now in seed-content/site-info.md and profile.md)
3. Verify site builder reads from entities (profile and site-info)
4. Run typecheck: `bun run typecheck`
5. Test full site build

**Before** (brain.config.ts):

```typescript
const config = defineConfig({
  name: "rizom",

  identity: {  // ❌ Remove - belongs in entity
    name: "Rizom",
    role: "...",
    purpose: "...",
    values: [...]
  },

  siteBuilderPlugin({
    siteInfo: {  // ❌ Remove - belongs in entities
      title: "Rizom",
      socialLinks: [...],
      cta: {...}
    }
  })
});
```

**After** (brain.config.ts):

```typescript
const config = defineConfig({
  name: "rizom",
  // ✅ No identity - comes from seed-content/identity.md
  // ✅ No siteInfo - comes from seed-content/site-info.md and owner.md

  siteBuilderPlugin({
    templates,
    routes,
    layouts,
    navigation: {...},  // Structural config stays
    themeMode: "dark",  // Structural config stays
  })
});
```

#### Phase 6: Migrate Other Brains ⏳ PENDING

1. Repeat Phase 3-5 for team-brain
2. Repeat Phase 3-5 for test-brain

#### Phase 7: Update Site-info Schema ⏳ PENDING

1. Remove socialLinks from site-info schema
2. Update documentation
3. Run full test suite

## Testing Checklist

### Unit Tests

- [x] Profile schema validation works
- [x] ProfileAdapter parses markdown correctly
- [x] ProfileService caches and provides profile data
- [ ] Site builder merges profile and site-info data
- [x] Type checking passes across all packages

### Integration Tests

- [ ] collective-brain starts with profile entity
- [ ] Site builder reads profile.socialLinks
- [ ] Social links display in footer
- [ ] team-brain profile entity created correctly
- [ ] test-brain profile entity created correctly

### Manual Validation

```bash
# Typecheck
bun run typecheck

# Run tests
bun test

# Start collective-brain (test first)
bun apps/collective-brain/brain.config.ts

# Verify profile entity exists
# Check social links in generated site
# Verify site-info no longer has socialLinks

# Repeat for team-brain and test-brain
```

## Migration for Existing Deployments

For brains already running with socialLinks in site-info:

**Migration script** (run once on deployment):

```typescript
async function migrateSocialLinksToProfile(entityService: EntityService) {
  // Get existing site-info
  const siteInfo = await entityService.getEntity("site-info", "site-info");

  if (siteInfo?.body?.socialLinks) {
    // Create profile entity with social links
    await entityService.createEntity({
      type: "profile",
      slug: "profile",
      body: {
        name: siteInfo.body.title, // Use site title as starting point
        socialLinks: siteInfo.body.socialLinks,
      },
    });

    // Remove socialLinks from site-info
    const updatedBody = { ...siteInfo.body };
    delete updatedBody.socialLinks;

    await entityService.updateEntity("site-info", "site-info", {
      body: updatedBody,
    });
  }
}
```

## Success Criteria

1. ✅ Profile service package created in `shell/profile-service/`
2. ✅ Profile schema, adapter, and service implemented
3. ⏳ Site builder reads from both profile and site-info
4. ⏳ collective-brain has profile entity with social links
5. ⏳ team-brain has profile entity
6. ⏳ test-brain has profile entity
7. ⏳ Site-info no longer contains socialLinks
8. ✅ All profile-service tests passing (25/25)
9. ✅ TypeScript strict mode satisfied
10. ⏳ Generated sites show social links correctly

**Status: Phase 1 Complete (1/7 phases)**

## Files Changed Summary

### New Files

- `shell/profile-service/package.json`
- `shell/profile-service/src/schema.ts`
- `shell/profile-service/src/adapter.ts`
- `shell/profile-service/src/profile-service.ts`
- `shell/profile-service/src/index.ts`
- `apps/collective-brain/seed-content/profile.md`
- `apps/team-brain/seed-content/profile.md`
- `apps/test-brain/seed-content/profile.md`

### Modified Files

- `plugins/site-builder/src/plugin.ts` - Read profile entity
- `plugins/site-builder/src/services/site-info-schema.ts` - Remove socialLinks
- `apps/collective-brain/seed-content/site-info.md` - Remove socialLinks
- `apps/team-brain/seed-content/site-info.md` - Remove socialLinks
- `apps/test-brain/seed-content/site-info.md` - Remove socialLinks
- `apps/collective-brain/brain.config.ts` - Remove identity and siteInfo data objects (moved to entities)
- `apps/team-brain/brain.config.ts` - Remove identity and siteInfo data objects (moved to entities)
- `apps/test-brain/brain.config.ts` - Remove identity and siteInfo data objects (moved to entities)

## Architecture Benefits

### Before (Conflated)

```
site-info entity
  ├─ website presentation (title, CTA)
  └─ profile information (socialLinks) ← WRONG!

identity entity
  └─ name: "Rizom" ← Actually person/org name, not brain!
```

### After (Separated)

```
identity entity
  └─ Brain AI personality (role, purpose, values)

profile entity (NEW)
  └─ Person/org public profile (name, bio, socialLinks)

site-info entity
  └─ Website presentation (title, description, CTA)
```

## Timeline Estimate

- **Phase 1** (Profile service): 2-3 hours
- **Phase 2** (Site builder): 1-2 hours
- **Phase 3** (Collective-brain profile): 1 hour
- **Phase 4** (Update site-info): 30 minutes
- **Phase 5** (Brain config): 30 minutes
- **Phase 6** (Other brains): 1-2 hours
- **Phase 7** (Schema cleanup): 1 hour

**Total**: 7-10 hours

## Notes

- Profile is the **public profile** of the person/organization (name, bio, socialLinks)
- Identity is about **the brain's AI personality** (role, purpose, values)
- Site-info is about **the website's presentation** (title, description, CTA)
- This matches the real-world model: a person/org (profile) operates an AI (identity) and publishes a website (site-info)
- Social links belong to the profile, not the website
- Copyright stays in site-info as it's about content rights, not the profile

### Config vs Entities Principle

**Brain config (brain.config.ts)** should contain:

- ✅ Code: plugin instantiation, imports, route logic
- ✅ Structure: navigation, themeMode, layouts
- ✅ Environment variables: process.env references
- ✅ Permissions: security rules

**Entities (seed-content/\*.md)** should contain:

- ✅ Data: identity, owner info, site content
- ✅ Content: descriptions, text, links
- ✅ Instance-specific values: names, titles, bios

**Rule**: If it can be edited via MCP/Matrix/UI, it belongs in an entity, not config.

## Additional Tasks

### Site-info Adapter Standardization (Pre-Phase 2) ✅ COMPLETED

**Priority**: Should be completed before Phase 2 - **DONE**

**Issue**: The site-info service had custom behavior that differed from the standard adapter pattern used by identity-service and profile-service.

**Implemented** (Commit `99037e8f`):

- ✅ Added Zod validation using `z.input<typeof siteInfoBodySchema>`
- ✅ Explicit `.parse()` call for validation
- ✅ Proper handling of optional fields with exactOptionalPropertyTypes
- ✅ All 29 tests passing (17 adapter + 12 service)
- ✅ Typecheck passes

**Implementation Notes**:

- Preserved site-info's intentional **dynamic formatter behavior**
- Unlike profile-service (which includes all field headers), site-info only includes field headers for fields that have values
- This makes generated markdown cleaner when optional fields aren't used
- Pattern now consistent: all adapters use `z.input` + `.parse()` for validation

**Ready for Phase 2**
