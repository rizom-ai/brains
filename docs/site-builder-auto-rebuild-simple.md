# Simple Site Builder Auto-Rebuild Plan

## Summary of Decisions

Based on our yes/no discussion:
- ✅ **Enable auto-rebuild by default** - It should work out of the box
- ✅ **Use 5-second delay** for batching changes
- ✅ **Include ALL entity types except 'base'** - Rebuild on any content change
- ✅ **Use flag-based batching** - Guarantees rebuilds happen (no timer reset issues)
- ✅ **Skip priority setting** - Use default job queue priority
- ✅ **Make it configurable** - Allow users to disable if needed
- ✅ **Keep it simple** - Just modify EntityService and Site Builder Plugin

## Problem

Currently, users must manually run `site-builder:build-site` after creating or updating content (links, topics, summaries). This leads to stale site content when users forget to rebuild.

## Solution

Automatically trigger site rebuilds when content changes, with simple batching to avoid excessive rebuilds.

## Implementation Overview

### 1. Emit Entity Events (in EntityService)

**File**: `shell/entity-service/src/entityService.ts`

Add event emissions after successful entity operations:

```typescript
// In createEntity method, after successful creation:
await this.messageBus.send(
  "entity:created",
  { entityType: validatedEntity.entityType, entityId: validatedEntity.id },
  "entity-service",
);

// In updateEntity method, after successful update:
await this.messageBus.send(
  "entity:updated",
  { entityType: entity.entityType, entityId: entity.id },
  "entity-service",
);

// In deleteEntity method, after successful deletion:
await this.messageBus.send(
  "entity:deleted",
  { entityType, entityId },
  "entity-service",
);
```

### 2. Subscribe and Batch Rebuilds (in Site Builder Plugin)

**File**: `plugins/site-builder/src/plugin.ts`

Add simple batching logic in the `onInitialize` method:

```typescript
protected async onInitialize(context: ServicePluginContext): Promise<void> {
  // ... existing initialization code ...

  // Auto-rebuild setup
  let pendingRebuild = false;
  let rebuildTimer: NodeJS.Timeout | undefined;

  // Get all registered entity types except 'base'
  const excludedTypes = ['base'];
  const contentTypes = Array.from(context.entityRegistry.getTypes())
    .filter(type => !excludedTypes.includes(type));

  const scheduleRebuild = () => {
    // If rebuild already scheduled, do nothing
    if (pendingRebuild) return;

    pendingRebuild = true;
    this.logger.debug("Scheduling site rebuild in 5 seconds");

    rebuildTimer = setTimeout(async () => {
      pendingRebuild = false;
      this.logger.info("Auto-triggering site rebuild after content changes");

      try {
        await context.jobQueue.enqueue(
          "site-build",
          {
            environment: "production",
            outputDir: "dist",
            workingDir: ".",
            enableContentGeneration: true,
            metadata: {
              trigger: "auto-rebuild",
              timestamp: new Date().toISOString()
            }
          },
          {
            source: "site-builder:auto"
          }
        );
      } catch (error) {
        this.logger.error("Failed to enqueue auto-rebuild", error);
      }
    }, 5000); // 5 second delay
  };

  // Subscribe to entity events
  context.subscribe("entity:created", async (message) => {
    const { entityType } = message.payload;
    if (contentTypes.includes(entityType)) {
      scheduleRebuild();
    }
    return { success: true };
  });

  context.subscribe("entity:updated", async (message) => {
    const { entityType } = message.payload;
    if (contentTypes.includes(entityType)) {
      scheduleRebuild();
    }
    return { success: true };
  });

  context.subscribe("entity:deleted", async (message) => {
    const { entityType } = message.payload;
    if (contentTypes.includes(entityType)) {
      scheduleRebuild();
    }
    return { success: true };
  });

  this.logger.info("Auto-rebuild enabled for all entity types except", { excludedTypes });
}
```

### 3. Optional: Add Configuration Toggle

**File**: `plugins/site-builder/src/config.ts`

Add a simple enable/disable flag:

```typescript
export const siteBuilderConfigSchema = z.object({
  // ... existing config ...
  autoRebuild: z
    .boolean()
    .default(true)
    .describe("Automatically rebuild site when content changes"),
});
```

Then wrap the subscription logic in a check:

```typescript
if (this.config.autoRebuild) {
  // ... subscription and scheduling logic ...
}
```

## How It Works

1. **User creates/updates/deletes content** (link, topic, or summary)
2. **EntityService emits event** (`entity:created`, `entity:updated`, or `entity:deleted`)
3. **Site Builder receives event** and checks if it's a tracked content type
4. **If first change**: Schedule rebuild in 5 seconds
5. **If more changes come in**: Do nothing (rebuild already scheduled)
6. **After 5 seconds**: Rebuild triggers via job queue
7. **Job queue handles**: Async execution, prevents concurrent builds, progress reporting

## Benefits

- **Simple**: ~30 lines of code total
- **Effective**: Site stays up-to-date automatically
- **Efficient**: Batches rapid changes into single rebuild
- **Safe**: Job queue prevents concurrent builds
- **Observable**: Logs show when and why rebuilds happen

## Testing

### Manual Testing

1. Create any entity (link, topic, summary, etc.) → Wait 5 seconds → Site rebuilds
2. Create multiple entities rapidly → Wait 5 seconds → Single rebuild
3. Update any entity → Wait 5 seconds → Site rebuilds
4. Mix operations (create, update, delete various entity types) → Single rebuild after 5 seconds

### Verify Batching Works

1. Create 10 entities as fast as possible
2. Check logs: Should see "Scheduling site rebuild" once
3. After 5 seconds: Should see "Auto-triggering site rebuild" once
4. Result: 10 changes → 1 rebuild ✓

## Configuration Options

### Default (Recommended)

```typescript
new SiteBuilderPlugin({
  autoRebuild: true, // That's it!
});
```

### Disable for Manual Control

```typescript
new SiteBuilderPlugin({
  autoRebuild: false,
});
```

## Future Enhancements (If Needed)

Only add these if we actually need them:

1. **Configurable delay**: Make the 5-second delay configurable
2. **Configurable entity types**: Let users choose which types trigger rebuilds
3. **Quiet hours**: Don't rebuild during certain times
4. **Max batch size**: Force rebuild after N changes regardless of timer

But honestly, the simple version will probably work fine for 99% of use cases.

## Rollback Plan

If there are issues:

1. Set `autoRebuild: false` in config
2. Deploy the change
3. Back to manual rebuilds

## Why This Approach?

- **KISS Principle**: Keep it simple, stupid
- **Leverage existing infrastructure**: Job queue already handles the hard parts
- **Minimal code changes**: Easier to review, test, and maintain
- **No new dependencies**: Uses existing message bus and job queue
- **Battle-tested pattern**: Simple timer-based batching is proven

## Implementation Steps

1. **Add event emissions** to EntityService (~10 lines)
2. **Add subscription logic** to Site Builder Plugin (~20 lines)
3. **Test manually** to verify batching works
4. **Deploy** and monitor

Total implementation time: ~1-2 hours
