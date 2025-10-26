# SiteInfo Entity Refactor Plan

## Overview

Refactor site configuration to follow the Identity service pattern: store all site information (title, description, CTA, etc.) as a singleton entity that can be configured in `brain.config.ts`, edited as a markdown file, and cached via a service.

## Problem Statement

### Current Issues

1. **CTA stored as entity, but basic site info is not**
   - CTA requires a full template system (schema, formatter, layout)
   - Basic site config (title, description) is static in plugin config
   - Inconsistent patterns for site-wide configuration

2. **Cannot edit site info at runtime**
   - Site title, description, copyright are locked in config
   - No way to update these through markdown files
   - Directory sync doesn't help with site-level settings

3. **CTA template system is over-engineered**
   - Dedicated template just for 3 fields
   - Added complexity in content queries and rendering
   - Not reusable or extensible

### Current State

**Site Info Sources:**

- `siteConfig` in `siteBuilderPlugin()` → Static (title, description, url, copyright, themeMode)
- `RouteRegistry` → Dynamic navigation items
- `site-content/home/cta.md` → CTA entity with template
- `SiteInfoDataSource` → Merges config + navigation

**Identity Pattern (for comparison):**

- `identity` config in app → Override defaults
- `brain-data/identity/identity.md` → Entity storage
- `IdentityService` → Caching + access
- `IdentityAdapter` → Structured markdown formatting

## Proposed Solution

### Make SiteInfo an Entity

Store all site information as a singleton entity following the identity pattern:

- **Entity**: `id: "site-info"`, `entityType: "site-info"`
- **Storage**: `brain-data/site-info/site-info.md`
- **Service**: `SiteInfoService` in site-builder plugin
- **Config**: Override defaults via `siteBuilderPlugin({ siteInfo: {...} })`

### SiteInfo Schema

```typescript
// Entity schema
const siteInfoSchema = baseEntitySchema.extend({
  id: z.literal("site-info"),
  entityType: z.literal("site-info"),
});

// Body schema (content structure)
const siteInfoBodySchema = z.object({
  title: z.string(),
  description: z.string(),
  url: z.string().optional(),
  copyright: z.string().optional(),
  themeMode: z.enum(["light", "dark"]).optional(),
  cta: z.object({
    heading: z.string(),
    buttonText: z.string(),
    buttonLink: z.string(),
  }),
});
```

### Example Markdown

```markdown
# Site Information

## Title

Rizom

## Description

The Rizom collective's knowledge hub

## URL

https://rizom.ai

## Theme Mode

dark

## CTA

### Heading

Unlock your full potential

### Button Text

Join Rizom

### Button Link

https://www.linkedin.com/company/rizom-collective
```

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│ brain.config.ts                                          │
│                                                          │
│ siteBuilderPlugin({                                      │
│   siteInfo: {  // Optional overrides                    │
│     title: "Rizom",                                      │
│     cta: { ... }                                         │
│   }                                                      │
│ })                                                       │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│ SiteInfoService                                          │
│                                                          │
│ • initialize() - Load entity or create with defaults    │
│ • getSiteInfo() - Return cached data                     │
│ • refreshCache() - Reload from database                 │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│ Entity: site-info                                        │
│ Storage: brain-data/site-info/site-info.md              │
│                                                          │
│ Adapter: StructuredContentFormatter                      │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│ SiteInfoDataSource                                       │
│                                                          │
│ • Fetches from SiteInfoService                          │
│ • Merges navigation from RouteRegistry                  │
│ • Returns complete SiteInfo to layouts                  │
└─────────────────────────────────────────────────────────┘
```

## Implementation Plan

### Phase 1: Create SiteInfo Service Infrastructure

**New Files:**

- `plugins/site-builder/src/services/site-info-schema.ts`
  - Define `siteInfoSchema` and `siteInfoBodySchema`
  - Include CTA fields in body schema

- `plugins/site-builder/src/services/site-info-adapter.ts`
  - Implement `EntityAdapter` interface
  - Use `StructuredContentFormatter` (like IdentityAdapter)
  - Support nested CTA object

- `plugins/site-builder/src/services/site-info-service.ts`
  - Singleton service with caching (like IdentityService)
  - `initialize()` - Load or create default entity
  - `getSiteInfo()` - Return cached SiteInfoBody
  - `refreshCache()` - Reload from EntityService

### Phase 2: Update Plugin Configuration

**Modify:**

- `plugins/site-builder/src/config.ts`
  - Change `siteConfig` to `siteInfo` in schema
  - Make it optional (use for overrides)
  - Remove separate `themeMode` field (include in siteInfo)

- `plugins/site-builder/src/plugin.ts`
  - Initialize `SiteInfoService` during plugin setup
  - Pass default siteInfo from config
  - Register service for access by other components

### Phase 3: Update SiteInfoDataSource

**Modify:**

- `plugins/site-builder/src/datasources/site-info-datasource.ts`
  - Inject `SiteInfoService` instead of static config
  - Call `siteInfoService.getSiteInfo()` to get data
  - Still merge navigation from RouteRegistry
  - Return combined result

### Phase 4: Update SiteInfo Type Schema

**Modify:**

- `plugins/site-builder/src/types/site-info.ts`
  - Add `cta` field to `SiteInfoSchema`
  - Keep navigation (still dynamic from routes)

### Phase 5: Update Layouts and Remove CTA Template

**Modify:**

- `shared/default-site-content/src/footer-cta.tsx`
  - Component already accepts props, no change needed
  - Documentation update: now gets data from `siteInfo.cta`

- `shared/default-site-content/src/index.ts`
  - Remove `footer-cta` from templates export

- Route definitions using CTA:
  - Update section config to use `dataQuery: { id: "site:info" }`
  - Pass `siteInfo.cta` to FooterCTA component

**Delete:**

- `shared/default-site-content/src/footer-cta-template/` (entire directory)
  - `schema.ts`
  - `layout.tsx`
  - `formatter.ts`
  - `index.ts`

### Phase 6: Update Brain Configurations

**Modify:**

- `apps/collective-brain/brain.config.ts`
  - Change `siteConfig: { ... }` to `siteInfo: { ... }`
  - Add `cta` field to siteInfo
  - Update route sections to use site:info datasource

- `apps/test-brain/brain.config.ts` (if exists)
- `apps/team-brain/brain.config.ts` (if exists)

### Phase 7: Seed Content and Migration

**Create:**

- `apps/collective-brain/seed-content/site-info/site-info.md`
  - Migrate current siteConfig values
  - Migrate CTA from `cta.md`

- Repeat for other brains

**Delete:**

- `apps/*/seed-content/site-content/home/cta.md`

### Phase 8: Testing and Documentation

**Test:**

- Site info loads from entity on startup
- Defaults work when no entity exists
- Config overrides work correctly
- Directory sync can update site-info.md
- CTA renders correctly from siteInfo.cta
- Navigation still works (merged in datasource)

**Document:**

- Update site-builder README
- Add migration guide for existing brains
- Document siteInfo entity structure

## Benefits

### Consistency

- ✅ Follows established identity pattern
- ✅ Single pattern for singleton configuration entities
- ✅ Predictable service architecture

### Flexibility

- ✅ Site info editable as markdown file
- ✅ Can update via directory-sync
- ✅ Easy to extend with new fields (logo, social links, etc.)

### Simplicity

- ✅ Removes CTA template system complexity
- ✅ Single source of truth for all site configuration
- ✅ Fewer concepts to understand

### Extensibility

- ✅ Easy to add: logo, favicon, social media links, analytics ID
- ✅ Structured format supports complex nested data
- ✅ Service pattern allows for caching, validation, events

## Migration Path

### For Existing Brains

1. **Update brain.config.ts:**

   ```diff
   siteBuilderPlugin({
   - siteConfig: {
   + siteInfo: {
       title: "My Brain",
       description: "Knowledge hub",
   +   cta: {
   +     heading: "...",
   +     buttonText: "...",
   +     buttonLink: "..."
   +   }
     }
   })
   ```

2. **Create site-info.md:**
   - Run site-builder once to auto-generate from config
   - OR manually create in `brain-data/site-info/site-info.md`

3. **Update routes (if using CTA):**

   ```diff
   {
     id: "cta",
   - template: "footer-cta",
   + template: "footer-cta",  // Now uses site:info datasource
   + dataQuery: { id: "site:info" }
   }
   ```

4. **Delete old CTA entities:**
   - Remove `site-content/home/cta.md`

### Backward Compatibility

**Not needed** - This is a breaking change, but:

- Only affects site-builder plugin users
- Clear migration path
- Benefits outweigh migration cost
- Can include migration script if needed

## Open Questions

1. **Should themeMode stay in siteInfo or remain separate in plugin config?**
   - Leaning: Include in siteInfo (more flexible, can change at runtime)

2. **Should navigation be part of siteInfo entity or stay dynamic?**
   - Leaning: Stay dynamic (navigation is structural, not content)

3. **Do we need a migration script or manual update is fine?**
   - Leaning: Manual is fine (small number of brains, clear docs)

4. **Should we support both old and new patterns temporarily?**
   - Leaning: No (clean break, simpler)

## Future Enhancements

After this refactor, we can easily add:

- **Logo**: `logo: { src: string, alt: string }`
- **Social Links**: `social: { twitter, github, linkedin }`
- **Analytics**: `analytics: { ga4: string, plausible: string }`
- **SEO**: `seo: { ogImage, twitterCard }`
- **Contact**: `contact: { email, phone }`

All following the same entity pattern with StructuredContentFormatter.

## Timeline Estimate

- Phase 1-2 (Service + Config): 2-3 hours
- Phase 3-4 (DataSource + Types): 1 hour
- Phase 5 (Layout updates): 1 hour
- Phase 6-7 (Brain configs + seed): 1-2 hours
- Phase 8 (Testing + docs): 1-2 hours

**Total: 6-9 hours** of focused work
