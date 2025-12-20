# Plan: Centralize Draft/Published Filtering in Site-Builder

## Problem

Draft/published filtering logic is duplicated across 4+ datasources with inconsistencies:

- Portfolio uses `status === "published"`
- Blog uses `publishedAt` existence
- RSS always filters to published (ignores environment)
- Links has no filtering
- Each datasource independently checks `context.environment === "preview"`

## Goal

Move this logic to site-builder so datasources don't need to know about environments.

## Approach: Add `publishedOnly` flag to DataSourceContext

The simplest approach is to have site-builder compute a single boolean and pass it down.

### Changes

1. **shell/datasource/src/types.ts** - Add to `BaseDataSourceContext`:

   ```typescript
   publishedOnly?: boolean; // true for production, false for preview
   ```

2. **plugins/site-builder** - Set the flag based on environment:
   - In `getContentForSection()`, add `publishedOnly: environment === "production"`

3. **Each datasource** - Replace environment checks with simpler logic:

   ```typescript
   // Before:
   const isPreview = context.environment === "preview";
   const filtered = isPreview
     ? all
     : all.filter((p) => p.metadata.status === "published");

   // After:
   const filtered = context.publishedOnly
     ? all.filter((p) => p.metadata.status === "published")
     : all;
   ```

### Files to Modify

- `shell/datasource/src/types.ts` - Add `publishedOnly` to context
- `shell/content-service/src/content-service.ts` - Pass through the flag
- `plugins/site-builder/src/lib/site-builder.ts` - Set the flag based on environment
- `plugins/blog/src/datasources/blog-datasource.ts` - Use `publishedOnly`
- `plugins/blog/src/datasources/rss-datasource.ts` - Use `publishedOnly` (currently ignores env)
- `plugins/portfolio/src/datasources/project-datasource.ts` - Use `publishedOnly`
- `plugins/decks/src/datasources/deck-datasource.ts` - Use `publishedOnly`
- `plugins/link/src/datasources/links-datasource.ts` - Add filtering using `publishedOnly`

### Benefits

- Single source of truth: site-builder decides preview vs production semantics
- Datasources become simpler: just check a boolean
- Easier to reason about: "publishedOnly=true means filter drafts"
- No environment knowledge needed in datasources

### Decisions

- **RSS**: Always published-only (ignore `publishedOnly` flag) - RSS feeds are public-facing and could be accessed even on preview URLs
- **Navigation**: Draft routes are already only registered in preview mode (handled at route registration time, not in NavigationDataSource)

### Implementation Order

1. Add `publishedOnly` to `BaseDataSourceContext` (`shell/datasource/src/types.ts`)
2. Update content-service to pass it through (`shell/content-service/src/content-service.ts`)
3. Update site-builder to set it based on environment (`plugins/site-builder/src/lib/site-builder.ts`)
4. Update datasources to use `publishedOnly` instead of checking environment:
   - `plugins/portfolio/src/datasources/project-datasource.ts`
   - `plugins/blog/src/datasources/blog-datasource.ts`
   - `plugins/decks/src/datasources/deck-datasource.ts`
   - `plugins/link/src/datasources/links-datasource.ts` (add filtering)
5. Leave RSS as-is (already always filters to published)
6. Navigation already works correctly (route registration handles draft filtering)
