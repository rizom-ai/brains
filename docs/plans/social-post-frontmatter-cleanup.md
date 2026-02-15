# Remove operational fields from social post frontmatter + fix queue persistence

## Context

Social post frontmatter contains operational/queue fields that don't belong in content files:

- `platformPostId` — never actually populated (LinkedIn API's `X-RestLi-Id` header returns empty); dead code
- `queueOrder`, `retryCount`, `lastError` — ephemeral runtime state that creates noisy git diffs and shows up as editable CMS fields

Additionally, the in-memory QueueManager loses all queued posts on restart. Posts stay `status: "queued"` in the DB but are never picked up again.

Goal: delete operational fields (`queueOrder`, `retryCount`, `lastError`) from both frontmatter and metadata. Keep `platformPostId` in frontmatter and metadata with proper syncing. Queue and retry state lives in memory only (QueueManager + RetryTracker). Rebuild the in-memory queue from `status: "queued"` entities on startup.

**Status: DONE**

## Changes

### 1. Schema: `plugins/social-media/src/schemas/social-post.ts`

**Frontmatter schema** — remove 4 fields: `queueOrder`, `platformPostId`, `retryCount`, `lastError`.

**Metadata schema** — stop picking `queueOrder`, remove from `.extend()`. Metadata only has: `title`, `platform`, `status`, `publishedAt`, `slug`.

```typescript
export const socialPostMetadataSchema = socialPostFrontmatterSchema
  .pick({ title: true, platform: true, status: true, publishedAt: true })
  .extend({
    slug: z.string(),
  });
```

### 2. Schema: `plugins/content-pipeline/src/schemas/publishable.ts`

Remove `retryCount` and `lastError` from `publishableMetadataSchema`. Keep `status`, `queueOrder`, `publishedAt`. (`queueOrder` stays in base schema — other entity types may use it differently.)

### 3. Adapter: `plugins/social-media/src/adapters/social-post-adapter.ts`

**`toMarkdown()`**: Remove all operational field handling — no `queueOrder` conditional, no `platformPostId` in spread comment, no `queueOrder` delete block. Frontmatter is content-only.

**`fromMarkdown()`**: Remove `queueOrder` from returned metadata.

**`parsePostFrontmatter()`**: Remove `retryCount` default logic. Just return parsed result directly.

### 4. Publish handler: `plugins/social-media/src/handlers/publishExecuteHandler.ts`

**On success** (lines 112-137):

- Build `updatedFrontmatter` from content fields only (no `platformPostId`, no `retryCount`, no `queueOrder` destructuring)
- Metadata update: `status: "published"`, `publishedAt` only (no `queueOrder`, no `retryCount`)

**On failure** (lines 146-187):

- Build `updatedFrontmatter` from content fields only (no `retryCount`, no `lastError`)
- Metadata update: `status: "failed"` when max retries reached (no `retryCount`, no `lastError` in metadata — RetryTracker handles this)

**`reportSuccess`** (lines 202-211): Remove `platformPostId` parameter — just report entityType + entityId.

### 5. Generation handler: `plugins/social-media/src/handlers/generationHandler.ts`

- Remove `retryCount: 0` from initial frontmatter (line 218)
- Remove `queueOrder` from initial frontmatter (line 219)
- No need to set them on metadata either — they don't exist there anymore

### 6. Template: `plugins/social-media/src/templates/social-post-detail.tsx`

- Delete LinkedIn URL variable and "View on LinkedIn" link (lines 40-42, 103-114)
- Delete queue position display (lines 66-70) — queueOrder no longer available
- Delete last error display (lines 115-120) — lastError no longer available

### 7. Queue rebuild on startup: `plugins/content-pipeline/src/plugin.ts`

In `onRegister()`, after `subscribeToMessages()`, subscribe to `sync:initial:completed` to rebuild the queue from entities with `status: "queued"`:

```typescript
context.messaging.subscribe("sync:initial:completed", async () => {
  const entities = await context.entityService.queryEntities({
    filters: { status: "queued" },
  });
  for (const entity of entities) {
    await this.queueManager.add(entity.entityType, entity.id);
  }
  if (entities.length > 0) {
    this.logger.info(`Rebuilt queue with ${entities.length} queued entities`);
  }
  return { success: true };
});
```

No sorting by `queueOrder` — order is not preserved across restarts.

### 8. Tests

| Test file                                                  | Changes                                                                          |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `social-media/test/schemas/social-post.test.ts`            | Remove operational fields from frontmatter and metadata tests                    |
| `social-media/test/adapters/social-post-adapter.test.ts`   | Update roundtrip tests — frontmatter has no operational fields                   |
| `social-media/test/adapter-metadata-sync.test.ts`          | Remove `platformPostId` preservation test                                        |
| `social-media/test/handlers/publishExecuteHandler.test.ts` | Remove `platformPostId` assertions; remove retry/error from frontmatter+metadata |
| `social-media/test/datasource.test.ts`                     | Update if referencing frontmatter operational fields                             |
| `content-pipeline/test/`                                   | Update `publishableMetadataSchema` tests; add queue rebuild test                 |

## Verification

1. `bun run typecheck` — all tasks pass
2. `bun test plugins/social-media/test/` — all tests pass
3. `bun test plugins/content-pipeline/test/` — all tests pass
4. `bun test plugins/site-builder/test/lib/cms-config.test.ts` — CMS config no longer includes operational fields
5. `bun run lint` — no lint errors
