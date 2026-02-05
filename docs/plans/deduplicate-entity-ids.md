# Plan: Handle duplicate entity IDs in generation handlers

## Problem

All generation handlers (blog, social-media, newsletter, decks) derive entity IDs from titles/slugs. If a title collides with an existing entity, `createEntity()` throws a SQLite PRIMARY KEY constraint error and the job fails silently.

## Approach: Two layers

### Layer 1: Entity service safety net (suffix fallback)

Add a `deduplicateId: true` option to `createEntity()`. When enabled and a PK collision occurs, automatically append `-2`, `-3`, etc. This is universal — all callers get it for free.

**File**: `shell/entity-service/src/entityService.ts` (~line 190)

### Layer 2: AI title regeneration (primary strategy)

Add a shared `createEntityWithUniqueTitle()` utility that generation handlers call instead of `createEntity()` directly:

1. Check if the proposed entity ID already exists
2. If collision: ask AI to generate a **different** title (handler provides a short regeneration prompt)
3. Create with the new title, using `deduplicateId: true` as safety net

**File**: New shared utility, likely in `shell/plugins/src/service/` or `shared/utils/`

### Handler changes

Each of the 4 generation handlers swaps their `createEntity()` call for `createEntityWithUniqueTitle()` and provides a regeneration prompt. ~3 lines changed per handler:

- `plugins/social-media/src/handlers/generationHandler.ts` (~line 247)
- `plugins/blog/src/handlers/blogGenerationJobHandler.ts` (~line 233)
- `plugins/newsletter/src/handlers/generation-handler.ts` (~line 266)
- `plugins/decks/src/handlers/deckGenerationJobHandler.ts` (~line 219)

### Tests

- **Entity service**: Test `deduplicateId` option (returns `-2` on collision, `-3` on double collision)
- **Shared utility**: Test AI regeneration flow + suffix fallback
- **Handler tests**: Verify handlers don't crash on duplicate titles

## Verification

```bash
bun test shell/entity-service
bun test plugins/social-media
bun test plugins/blog
bun test plugins/newsletter
bun test plugins/decks
bun run typecheck
bun run lint
```
