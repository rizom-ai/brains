# Webserver Schema Consolidation Plan

## Current State

### Schema Locations

1. **webserver-plugin/src/schemas.ts**

   - `landingPageSchema` - Full landing page structure
   - `dashboardSchema` - Dashboard data structure

2. **site-content-entity package**

   - `siteContentSchema` - Base entity schema for site content
   - `landingHeroDataSchema` - Partial duplication of landing page hero section
   - Custom adapter and formatter for site content entities

3. **webserver-template**
   - Currently no schemas (would consume from other packages)
   - Will be deployed outside monorepo, can't use workspace dependencies

## Problems

- Schema duplication between packages
- site-content-entity adds unnecessary complexity for simple content storage
- Template can't import from workspace packages after deployment

## Finalized Solution

### Architecture

1. **webserver-plugin** becomes the single source of truth for all content schemas
2. **Move site-content-entity abstraction into webserver-plugin** - keep the useful abstraction but eliminate the separate package
3. **Generate schemas** into webserver-template during site creation (only content-specific schemas, not entity schemas)

### Benefits

- Single source of truth for schemas
- Template remains self-contained after generation
- Maintains useful site-content abstraction without package overhead
- Content still stored as entities with proper type safety

## Implementation Plan

### Phase 1: Move site-content abstraction into webserver-plugin

1. Copy adapter and formatter from site-content-entity to webserver-plugin (flat structure)
2. Move siteContentSchema to webserver-plugin/src/schemas.ts
3. Update imports within webserver-plugin

### Phase 2: Consolidate all schemas

1. Move landingHeroDataSchema to schemas.ts
2. Ensure all content-related schemas are in one place
3. Keep site-content as a proper entity type (not generic)

### Phase 3: Remove site-content-entity package

1. Update webserver-plugin imports
2. Remove dependency from package.json
3. Delete the site-content-entity package
4. Update workspace references

### Phase 4: Generate Schemas for Template

1. Add schema generation to ContentGenerator
2. Write schemas.ts file to template during site generation
3. Ensure template uses generated schemas for type safety

### Phase 5: Testing and Cleanup

1. Test full site generation flow
2. Verify content persistence works with generic entities
3. Update documentation
4. Clean up any remaining references

## Code Structure

### webserver-plugin file organization

```
webserver-plugin/src/
├── schemas.ts          # All content schemas + siteContentSchema
├── site-content-adapter.ts    # Moved from site-content-entity
├── site-content-formatter.ts  # Moved from site-content-entity
├── content-generator.ts       # Updated to generate schemas
└── ... (existing files)
```

### webserver-plugin/src/schemas.ts

```typescript
// Site content entity schema
export const siteContentSchema = baseEntitySchema.extend({
  entityType: z.literal("site-content"),
  page: z.string(),
  section: z.string(),
  data: z.record(z.unknown()),
});

// Content schemas
export const landingPageSchema = z.object({...});
export const dashboardSchema = z.object({...});
export const landingHeroDataSchema = z.object({...});

// Schema generator for template
export function generateSchemaFile(): string {
  return `
import { z } from 'zod';

export const landingPageSchema = ${generateZodSchema(landingPageSchema)};
export const dashboardSchema = ${generateZodSchema(dashboardSchema)};
// ... other content-specific schemas (not entity schemas)
`;
}
```

## Migration Path

1. No data migration needed - content format stays the same
2. Only code changes required
3. Backward compatible with existing content files

## Timeline

- Phase 1-2: 30 minutes
- Phase 3: 15 minutes
- Phase 4: 30 minutes
- Phase 5: 15 minutes
- Total: ~1.5 hours

## Risks and Mitigations

- **Risk**: Breaking existing content
  - **Mitigation**: Keep same storage format, only change code structure
- **Risk**: Type safety in template

  - **Mitigation**: Generate full TypeScript schemas with proper types

- **Risk**: Missing schema updates in template
  - **Mitigation**: Make schema generation part of site creation process
