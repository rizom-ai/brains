# Plan: Deferred Auto-Extraction for Topics Plugin

**Status:** Implemented (Phases 1-3)
**Problem:** On startup, N entities trigger N individual topic extraction jobs, cluttering the queue
**Solution:** Defer auto-extraction until after initial sync completes

## Design

### Approach

Topics plugin starts with auto-extraction **disabled**. After `sync:initial:completed` event fires, auto-extraction is **enabled**. This ensures startup imports don't flood the queue, while normal operation still gets automatic topic extraction.

### Flow

```
Startup:
  directory-sync imports entities
  → entity:created events fire
  → topics ignores (auto-extraction not yet enabled)
  → sync:initial:completed fires
  → topics enables auto-extraction

Normal operation:
  user creates post → entity:created → topics extracts
  user edits post → entity:updated → topics re-extracts

Initial extraction:
  user runs topics:extract-pending batch tool (optional, Phase 4)
```

## Implementation

### Phase 1: Add Auto-Extraction State ✅

**File:** `plugins/topics/src/index.ts`

Added state and public methods:

```typescript
export class TopicsPlugin extends ServicePlugin<TopicsPluginConfig> {
  private autoExtractionEnabled = false;

  public isAutoExtractionEnabled(): boolean {
    return this.autoExtractionEnabled;
  }

  public enableAutoExtraction(): void {
    if (this.config.enableAutoExtraction) {
      this.autoExtractionEnabled = true;
      this.logger.info("Auto-extraction enabled after initial sync");
    }
  }
}
```

### Phase 2: Enable After Initial Sync ✅

**File:** `plugins/topics/src/index.ts`

Subscribe to `sync:initial:completed` and enable auto-extraction:

```typescript
// In onRegister (when config.enableAutoExtraction is true)
context.subscribe(
  "sync:initial:completed",
  async (): Promise<{ success: boolean }> => {
    this.enableAutoExtraction();
    return { success: true };
  },
);
```

### Phase 3: Guard Auto-Extraction ✅

**File:** `plugins/topics/src/index.ts`

Check the flag before queueing extraction jobs:

```typescript
const handleEntityEvent = async (message) => {
  // Skip if auto-extraction not yet enabled (during startup)
  if (!this.autoExtractionEnabled) {
    this.logger.debug("Skipping extraction - auto-extraction not yet enabled", {
      entityId: message.payload.entityId,
    });
    return { success: true };
  }
  // ... existing extraction logic
};
```

### Phase 4: Add Batch Extraction Tool (Optional/Future)

**File:** `plugins/topics/src/tools/extract-pending.ts` (new file)

Tool to extract topics from entities that haven't been processed. This is optional for the initial implementation - existing entities can be processed individually via `topics:extract` tool.

### Phase 5: Track Extraction State (Optional Enhancement)

To avoid re-extracting entities that already have topics, we can:

- Check if entity has linked topics before extracting
- Or add `topicsExtracted: true` after extraction

This is optional for the initial implementation.

## Testing ✅

**File:** `plugins/topics/test/deferred-auto-extraction.test.ts`

1. ✅ `isAutoExtractionEnabled()` returns false initially
2. ✅ `enableAutoExtraction()` sets flag to true (when config allows)
3. ✅ `sync:initial:completed` event enables auto-extraction
4. ✅ Auto-extraction stays disabled when config disables it
5. ✅ Direct enableAutoExtraction() call respects config

## Summary

| Before                         | After                              |
| ------------------------------ | ---------------------------------- |
| N entities → N jobs on startup | N entities → 0 jobs on startup     |
| Queue cluttered                | Queue clean                        |
| Auto-extraction always on      | Auto-extraction after initial sync |
