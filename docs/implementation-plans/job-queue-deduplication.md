# Implementation Plan: Job Queue Deduplication & Site Builder Memory Leak Fix

**Status:** Ready for Implementation
**Estimated Effort:** 4.5-6.5 hours
**Priority:** High (solves production memory leak)

## Problem Statement

The site-builder plugin has two memory leaks causing ~240 MB/day growth on both servers:

1. **Event subscription leak**: Subscriptions never cleaned up
2. **Route accumulation leak**: Deleted entities leave orphaned routes in RouteRegistry

Additionally, the timer-based debouncing pattern (5-second setTimeout) has issues:

- Timer cleanup complexity
- Potential for leaked timers
- Doesn't prevent multiple jobs from queuing between timer firings

## Solution: Job Queue Native Deduplication

Replace timer-based debouncing with job queue deduplication:

- **No timer complexity** - completely event-driven
- **Automatic deduplication** - job queue prevents duplicate pending jobs
- **Route cleanup** - full rebuild regenerates from current entity state
- **Reusable pattern** - any plugin can use deduplication

---

## Implementation Approach

### Phase 0: Revert Previous Site-Builder Changes

**Files to revert:**

- `plugins/site-builder/src/plugin.ts`

**Changes to revert:**

- Remove `unsubscribeFunctions` array (will re-add properly)
- Remove `rebuildTimer` field
- Remove `onShutdown()` method
- Restore original `setupAutoRebuild()` implementation

**Reason:** Previous fix was a band-aid for shutdown only. We're implementing the proper architectural solution.

**Estimated time:** 5 minutes

---

### Phase 1: Add Deduplication to Job Queue (TDD)

#### 1.1 Write Tests First

**File:** `shell/job-queue/test/job-queue-service.test.ts`

Add comprehensive test suite for deduplication covering:

1. **"none" strategy** - allows duplicates (default behavior)
2. **"skip" strategy with PENDING job** - should return same ID
3. **"skip" strategy with PROCESSING job** - should allow new job (ensures eventual consistency)
4. **"skip" strategy with both PROCESSING + PENDING** - should skip (PENDING exists)
5. **deduplicationKey** - fine-grained deduplication by custom key
6. **"replace" strategy** - cancel old job, create new one
7. **"coalesce" strategy** - update existing job timestamp
8. **Cross-type independence** - deduplication per job type

**Estimated time:** 1 hour

---

#### 1.2 Add Deduplication Types

**File:** `shell/job-queue/src/schema/types.ts`

```typescript
export const DeduplicationStrategyEnum = z.enum([
  "none", // No deduplication (default)
  "skip", // Skip if PENDING job exists
  "replace", // Cancel pending, create new
  "coalesce", // Update existing timestamp
]);

export type DeduplicationStrategy = z.infer<typeof DeduplicationStrategyEnum>;

export interface JobOptions {
  // ... existing fields
  deduplication?: DeduplicationStrategy;
  deduplicationKey?: string; // Optional for fine-grained dedup
}
```

**Estimated time:** 15 minutes

---

#### 1.3 Implement Smart Deduplication Logic

**File:** `shell/job-queue/src/job-queue-service.ts`

**Add helper method:**

```typescript
private async checkForDuplicate(
  type: string,
  deduplicationStrategy?: DeduplicationStrategy,
  deduplicationKey?: string,
): Promise<JobQueue | null> {
  if (!deduplicationStrategy || deduplicationStrategy === "none") {
    return null;
  }

  // Get all active jobs of this type
  const activeJobs = await this.getActiveJobs([type]);

  // Filter by deduplication key if provided
  const matchingJobs = deduplicationKey
    ? activeJobs.filter(job => {
        try {
          const data = JSON.parse(job.data);
          return data.deduplicationKey === deduplicationKey;
        } catch {
          return false;
        }
      })
    : activeJobs;

  if (matchingJobs.length === 0) {
    return null;
  }

  // For "skip": only skip if PENDING duplicate exists
  // Allow if only PROCESSING (ensures eventual consistency)
  if (deduplicationStrategy === "skip") {
    return matchingJobs.find(j => j.status === JOB_STATUS.PENDING) ?? null;
  }

  // For "replace"/"coalesce": return any active duplicate
  return matchingJobs[0] ?? null;
}
```

**Modify enqueue():**

```typescript
public async enqueue(
  type: string,
  data: unknown,
  options?: JobOptions,
): Promise<string> {
  // Check for duplicates BEFORE validation
  const duplicate = await this.checkForDuplicate(
    type,
    options?.deduplication,
    options?.deduplicationKey,
  );

  if (duplicate) {
    if (options?.deduplication === "skip") {
      this.logger.debug("Skipping duplicate job", {
        type, existingJobId: duplicate.id
      });
      return duplicate.id;
    }

    if (options?.deduplication === "replace") {
      await this.db.update(jobQueue)
        .set({ status: JOB_STATUS.FAILED, lastError: "Replaced by newer job" })
        .where(eq(jobQueue.id, duplicate.id));
    }

    if (options?.deduplication === "coalesce") {
      await this.db.update(jobQueue)
        .set({ scheduledFor: Date.now() })
        .where(eq(jobQueue.id, duplicate.id));
      return duplicate.id;
    }
  }

  // ... rest of existing enqueue logic
}
```

**Estimated time:** 1.5 hours

---

### Phase 2: Fix Route Accumulation (TDD)

#### 2.1 Write Test First

**File:** `plugins/site-builder/test/unit/dynamic-route-generator.test.ts`

```typescript
it("should remove routes for deleted entities on regeneration", async () => {
  // Create entities and generate routes
  await entityService.createEntity("blog", { title: "Post 1" }, "post-1");
  await entityService.createEntity("blog", { title: "Post 2" }, "post-2");
  await generator.generateEntityRoutes();

  expect(routeRegistry.size()).toBe(3); // /blogs + 2 posts

  // Delete one entity
  await entityService.deleteEntity("blog", "post-1");

  // Regenerate routes
  await generator.generateEntityRoutes();

  // Should only have routes for existing entities
  expect(routeRegistry.size()).toBe(2); // /blogs + 1 post
  expect(routeRegistry.get("/blogs/post-1")).toBeUndefined();
});
```

**Estimated time:** 15 minutes

---

#### 2.2 Implement Route Cleanup

**File:** `plugins/site-builder/src/lib/dynamic-route-generator.ts`

```typescript
async generateEntityRoutes(): Promise<void> {
  const logger = this.context.logger.child("DynamicRouteGenerator");

  // STEP 1: Clear all dynamic routes (prevents accumulation)
  const allRoutes = this.routeRegistry.list();
  let clearedCount = 0;
  for (const route of allRoutes) {
    if (route.sourceEntityType) {  // Dynamic routes have this field
      this.routeRegistry.unregister(route.path);
      clearedCount++;
    }
  }

  if (clearedCount > 0) {
    logger.debug(`Cleared ${clearedCount} dynamic routes`);
  }

  // STEP 2: Regenerate from current entity state
  const entityTypes = this.context.entityService.getEntityTypes();
  for (const entityType of entityTypes) {
    await this.generateRoutesForEntityType(entityType);
  }
}
```

**Estimated time:** 15 minutes

---

### Phase 3: Reimplement Site Builder (TDD)

#### 3.1 Write Test for Subscription Cleanup

**File:** `plugins/site-builder/test/unit/plugin.test.ts`

```typescript
it("should clean up event subscriptions on shutdown", async () => {
  // Mock message bus
  const subscriptions = [];
  const mockContext = {
    subscribe: vi.fn((event, handler) => {
      const unsub = () => {
        /* cleanup */
      };
      subscriptions.push(unsub);
      return unsub;
    }),
  };

  const plugin = new SiteBuilderPlugin(config);
  await plugin.onRegister(mockContext);

  expect(subscriptions.length).toBe(3); // 3 event types

  await plugin.onShutdown();

  // Verify all unsubscribe functions were called
  // (implementation depends on how we track this)
});
```

**Estimated time:** 30 minutes

---

#### 3.2 Implement Clean Site Builder Logic

**File:** `plugins/site-builder/src/plugin.ts`

```typescript
// Track subscriptions for cleanup
private unsubscribeFunctions: Array<() => void> = [];

private setupAutoRebuild(context: ServicePluginContext): void {
  const excludedTypes = ["site-info", "profile"];

  const scheduleRebuild = async (): Promise<void> => {
    try {
      await context.enqueueJob("site-build", {}, {
        priority: 0,
        source: this.id,
        metadata: {
          rootJobId: createId(),
          operationType: "content_operations" as const,
        },
        deduplication: "skip", // Skip if already PENDING
      });
    } catch (error) {
      this.logger.error("Failed to enqueue rebuild", { error });
    }
  };

  // Subscribe and store unsubscribe functions
  const unsubCreated = context.subscribe("entity:created", async (msg) => {
    const { entityType } = msg.payload;
    if (!excludedTypes.includes(entityType)) {
      await scheduleRebuild();
    }
    return { success: true };
  });

  const unsubUpdated = context.subscribe("entity:updated", async (msg) => {
    const { entityType } = msg.payload;
    if (!excludedTypes.includes(entityType)) {
      await scheduleRebuild();
    }
    return { success: true };
  });

  const unsubDeleted = context.subscribe("entity:deleted", async (msg) => {
    const { entityType } = msg.payload;
    if (!excludedTypes.includes(entityType)) {
      await scheduleRebuild();
    }
    return { success: true };
  });

  this.unsubscribeFunctions.push(unsubCreated, unsubUpdated, unsubDeleted);
}

protected override async onShutdown(): Promise<void> {
  // Clean up all subscriptions
  for (const unsub of this.unsubscribeFunctions) {
    unsub();
  }
  this.unsubscribeFunctions = [];
  this.logger.debug("Cleaned up event subscriptions");
}
```

**Estimated time:** 45 minutes

---

### Phase 4: Testing & Validation

**Unit tests:** All written first (TDD)
**Integration test:** Bulk operations scenario
**Memory leak validation:** Deploy to staging and monitor

**Estimated time:** 1-2 hours

---

## Total Effort: 4.5-6.5 hours

---

## Deduplication Flow Example

**Scenario:** Bulk import of 50 entities

```
Time | Event              | Job Queue           | Action
-----|-------------------|---------------------|--------
0ms  | Entity 1 created  | [Build #1: PENDING] | Enqueued
5ms  | Entity 2 created  | [Build #1: PENDING] | Skipped
...  | Entities 3-49     | [Build #1: PENDING] | Skipped
50ms | Worker picks up   | [Build #1: PROC]    | Build starts
55ms | Entity 50 created | [Build #1: PROC,    | Enqueued (no PENDING)
     |                   |  Build #2: PENDING] |
60ms | Entity 51 created | [Build #1: PROC,    | Skipped (Build #2 PENDING)
     |                   |  Build #2: PENDING] |
2s   | Build #1 done     | [Build #2: PENDING] | Entities 1-49 built
2.1s | Worker picks up   | [Build #2: PROC]    | Build starts
4s   | Build #2 done     | []                  | Entities 50-51 built
```

**Result:** 51 entity creates → 2 builds (instead of 51)

---

## Benefits

1. ✅ **No timer complexity** - event-driven
2. ✅ **Route accumulation fixed** - cleared on regeneration
3. ✅ **Subscription leak fixed** - onShutdown cleanup
4. ✅ **Reusable pattern** - any plugin can deduplicate
5. ✅ **Eventual consistency** - max 1 PROC + 1 PENDING
6. ✅ **Memory leak resolved** - both leaks addressed

---

## Migration Notes

**Breaking changes:** None (opt-in via JobOptions)
**Backward compatibility:** Defaults to `deduplication: "none"`
**Rollback plan:** Remove deduplication parameter
