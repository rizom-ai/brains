# Git-Sync Implementation Plan

## Architecture

- Git-sync plugin layers on top of directory-sync plugin
- Uses separate `brain-data/` directory for git repository
- Directory-sync handles all file I/O, git-sync only does git operations
- Entity IDs with colons map to subdirectories for better organization

## Configuration

```typescript
gitSync({
  gitUrl: "https://github.com/user/brain-data", // Required
  authToken: process.env.GIT_AUTH_TOKEN, // Optional
  autoSync: true, // Auto-sync by default
});
```

## Initialization Flow

1. Clone remote repository if it exists
2. Import all remote entities into brain database
3. Merge with local entities by ID
4. Auto-resolve conflicts using timestamps (newer wins)
5. Commit only new/changed entities

## Sync Behavior

- **Event-triggered commits**: Commits on entity changes (not time-based)
- **30-second batching**: Groups related changes
- **Pull-before-push**: Every sync does pull → commit → push
- **Auto-resolve conflicts**: By timestamp throughout
- **Smart commit messages**: Lists entity titles up to 3, then "and X more"

## Key Design Decisions

### Repository Management

- ✅ Separate directory (`brain-data/`) from main brain directory
- ✅ Requires directory-sync plugin as prerequisite
- ✅ Remote repository must exist (manual creation required)
- ✅ Fail fast if remote is unreachable on startup

### Authentication

- ✅ Use environment variables for auth tokens
- ✅ Support both HTTPS (with token) and SSH URLs
- ✅ No credentials stored in config files

### Conflict Resolution

- ✅ Auto-resolve by timestamp (newer wins)
- ✅ Applied consistently for both init and ongoing sync
- ✅ Log all auto-resolved conflicts for transparency

### Commit Strategy

- ✅ Event-based commits (on entity CRUD operations)
- ✅ 30-second batching window for related changes
- ✅ Descriptive commit messages with entity titles
- ✅ Smart truncation for bulk operations

### Push/Pull Strategy

- ✅ Auto-sync enabled by default
- ✅ Pull-before-push pattern for every sync
- ✅ Continuous bidirectional sync with auto-resolve

### Entity ID Path Mapping

Entity IDs containing colons are mapped to subdirectory structures:

- `summary:daily:2024-01-27` → `summaries/daily/2024-01-27.md`
- `topic:tech:ai:llms` → `topics/tech/ai/llms.md`
- `link:article:123` → `links/article/123.md`

**Benefits:**

- ✅ Windows filesystem compatibility (no colons in filenames)
- ✅ Logical organization in file explorer
- ✅ Cleaner git diffs and history
- ✅ Natural browsing structure

**Implementation:**

```typescript
// Convert colons to path separators
const idParts = entity.id.split(":");
const filename = idParts.pop() + ".md";
const subdirs = idParts.length > 0 ? idParts : [];
return join(syncPath, entityType, ...subdirs, filename);
```

### Invalid Entity Handling

When git-sync pulls changes containing invalid markdown files:

1. **Pull completes** - All files downloaded from remote
2. **Directory-sync attempts import** - Processes all .md files
3. **For each failed import**:
   - Rename `entity.md` → `entity.md.invalid`
   - Log error details to `.import-errors.log`
4. **Git-sync commits renames**:
   ```
   Quarantined invalid entities: "topic-broken", "summary-malformed"
   ```
5. **User fixes issues**:
   - Review `.import-errors.log` for error details
   - Fix content in `.md.invalid` files
   - Rename back to `.md`
   - Next sync retries import

**Benefits:**

- ✅ Non-blocking - valid entities still import
- ✅ Visible - `.invalid` extension marks problems
- ✅ Traceable - git history shows quarantine events
- ✅ No retry loops - directory-sync ignores `.invalid` files

## Implementation Steps

### Phase 1: Core Integration

1. **Update git-sync plugin structure**
   - Remove hard-coded `brain-repo` path
   - Add dependency check for directory-sync
   - Implement message handlers for directory-sync events

2. **Add initialization logic**
   - Check remote repository existence
   - Clone if exists, fail if not
   - Import entities from cloned markdown files
   - Handle merge with seed data

### Phase 2: Event-Based Sync

3. **Implement event-based commits**
   - Listen to entity change events from directory-sync
   - Implement 30-second batching logic
   - Generate descriptive commit messages

4. **Add pull-before-push flow**
   - Pull with auto-resolve on conflicts
   - Commit batched local changes
   - Push to remote
   - Handle network failures gracefully

### Phase 3: Commands and UX

5. **Update configuration**
   - Require gitUrl in config
   - Support optional auth token from environment
   - Default autoSync to true

6. **Add commands**
   - `brain git-sync:status` - Show sync status
   - `brain git-sync:sync` - Manual sync trigger
   - `brain git-sync:history <entity>` - Show entity history
   - `brain git-sync:toggle` - Enable/disable auto-sync

## Files to Modify

- `plugins/git-sync/src/plugin.ts` - Main plugin file
- `plugins/git-sync/src/lib/git-sync.ts` - Core git operations
- `plugins/git-sync/src/types.ts` - Configuration types
- `plugins/git-sync/src/tools/index.ts` - Command implementations
- `plugins/git-sync/README.md` - User documentation
- `plugins/git-sync/test/*.test.ts` - Tests for new functionality

## Example Usage

```typescript
// brain.config.ts
import { gitSync } from "@brains/git-sync";
import { directorySync } from "@brains/directory-sync";

export default defineConfig({
  plugins: [
    directorySync({}), // Required prerequisite
    gitSync({
      gitUrl: "https://github.com/username/my-brain-backup",
      authToken: process.env.GITHUB_TOKEN,
      autoSync: true, // Default, can be omitted
    }),
  ],
});
```

## Success Criteria

- Zero data loss during sync operations
- Automatic conflict resolution works 100% of time
- Sync completes within 5 seconds for typical changes
- Clear error messages when remote is unavailable
- Meaningful git history that can be reviewed
- Entity IDs with colons properly map to subdirectories
- Invalid entities quarantined without blocking valid imports
