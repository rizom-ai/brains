# Owner Entity Introduction

## Overview

Introduce a new `owner` entity to properly separate three distinct concerns that are currently conflated:

1. **Identity** - The brain's AI personality and behavior
2. **Owner** - The person/organization operating the brain (NEW)
3. **Site-info** - The website's presentation and configuration

## Problem Statement

Currently, site-info mixes two different concerns:

- **Website presentation**: title, description, CTA, theme
- **Owner information**: socialLinks, contact info, copyright

This creates confusion:

```typescript
// Current collective-brain config
identity: {
  name: "Rizom",  // Actually the OWNER name, not the brain's!
  role: "...",    // This IS the brain's role
}

siteInfo: {
  title: "Rizom",      // Site title
  socialLinks: [...],  // OWNER's social links, not site's
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

### 2. Owner (Person/Organization) - NEW

**Purpose**: Information about who operates the brain
**Fields**: name, bio, socialLinks, contact info
**Example**:

```yaml
type: owner
slug: owner
---
# Owner

## Name
Rizom

## Bio
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

## Owner Entity Design

### Schema

**Location**: `shell/owner-service/src/schema.ts`

```typescript
import { z } from "@brains/utils";
import { baseEntitySchema } from "@brains/entity-service";

/**
 * Owner entity schema
 * Represents the person or organization operating the brain
 */
export const ownerSchema = baseEntitySchema.extend({
  id: z.literal("owner"),
  entityType: z.literal("owner"),
});

export type OwnerEntity = z.infer<typeof ownerSchema>;

/**
 * Owner body schema - information about the brain's operator
 */
export const ownerBodySchema = z.object({
  name: z.string().describe("Owner's name (person or organization)"),
  bio: z.string().optional().describe("Short biography or description"),
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

export type OwnerBody = z.infer<typeof ownerBodySchema>;
```

### Service

**Location**: `shell/owner-service/src/owner-service.ts`

Similar pattern to IdentityService:

- Singleton with getInstance/resetInstance/createFresh
- Caching for performance
- Default owner creation if none exists
- `getOwner()` convenience method

### Adapter

**Location**: `shell/owner-service/src/adapter.ts`

- Markdown parsing and generation
- Structured content formatting
- Entity conversion

## Migration Plan

### Data Reorganization

**From site-info to owner**:

- `socialLinks` → owner entity
- Contact information
- Any biographical data

**Stays in site-info**:

- `title`, `description`
- `cta` (call to action)
- `copyright` (stays here as it's about the site's content rights)
- `navigation`, `themeMode` (website config)

### Implementation Steps

#### Phase 1: Create Owner Service Package

1. Create `shell/owner-service/` package
2. Create schema (`src/schema.ts`)
3. Create adapter (`src/adapter.ts`)
4. Create service (`src/owner-service.ts`)
5. Create `src/index.ts` exports
6. Add package.json
7. Run typecheck: `bun run typecheck`

#### Phase 2: Update Site Builder Plugin

1. Add owner-service dependency
2. Update site builder to read both owner and site-info
3. Merge owner.socialLinks into site data
4. Update types to reflect split
5. Run typecheck: `bun run typecheck`
6. Update plugin tests

#### Phase 3: Create Owner Seed Content (collective-brain first)

1. Create `apps/collective-brain/seed-content/owner.md`
2. Populate with Rizom org data:
   - name: "Rizom"
   - bio: "Open-source collective..."
   - socialLinks: LinkedIn, GitHub, Email
3. Test brain startup

#### Phase 4: Update Site-info (remove owner data)

1. Update `apps/collective-brain/seed-content/site-info.md`
2. Remove socialLinks (now in owner)
3. Keep: title, description, CTA, copyright
4. Test site generation

#### Phase 5: Update Brain Config (Remove Data Duplication)

**Goal**: Config should only contain code/structure, not data. All entity data should come from seed-content.

1. Remove `identity` object from brain.config.ts (data now in seed-content/identity.md)
2. Remove `siteInfo` object from brain.config.ts (data now in seed-content/site-info.md and owner.md)
3. Verify site builder reads from entities (owner and site-info)
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

#### Phase 6: Migrate Other Brains

1. Repeat Phase 3-5 for team-brain
2. Repeat Phase 3-5 for test-brain

#### Phase 7: Update Site-info Schema

1. Remove socialLinks from site-info schema
2. Update documentation
3. Run full test suite

## Testing Checklist

### Unit Tests

- [ ] Owner schema validation works
- [ ] OwnerAdapter parses markdown correctly
- [ ] OwnerService caches and provides owner data
- [ ] Site builder merges owner and site-info data
- [ ] Type checking passes across all packages

### Integration Tests

- [ ] collective-brain starts with owner entity
- [ ] Site builder reads owner.socialLinks
- [ ] Social links display in footer
- [ ] team-brain owner entity created correctly
- [ ] test-brain owner entity created correctly

### Manual Validation

```bash
# Typecheck
bun run typecheck

# Run tests
bun test

# Start collective-brain (test first)
bun apps/collective-brain/brain.config.ts

# Verify owner entity exists
# Check social links in generated site
# Verify site-info no longer has socialLinks

# Repeat for team-brain and test-brain
```

## Migration for Existing Deployments

For brains already running with socialLinks in site-info:

**Migration script** (run once on deployment):

```typescript
async function migrateSocialLinksToOwner(entityService: EntityService) {
  // Get existing site-info
  const siteInfo = await entityService.getEntity("site-info", "site-info");

  if (siteInfo?.body?.socialLinks) {
    // Create owner entity with social links
    await entityService.createEntity({
      type: "owner",
      slug: "owner",
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

1. ✅ Owner service package created in `shell/owner-service/`
2. ✅ Owner schema, adapter, and service implemented
3. ✅ Site builder reads from both owner and site-info
4. ✅ collective-brain has owner entity with social links
5. ✅ team-brain has owner entity
6. ✅ test-brain has owner entity
7. ✅ Site-info no longer contains socialLinks
8. ✅ All tests passing
9. ✅ TypeScript strict mode satisfied
10. ✅ Generated sites show social links correctly

## Files Changed Summary

### New Files

- `shell/owner-service/package.json`
- `shell/owner-service/src/schema.ts`
- `shell/owner-service/src/adapter.ts`
- `shell/owner-service/src/owner-service.ts`
- `shell/owner-service/src/index.ts`
- `apps/collective-brain/seed-content/owner.md`
- `apps/team-brain/seed-content/owner.md`
- `apps/test-brain/seed-content/owner.md`

### Modified Files

- `plugins/site-builder/src/plugin.ts` - Read owner entity
- `plugins/site-builder/src/services/site-info-schema.ts` - Remove socialLinks
- `apps/collective-brain/seed-content/site-info.md` - Remove socialLinks
- `apps/team-brain/seed-content/site-info.md` - Remove socialLinks
- `apps/test-brain/seed-content/site-info.md` - Remove socialLinks
- `apps/collective-brain/brain.config.ts` - Remove identity and siteInfo objects (data moved to entities)
- `apps/team-brain/brain.config.ts` - Remove identity and siteInfo objects (data moved to entities)
- `apps/test-brain/brain.config.ts` - Remove identity and siteInfo objects (data moved to entities)

## Architecture Benefits

### Before (Conflated)

```
site-info entity
  ├─ website presentation (title, CTA)
  └─ owner information (socialLinks) ← WRONG!

identity entity
  └─ name: "Rizom" ← Actually owner name, not brain!
```

### After (Separated)

```
identity entity
  └─ Brain AI personality (role, purpose, values)

owner entity (NEW)
  └─ Person/org info (name, bio, socialLinks)

site-info entity
  └─ Website presentation (title, description, CTA)
```

## Timeline Estimate

- **Phase 1** (Owner service): 2-3 hours
- **Phase 2** (Site builder): 1-2 hours
- **Phase 3** (Collective-brain owner): 1 hour
- **Phase 4** (Update site-info): 30 minutes
- **Phase 5** (Brain config): 30 minutes
- **Phase 6** (Other brains): 1-2 hours
- **Phase 7** (Schema cleanup): 1 hour

**Total**: 7-10 hours

## Notes

- Owner is about **who operates the brain** (person/organization)
- Identity is about **the brain's AI personality**
- Site-info is about **the website's presentation**
- This matches the real-world model: a person (owner) operates an AI (identity) and publishes a website (site-info)
- Social links belong to the owner, not the website
- Copyright stays in site-info as it's about content rights, not the owner's identity

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
