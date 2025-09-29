# Fluent Sync Implementation Plan

## Overview

This document outlines the implementation plan for making the Database ↔ Directory-Sync ↔ Git-Sync flow more fluent and automatic.

## Current Problems

1. **No Reactive Export**: Database changes don't automatically trigger file exports
2. **Blocking Operations**: Full export operations block the system
3. **Manual Coordination**: Users must manually trigger exports before git operations
4. **Redundant Operations**: Git-sync always does full export even when files are current

## Solution Design

### 1. Bidirectional Auto-Sync in Directory-Sync

Replace the current `watchEnabled` (file → database only) with `autoSync` (bidirectional):

- **Database → Files**: Subscribe to entity events and auto-export changes
- **Files → Database**: Keep existing file watching functionality
- **Debouncing**: Batch rapid changes to avoid excessive disk I/O

### 2. Smart Git-Sync

- Skip export step if directory-sync is keeping files current
- Add `autoPush` option for full automation
- Make operations non-blocking where possible

## Implementation Phases

### Phase 1: Directory-Sync AutoSync

#### Configuration Changes

```typescript
interface DirectorySyncConfig {
  // Deprecated
  watchEnabled?: boolean; // Will show deprecation warning

  // New
  autoSync: boolean; // Default: true (bidirectional sync)
  syncDebounce: number; // Default: 1000ms (batch exports)

  // Unchanged
  syncPath: string;
  watchInterval: number;
  initialSync: boolean;
  // ... other existing options
}
```

#### Event Subscriptions

```typescript
// Subscribe to entity lifecycle events
context.subscribe("entity:created", handleEntityExport);
context.subscribe("entity:updated", handleEntityExport);
context.subscribe("entity:deleted", handleEntityDelete);
```

#### Debouncing Strategy

- Track pending exports in a Map
- Use setTimeout to batch changes within `syncDebounce` window
- Export all pending changes in one operation

### Phase 2: Git-Sync Optimization

#### Configuration Changes

```typescript
interface GitSyncConfig {
  // Existing
  autoSync: boolean; // Auto-commit and sync
  syncInterval: number; // Interval for auto-sync

  // New
  autoPush: boolean; // Auto-push after commits (default: false)
  skipExportCheck: boolean; // Check if export needed (default: true)
}
```

#### Export Skip Logic

```typescript
async sync() {
  // Check if directory-sync has autoSync enabled
  const dirSyncStatus = await this.sendMessage("sync:status:request");

  if (!this.config.skipExportCheck || !dirSyncStatus.autoSync) {
    // Do traditional full export
    await this.exportEntities();
  }

  // Continue with git operations...
}
```

## Migration Guide

### For Existing Users

1. **Directory-Sync Config**:
   - `watchEnabled: true` → `autoSync: true`
   - Add `syncDebounce: 1000` for better performance

2. **Git-Sync Config**:
   - Add `autoPush: true` if you want full automation
   - Keep `autoSync: false` for manual commit control

### Recommended Configurations

#### Manual Commits, Automatic Files

```typescript
(directorySync({
  autoSync: true, // Auto-sync DB ↔ files
  syncDebounce: 1000, // 1 second debounce
}),
  new GitSyncPlugin({
    autoSync: false, // Manual commits
    autoPush: true, // Auto-push after manual commits
  }));
```

#### Full Automation

```typescript
(directorySync({
  autoSync: true,
  syncDebounce: 1000,
}),
  new GitSyncPlugin({
    autoSync: true, // Auto-commit changes
    syncInterval: 300, // Every 5 minutes
    autoPush: true, // Auto-push commits
  }));
```

## Testing Strategy

### Unit Tests

1. **Directory-Sync**:
   - Entity event triggers export
   - Debouncing batches multiple changes
   - File changes still import correctly
   - Config migration works

2. **Git-Sync**:
   - Skip export when not needed
   - AutoPush after commits
   - No circular commits after pull

### Integration Tests

1. Full flow: Entity → File → Git → Remote
2. Pull flow: Remote → Git → File → Entity
3. Rapid updates: Multiple changes → Single commit
4. Conflict resolution: Concurrent file and DB changes

## Benefits

1. **Performance**: Non-blocking, incremental exports
2. **Automation**: Zero manual intervention needed
3. **Flexibility**: Choose your automation level
4. **Simplicity**: No complex state tracking
5. **Reliability**: Self-correcting on conflicts

## Non-Goals

1. **Conflict Resolution**: Not implementing complex merge strategies
2. **Change Tracking**: Not storing detailed change history
3. **Selective Sync**: All entities sync (use entityTypes filter if needed)

## Future Enhancements

1. **Parallel Exports**: Export multiple entities concurrently
2. **Diff-Based Sync**: Only sync actual changes, not full entities
3. **Conflict UI**: Interface for resolving sync conflicts
4. **Sync Status UI**: Real-time sync status in interfaces
