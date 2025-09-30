# Sync Plugins Simplification Plan

## Summary of Refined Decisions

Based on Q&A refinement session, the final simplification:

- **Directory-sync**: 2 operations (command + sync tool)
- **Git-sync**: 3 operations (command + sync tool + status tool)
- **Total reduction**: From 14 to 5 operations (64% reduction)

Key decisions:

- Both plugins get a command for users and a sync tool for programmatic access
- Watch and auto-sync become config-only (no runtime control)
- Commands provide summary feedback after operations
- Git-sync adds `pullOnStartup` config for remote synchronization
- Directory-sync removes status tool (not useful enough)

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

### Directory-sync (2 operations)

**Command:**

- `/directory-sync` - Main user-facing sync operation (shows summary after completion)

**Tools:**

- `directory-sync:sync` - Programmatic sync operation (for MCP/tools)

**Removed:**

- `/sync-status` command (redundant, removed)
- `directory-sync:status` tool (not useful enough to keep)
- `directory-sync:export` tool (handled internally by sync)
- `directory-sync:import` tool (handled internally by sync)
- `directory-sync:watch` tool (moved to config-only)
- `directory-sync:ensure-structure` tool (auto-created as needed)

### Git-sync (3 operations)

**Command:**

- `/git-sync` - User-facing sync command (shows status summary after completion)

**Tools:**

- `git-sync:sync` - Programmatic sync operation (for MCP/tools)
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
- Keep only `/directory-sync` command (with summary output)

**tools/index.ts:**

- Remove: `status`, `export`, `import`, `ensure-structure`, `watch`
- Keep: `sync` (for programmatic access)

**Internal changes:**

- Sync operation handles both export and import internally
- Watch functionality controlled by config only (no runtime toggle)
- Directory structure created automatically as needed
- Command shows summary: "Exported X entities, imported Y files, deleted Z entities"

### 2. Git-sync

**commands/index.ts:**

- Add new `/git-sync` command (with status summary output)

**tools/index.ts:**

- Remove: `commit`, `push`, `pull`, `auto-sync`
- Keep: `sync`, `status`

**Internal changes:**

- `sync` performs full operation: stage changes, commit, push, pull
- Auto-sync controlled entirely by config setting
- Pull on startup controlled by `pullOnStartup` config option
- Command shows summary: "Committed X files, pushed to origin, pulled Y updates"

### 3. Configuration Updates

**directory-sync config.yaml:**

```yaml
directory-sync:
  enabled: true
  syncPath: "./brain-data"
  watch: true # Auto-start watching on init (no runtime control)
  deleteOnFileRemoval: true
```

**git-sync config.yaml:**

```yaml
git-sync:
  enabled: true
  autoSync: true # Auto-sync at intervals
  pullOnStartup: true # Pull remote changes on startup
  syncInterval: 300000 # 5 minutes
  commitMessage: "Auto-sync brain data"
```

## Benefits

1. **Reduced Complexity**: From 14 to 5 operations (64% reduction)
2. **Clearer Mental Model**: One way to do each thing
3. **Better Defaults**: Auto-sync and watch controlled by config
4. **Intuitive Flow**: Commands for users, tools for programmatic access
5. **Better Feedback**: Commands show summaries of what was synced
6. **Startup Handling**: Git-sync pulls remote changes on startup

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
