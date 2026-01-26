# Series Architecture Cleanup - Implementation Plan

## Summary

Clean up the SeriesManager logic and series entity structure.

## Issues to Fix

### 1. Unnecessary `series-` prefix

- **Location**: `series-manager.ts:52`
- **Fix**: Use just `slugify(seriesName)` as the ID

### 2. Full sync on every post change

- **Location**: `series-manager.ts:109`
- **Problem**: Any post change triggers re-fetch of ALL posts and ALL series
- **Fix**: `handlePostChange` should only ensure the specific series exists, not full sync

### 3. Manual entity construction

- **Location**: `series-manager.ts:69-82`
- **Problem**: Manually building entity with spread metadata
- **Fix**: Use the SeriesAdapter properly

### 4. Description in wrong place

- **Current**: Description stored in frontmatter YAML
- **Fix**: Move description to structured content (markdown body)

## Files to Change

### `plugins/blog/src/services/series-manager.ts`

- Remove `series-` prefix from ID generation
- Rewrite `handlePostChange` to only handle the affected series:
  - If post has seriesName, ensure that series exists
  - If post's seriesName changed, handle both old and new series
  - If post deleted, check if old series is now orphaned
- Use SeriesAdapter for entity construction

### `plugins/blog/src/schemas/series.ts`

- Remove `description` from `seriesFrontmatterSchema`
- Keep only `title`, `slug`, `coverImageId` in frontmatter

### `plugins/blog/src/adapters/series-adapter.ts`

- Update to parse description from markdown body (first paragraph or specific section)
- Update `toMarkdown` to write description as content, not frontmatter

### `plugins/blog/src/datasources/series-datasource.ts`

- Update to get description from parsed content, not frontmatter
- Remove `series-` prefix assumptions in lookups

### `plugins/blog/src/tools/enhance-series.ts`

- Simplify lookup (no more prefix gymnastics)
- Update to write description to content body, not frontmatter

### `plugins/blog/src/templates/series-detail.tsx`

- Already receives description - no change needed

### `plugins/blog/src/templates/series-list.tsx`

- Already receives description - no change needed

## Implementation Order

1. Schema: Remove description from frontmatter schema
2. Adapter: Parse/write description from/to content body
3. SeriesManager: Remove prefix, fix handlePostChange logic
4. Datasource: Update to use new description location
5. enhance-series tool: Simplify lookups, write to content body
6. Update tests

## Verification

After each step:

1. `bun run typecheck`
2. `bun test plugins/blog`
3. Manual: Create post with seriesName, verify series created with correct ID (no prefix)
