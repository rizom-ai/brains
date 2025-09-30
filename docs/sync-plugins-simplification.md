# Sync Plugins Simplification Plan

## Problem Statement

The current directory-sync and git-sync plugins have too many commands and tools (14 total operations), making the flow unintuitive and confusing for users. Many operations overlap or duplicate functionality.

## Current State

### Directory-sync (8 operations)
**Commands:**
- `/directory-sync` - Synchronize all entities with directory
- `/sync-status` - Get directory sync status

**Tools:**
- `directory-sync:sync` - Synchronize all entities (async)
- `directory-sync:export` - Export entities to directory
- `directory-sync:import` - Import entities from directory
- `directory-sync:watch` - Start/stop directory watching
- `directory-sync:status` - Get sync status
- `directory-sync:ensure-structure` - Create directory structure

### Git-sync (6 operations)
**Tools:**
- `git-sync:sync` - Full sync (export, commit, push, pull)
- `git-sync:status` - Get repository status
- `git-sync:commit` - Commit changes
- `git-sync:push` - Push to remote
- `git-sync:pull` - Pull from remote
- `git-sync:auto-sync` - Start/stop automatic sync

## Issues

1. **Redundancy**: Multiple ways to do the same thing (e.g., `/sync-status` command vs `status` tool)
2. **Confusion**: Unclear when to use sync vs export/import in directory-sync
3. **Complexity**: Too many manual steps in git-sync (commit, push, pull separately)
4. **Cognitive Load**: 14 operations to understand and remember

## Proposed Simplification

### Directory-sync (3 operations)
**Command:**
- `/directory-sync` - Main user-facing sync operation

**Tools:**
- `directory-sync:status` - Get current state
- `directory-sync:watch` - Control file watching (or make config-only)

**Removed:**
- `/sync-status` command (redundant with status tool)
- `sync` tool (redundant with command)
- `export` tool (handled internally by sync)
- `import` tool (handled internally by sync)
- `ensure-structure` tool (auto-created on first sync)

### Git-sync (2 operations)
**Tools:**
- `git-sync:sync` - Full sync operation
- `git-sync:status` - Get repository state

**Removed:**
- `commit` tool (handled internally by sync)
- `push` tool (handled internally by sync)
- `pull` tool (handled internally by sync)
- `auto-sync` tool (moved to config-only setting)

## Implementation Changes

### 1. Directory-sync

**commands/index.ts:**
- Remove `sync-status` command
- Keep only `/directory-sync` command

**tools/index.ts:**
- Remove: `sync`, `export`, `import`, `ensure-structure`
- Keep: `status`, `watch` (consider making watch config-only)
- Ensure directory structure is created automatically on initialization

**Internal changes:**
- Main sync operation handles both export and import internally
- Automatically determines what needs syncing based on timestamps
- Creates directory structure as needed

### 2. Git-sync

**tools/index.ts:**
- Remove: `commit`, `push`, `pull`, `auto-sync`
- Keep: `sync`, `status`

**Internal changes:**
- `sync` performs full operation: stage changes, commit, push, pull
- Auto-sync controlled entirely by config setting
- Remove runtime toggling of auto-sync

### 3. Configuration Updates

**directory-sync config.yaml:**
```yaml
directory-sync:
  enabled: true
  syncPath: "./brain-data"
  watch: true  # Auto-start watching on init
  deleteOnFileRemoval: true
```

**git-sync config.yaml:**
```yaml
git-sync:
  enabled: true
  autoSync: true  # Auto-sync at intervals
  syncInterval: 300000  # 5 minutes
  commitMessage: "Auto-sync brain data"
```

## Benefits

1. **Reduced Complexity**: From 14 to 5 operations (65% reduction)
2. **Clearer Mental Model**: One way to do each thing
3. **Better Defaults**: Auto-sync and watch controlled by config
4. **Intuitive Flow**: Sync → Status → Configure (via config file)

## Migration Path

1. Update tools and commands as specified
2. Update tests to match new interface
3. Update documentation
4. Add deprecation warnings for removed operations (optional)
5. Update config examples

## Testing Strategy

1. Verify sync operations still work end-to-end
2. Ensure config-based auto behaviors initialize correctly
3. Test that internal operations (export/import, commit/push/pull) work when called via main sync
4. Verify backward compatibility where needed

## Timeline

1. Phase 1: Simplify git-sync (remove individual operations)
2. Phase 2: Simplify directory-sync (consolidate sync operations)
3. Phase 3: Update tests and documentation
4. Phase 4: Deploy and monitor

## Success Metrics

- User confusion reduced (fewer questions about which command to use)
- Faster onboarding (less to learn)
- Maintained functionality (all current use cases still supported)
- Cleaner codebase (less duplication)