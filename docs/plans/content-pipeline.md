# Plan: Rename publish-pipeline to content-pipeline & Add Generation Scheduling

## Overview

Rename `@brains/publish-pipeline` to `@brains/content-pipeline` and extend it to handle both **publish scheduling** (existing) and **generation scheduling** (new). This enables automated draft creation on a schedule with configurable conditions.

## Goals

1. **Rename**: `publish-pipeline` → `content-pipeline` (package, classes, messages)
2. **Add generation scheduling**: Cron-based draft generation with conditions
3. **Unified workflow**: generation → draft → review → queue → publish

---

## Part 1: Package Rename

### Directory & Package

```
plugins/publish-pipeline/ → plugins/content-pipeline/
@brains/publish-pipeline  → @brains/content-pipeline
```

### Class Renames

| Old                       | New                       |
| ------------------------- | ------------------------- |
| `PublishPipelinePlugin`   | `ContentPipelinePlugin`   |
| `PublishScheduler`        | `ContentScheduler`        |
| `publishPipelinePlugin()` | `contentPipelinePlugin()` |

### Message Renames

Keep `publish:*` messages for backwards compatibility, add `generate:*` for new features:

**Existing (unchanged):**

- `publish:register`, `publish:queue`, `publish:execute`, etc.

**New generation messages:**

- `generate:register` - Register generation handler for entity type
- `generate:execute` - Trigger generation (scheduler → plugin)
- `generate:completed` - Generation succeeded
- `generate:failed` - Generation failed

### Files to Update (imports)

1. `apps/professional-brain/brain.config.ts`
2. `apps/professional-brain/brain.eval.config.ts`
3. `apps/professional-brain/package.json`
4. `plugins/newsletter/src/index.ts`
5. `plugins/social-media/src/plugin.ts`
6. `plugins/blog/src/plugin.ts`
7. `plugins/portfolio/src/plugin.ts`
8. `plugins/decks/src/plugin.ts`
9. `shared/utils/src/index.ts`
10. `docs/plans/*.md` (references)

---

## Part 2: Generation Scheduling Feature

### Extended Config Schema

```typescript
// plugins/content-pipeline/src/types/config.ts
export const contentPipelineConfigSchema = z.object({
  // Existing publish scheduling
  entitySchedules: z.record(z.string()).optional(),

  // NEW: Generation scheduling
  generationSchedules: z.record(z.string()).optional(),
  generationConditions: z.record(generationConditionSchema).optional(),

  // Existing retry config
  maxRetries: z.number().optional(),
  retryBaseDelayMs: z.number().optional(),
});

const generationConditionSchema = z.object({
  skipIfDraftExists: z.boolean().default(true),
  minSourceEntities: z.number().optional(),
  maxDraftsPerWeek: z.number().optional(),
  sourceEntityType: z.string().optional(),
});
```

### Example Configuration

```typescript
contentPipelinePlugin({
  // Publish schedules (existing)
  entitySchedules: {
    "social-post": "0 10 * * *", // publish daily 10am
    newsletter: "0 12 * * 5", // publish Fridays noon
  },

  // Generation schedules (new)
  generationSchedules: {
    "social-post": "0 9 * * *", // generate draft daily 9am
    newsletter: "0 9 * * 1", // generate draft Mondays 9am
  },

  // Generation conditions (new)
  generationConditions: {
    newsletter: {
      skipIfDraftExists: true,
      minSourceEntities: 1, // need at least 1 new post
      sourceEntityType: "post",
    },
    "social-post": {
      skipIfDraftExists: true,
      maxDraftsPerWeek: 7,
    },
  },
});
```

### Generation Flow

1. **Cron fires** for entity type (e.g., `newsletter` at Monday 9am)
2. **Check conditions**:
   - Does draft already exist? → skip if `skipIfDraftExists`
   - Enough source content? → check `minSourceEntities`
   - Under weekly limit? → check `maxDraftsPerWeek`
3. **Emit `generate:execute`** message with entity type
4. **Plugin handles** generation (e.g., newsletter plugin creates draft)
5. **Plugin reports** `generate:completed` or `generate:failed`

### New Components

#### GenerationScheduler (extend existing scheduler)

```typescript
// plugins/content-pipeline/src/generation-scheduler.ts
export class GenerationScheduler {
  private generationSchedules: Record<string, string>;
  private generationConditions: Record<string, GenerationCondition>;
  private cronJobs: Map<string, Cron>;

  async checkConditions(entityType: string): Promise<boolean>;
  async triggerGeneration(entityType: string): Promise<void>;
}
```

Or extend existing `ContentScheduler` to handle both:

```typescript
// In ContentScheduler
private publishCronJobs: Map<string, Cron>;
private generationCronJobs: Map<string, Cron>;

async startPublishSchedules(): Promise<void>;
async startGenerationSchedules(): Promise<void>;
```

### Plugin Integration

Plugins register generation handlers via message:

```typescript
// In newsletter plugin onRegister()
context.messaging.send("generate:register", {
  entityType: "newsletter",
  handler: async (context) => {
    // Check for recent posts
    const posts = await getRecentPosts();
    if (posts.length === 0) return { skipped: true };

    // Generate newsletter
    await context.jobs.enqueue("newsletter-generation", {
      sourceEntityIds: posts.map((p) => p.id),
    });

    return { success: true };
  },
});
```

---

## Part 3: Files to Create/Modify

### New Files

```
plugins/content-pipeline/src/generation-scheduler.ts   # Or extend scheduler.ts
plugins/content-pipeline/src/types/generation.ts       # Generation types
```

### Modified Files

```
plugins/content-pipeline/package.json                  # Rename
plugins/content-pipeline/src/index.ts                  # Rename exports
plugins/content-pipeline/src/plugin.ts                 # Rename class, add generation
plugins/content-pipeline/src/scheduler.ts              # Extend or split
plugins/content-pipeline/src/types/config.ts           # Add generation config
plugins/content-pipeline/src/types/messages.ts         # Add generate:* messages
```

---

## Implementation Order

### Phase 1: Rename (no new features)

1. Rename directory `plugins/publish-pipeline/` → `plugins/content-pipeline/`
2. Update `package.json` name to `@brains/content-pipeline`
3. Rename classes: `PublishPipelinePlugin` → `ContentPipelinePlugin`
4. Rename factory: `publishPipelinePlugin` → `contentPipelinePlugin`
5. Update all imports across codebase (25 files)
6. Run typecheck and tests
7. Commit: "refactor: rename publish-pipeline to content-pipeline"

### Phase 2: Add Generation Scheduling

1. Extend config schema with `generationSchedules` and `generationConditions`
2. Add `generate:*` message types
3. Extend `ContentScheduler` to handle generation cron jobs
4. Add condition checking logic
5. Update plugin to subscribe to `generate:register` and emit `generate:execute`
6. Write tests for generation scheduling
7. Commit: "feat(content-pipeline): add generation scheduling"

### Phase 3: Newsletter Integration

1. Update newsletter plugin to register generation handler
2. Configure generation schedule in brain.config.ts
3. Test end-to-end: cron → check conditions → generate draft
4. Commit: "feat(newsletter): integrate with content-pipeline generation"

---

## Verification

### After Phase 1 (Rename)

```bash
bun run typecheck
bun test plugins/content-pipeline
bun test plugins/newsletter
bun test plugins/social-media
```

### After Phase 2 (Generation Scheduling)

```bash
bun test plugins/content-pipeline
# Manual: verify cron jobs start/stop correctly
```

### After Phase 3 (Newsletter Integration)

```bash
# Configure test schedule (every minute for testing)
# Verify newsletter draft is generated
# Verify conditions prevent duplicate generation
```

---

## Rollback Plan

If issues arise:

1. Phase 1 is purely mechanical rename - revert commit if needed
2. Phases 2-3 add new features without breaking existing publish flow
3. Generation scheduling is opt-in via config - disable by removing config

---

## Dependencies

- No new npm packages required
- Uses existing `croner` for cron scheduling
- Uses existing job queue for generation jobs
