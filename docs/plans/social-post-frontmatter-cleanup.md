# Remove operational fields from social post frontmatter + fix queue persistence

## Context

Social post frontmatter contains operational/queue fields that don't belong in content files:

- `platformPostId` — never actually populated (LinkedIn API's `X-RestLi-Id` header returns empty); dead code
- `queueOrder`, `retryCount`, `lastError` — ephemeral runtime state that creates noisy git diffs and shows up as editable CMS fields

Additionally, the in-memory QueueManager loses all queued posts on restart. Posts stay `status: "queued"` in the DB but are never picked up again.

Goal: delete `platformPostId` and all operational fields from frontmatter entirely, and rebuild the in-memory queue from DB on startup so queued posts survive restarts.

## Changes

### 1. Schema: `plugins/social-media/src/schemas/social-post.ts`

**Frontmatter schema** — remove 4 fields:

- `platformPostId` (lines 50-53)
- `queueOrder` (lines 45-48)
- `retryCount` (line 61)
- `lastError` (line 62)

**Metadata schema** — stop picking removed fields, define operational fields directly in `.extend()`:

```typescript
export const socialPostMetadataSchema = socialPostFrontmatterSchema
  .pick({ title: true, platform: true, status: true, publishedAt: true })
  .extend({
    slug: z.string(),
    queueOrder: z.number().optional(),
    retryCount: z.number().default(0),
    lastError: z.string().optional(),
  });
```

### 2. Schema: `plugins/content-pipeline/src/schemas/publishable.ts`

Remove `retryCount` and `lastError` from `publishableMetadataSchema`. These are plugin-specific operational concerns, not base publishable fields. Keep `status`, `queueOrder`, `publishedAt`.

### 3. Adapter: `plugins/social-media/src/adapters/social-post-adapter.ts`

**`toMarkdown()`**: Remove all operational field handling — no `queueOrder` conditional, no `platformPostId` spread, no `queueOrder` deletion logic. Frontmatter is content-only (title, platform, status, publishedAt, coverImageId, sourceEntityId, sourceEntityType).

**`fromMarkdown()`**: Remove `queueOrder` from returned metadata. Operational fields are DB-only, not parsed from frontmatter.

**`parsePostFrontmatter()`**: Remove `retryCount` default logic.

### 4. Publish handler: `plugins/social-media/src/handlers/publishExecuteHandler.ts`

**On success** (lines 112-137):

- Build `updatedFrontmatter` from content fields only
- Remove `platformPostId` and `retryCount` from frontmatter
- Metadata update: `status: "published"`, `publishedAt`, `queueOrder: undefined`, `retryCount: 0`

**On failure** (lines 147-188):

- Build `updatedFrontmatter` from content fields only (no retryCount/lastError)
- Metadata update: increment `retryCount`, set `lastError`, conditionally set `status: "failed"`

**Delete `reportSuccess` platformPostId parameter** (lines 205-211).

### 5. Generation handler: `plugins/social-media/src/handlers/generationHandler.ts`

- Remove `retryCount: 0` and `queueOrder` from initial frontmatter
- Add `queueOrder` and `retryCount: 0` to entity metadata instead

### 6. Template: `plugins/social-media/src/templates/social-post-detail.tsx`

- Delete LinkedIn URL logic and "View on LinkedIn" link (lines 40-42, 103-114)
- Change `post.frontmatter.queueOrder` → `post.metadata.queueOrder` (line 66)
- Change `post.frontmatter.lastError` → `post.metadata.lastError` (line 115)

### 7. Queue rebuild on startup: `plugins/content-pipeline/src/plugin.ts`

After `this.queueManager = QueueManager.createFresh()` (line 63), subscribe to `sync:initial:completed` to rebuild:

```typescript
context.messaging.subscribe("sync:initial:completed", async () => {
  // Rebuild queue from entities with status "queued"
  const entities = await context.entityService.queryEntities({
    filters: { status: "queued" },
  });
  // Sort by queueOrder (if available) then by updated timestamp
  const sorted = entities.sort(
    (a, b) =>
      (a.metadata.queueOrder ?? Infinity) - (b.metadata.queueOrder ?? Infinity),
  );
  for (const entity of sorted) {
    await this.queueManager.add(entity.entityType, entity.id);
  }
  if (sorted.length > 0) {
    this.logger.info(`Rebuilt queue with ${sorted.length} queued entities`);
  }
  return { success: true };
});
```

This runs after initial sync so all entity data is loaded before queue rebuild.

### 8. Revert earlier changes from this session

The `platformPostId` additions made earlier (schema pick, adapter `fromMarkdown`/`toMarkdown`, publish handler metadata) are superseded by this refactor.

### 9. Tests

| Test file                                                  | Changes                                                                                |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `social-media/test/schemas/social-post.test.ts`            | Remove operational fields from frontmatter tests; verify they exist in metadata schema |
| `social-media/test/adapters/social-post-adapter.test.ts`   | Update roundtrip tests — frontmatter has no operational fields                         |
| `social-media/test/adapter-metadata-sync.test.ts`          | Remove `platformPostId` preservation test                                              |
| `social-media/test/handlers/publishExecuteHandler.test.ts` | Remove `platformPostId` assertions; move retry/error to metadata assertions            |
| `social-media/test/datasource.test.ts`                     | Update if referencing frontmatter operational fields                                   |
| `content-pipeline/test/`                                   | Update `publishableMetadataSchema` tests; add queue rebuild test                       |

## Verification

1. `bun run typecheck` — all tasks pass
2. `bun test plugins/social-media/test/` — all tests pass
3. `bun test plugins/content-pipeline/test/` — all tests pass
4. `bun test plugins/site-builder/test/lib/cms-config.test.ts` — CMS config no longer includes operational fields
5. `bun run lint` — no lint errors
