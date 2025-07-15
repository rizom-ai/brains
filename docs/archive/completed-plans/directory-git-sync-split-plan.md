# Directory and Git Sync Plugin Split Plan

## Overview

This document outlines the plan to split the current monolithic `git-sync` plugin into two separate, composable plugins:

1. **`directory-sync`** - Handles file-based entity synchronization
2. **`git-sync`** - Adds git version control on top of directory sync

## Motivation

The current `git-sync` plugin combines two distinct responsibilities:

- Managing entity serialization to/from a directory structure
- Git repository operations (init, commit, push, pull)

This tight coupling prevents users from:

- Using file-based storage without git
- Building alternative version control plugins (SVN, Mercurial)
- Testing directory operations independently of git operations

## Architecture Design

### Current Architecture

```
git-sync/
├── plugin.ts         # Plugin registration
├── gitSync.ts        # Mixed directory + git operations
├── types.ts          # Configuration types
└── formatters/       # Status formatters
```

The `GitSync` class currently handles:

- Directory creation and management
- Entity to markdown conversion
- File reading/writing
- Git repository initialization
- Git operations (commit, push, pull)
- Auto-sync scheduling

### Proposed Architecture

```
directory-sync/
├── plugin.ts         # Directory sync plugin
├── directorySync.ts  # Pure directory operations
├── types.ts          # Directory config types
├── formatters/       # Directory status formatters
└── watchers/         # File system watchers

git-sync/
├── plugin.ts         # Git sync plugin
├── gitSync.ts        # Pure git operations
├── types.ts          # Git config types
└── formatters/       # Git status formatters
```

## Directory Sync Plugin

### Responsibilities

1. **Entity Serialization**
   - Convert entities to markdown files
   - Parse markdown files back to entities
   - Manage frontmatter metadata

2. **Directory Structure**
   - Root directory for base entities
   - Subdirectories for each entity type
   - File naming conventions (entity-id.md)

3. **Synchronization**
   - Export entities to directory
   - Import entities from directory
   - Track file changes

4. **File Watching** (optional)
   - Monitor directory for external changes
   - Trigger imports on file modifications

### Plugin Interface

```typescript
interface DirectorySyncPlugin extends Plugin {
  tools: {
    "directory-sync:sync": {
      description: "Synchronize all entities with directory";
      input: {};
      output: { message: string; stats: SyncStats };
    };

    "directory-sync:export": {
      description: "Export entities to directory";
      input: { entityTypes?: string[] };
      output: { exported: number; failed: number };
    };

    "directory-sync:import": {
      description: "Import entities from directory";
      input: { paths?: string[] };
      output: { imported: number; skipped: number; failed: number };
    };

    "directory-sync:watch": {
      description: "Start/stop directory watching";
      input: { action: "start" | "stop" };
      output: { watching: boolean };
    };

    "directory-sync:status": {
      description: "Get directory sync status";
      input: {};
      output: DirectorySyncStatus;
    };
  };
}
```

### Configuration Schema

```typescript
interface DirectorySyncConfig {
  syncPath: string; // Directory path for synchronization
  watchEnabled?: boolean; // Enable file watching (default: false)
  watchInterval?: number; // Watch polling interval in ms (default: 5000)
  includeMetadata?: boolean; // Include frontmatter metadata (default: true)
  entityTypes?: string[]; // Specific entity types to sync (default: all)
}
```

### Directory Sync Service

```typescript
class DirectorySync {
  constructor(options: {
    syncPath: string;
    entityService: EntityService;
    logger: Logger;
  });

  // Core operations
  async exportEntities(entityTypes?: string[]): Promise<ExportResult>;
  async importEntities(paths?: string[]): Promise<ImportResult>;
  async sync(): Promise<SyncResult>;

  // File operations
  async writeEntity(entity: BaseEntity): Promise<void>;
  async readEntity(path: string): Promise<RawEntity>;

  // Directory management
  getEntityFilePath(entity: BaseEntity): string;
  ensureDirectoryStructure(): Promise<void>;

  // Status
  async getStatus(): Promise<DirectorySyncStatus>;

  // File watching
  startWatching(): void;
  stopWatching(): void;
}
```

## Git Sync Plugin

### Responsibilities

1. **Git Repository Management**
   - Clone from URL or initialize new repo
   - Configure remotes and branches
   - Handle authentication

2. **Version Control Operations**
   - Commit changes
   - Push to remote
   - Pull from remote
   - Track git status

3. **Integration with Directory Sync**
   - Use directory-sync for file operations
   - Add git operations on top
   - Coordinate sync timing

### Plugin Dependencies

```typescript
{
  id: "git-sync",
  version: "2.0.0",
  dependencies: ["directory-sync"],
  // ...
}
```

### Configuration Schema

```typescript
interface GitSyncConfig {
  gitUrl: string; // Git repository URL (new!)
  branch?: string; // Branch to use (default: "main")
  autoSync?: boolean; // Enable auto sync (default: false)
  syncInterval?: number; // Sync interval in seconds (default: 300)
  commitMessage?: string; // Custom commit message template
  authorName?: string; // Git author name
  authorEmail?: string; // Git author email
}
```

### Git Sync Service

```typescript
class GitSync {
  private directorySync: DirectorySyncPlugin;
  private git: SimpleGit;

  constructor(options: {
    gitUrl: string;
    branch: string;
    directorySync: DirectorySyncPlugin;
    logger: Logger;
  });

  // Initialization
  async initialize(): Promise<void> {
    // Clone or init repository
    // Configure directory-sync to use repo directory
  }

  // Git operations
  async commit(message?: string): Promise<void>;
  async push(): Promise<void>;
  async pull(): Promise<void>;
  async sync(): Promise<void>;

  // Status
  async getStatus(): Promise<GitSyncStatus>;

  // Auto-sync
  startAutoSync(): void;
  stopAutoSync(): void;
}
```

### Plugin Communication

```typescript
// In git-sync plugin registration
async register(context: PluginContext): Promise<PluginCapabilities> {
  // Get directory-sync plugin
  const dirSyncPlugin = context.getPlugin('directory-sync');
  if (!dirSyncPlugin) {
    throw new Error('git-sync requires directory-sync plugin');
  }

  // Initialize git repository
  const repoPath = await this.initializeGitRepo(this.config.gitUrl);

  // Configure directory-sync to use git repo directory
  await dirSyncPlugin.tools['directory-sync:configure']({
    syncPath: repoPath
  });

  // Create GitSync instance
  this.gitSync = new GitSync({
    gitUrl: this.config.gitUrl,
    branch: this.config.branch,
    directorySync: dirSyncPlugin,
    logger: context.logger
  });
}
```

## Plugin Communication Architecture Decision

### Background

When implementing the git-sync and directory-sync split, we need to decide how these plugins will communicate with each other. This decision will set a pattern for future plugin interactions.

### Options Considered

#### Option 1: Direct Plugin Reference (Tight Coupling)

```typescript
// In GitSyncPlugin
this.directorySync = context.getPlugin("directory-sync");
const result = await this.directorySync.exportEntities();
```

**Pros:**

- Simple and straightforward
- Type-safe with proper casting
- Immediate feedback and error handling
- Easy to debug

**Cons:**

- Tight coupling between plugins
- GitSync must know about DirectorySync's interface
- Harder to swap implementations
- Doesn't scale well with many plugin interactions

#### Option 2: Message Bus (Loose Coupling) - RECOMMENDED

```typescript
// DirectorySync registers handlers
messageBus.registerHandler("entity:export:request", async (msg) => {
  const result = await this.exportEntities(msg.payload.entityTypes);
  return { success: true, data: result };
});

// GitSync sends messages
const response = await messageBus.send("entity:export:request", {
  entityTypes: ["note"],
});
```

**Pros:**

- Loose coupling - plugins don't know about each other
- Can have multiple handlers for same message
- Easier to add middleware/logging/monitoring
- More scalable architecture
- Follows established patterns (VS Code, WordPress, Kubernetes)

**Cons:**

- More complex initial implementation
- Async by nature
- Requires careful schema design for type safety

#### Option 3: Service Registry Pattern

```typescript
// DirectorySync registers a service
context.registry.register("directory-sync-service", {
  exportEntities: async (types) => { ... },
  importEntities: async (paths) => { ... }
});

// GitSync uses the service
const dirSync = context.registry.get("directory-sync-service");
```

**Pros:**

- Balance between coupling and flexibility
- Clear service interfaces
- Type-safe with interfaces

**Cons:**

- Still some coupling through interfaces
- Need to manage service registry

#### Option 4: Tool-Based Communication

```typescript
// GitSync calls DirectorySync's tools
const result = await context.invokeTool("directory-sync:export", {
  entityTypes: ["note"],
});
```

**Pros:**

- Uses existing MCP infrastructure
- Tools are already the public API

**Cons:**

- Tools designed for external use
- May add unnecessary overhead

### Decision: Message Bus Architecture

We will implement **Option 2: Message Bus** for the following reasons:

1. **Future-Oriented**: Builds scalable patterns for plugin ecosystem
2. **True Plugin Independence**: GitSync depends on "file operations", not specifically DirectorySync
3. **Flexibility**: Could have multiple storage providers (S3, FTP, Database)
4. **Proven Pattern**: Used by successful plugin systems (VS Code, WordPress)
5. **App Responsibility**: The app decides which plugins provide which capabilities

### Implementation Approach

1. **Define Generic Messages**: Entity export/import messages that any storage plugin could handle
2. **Directory-Sync Registers Handlers**: Implements the file-based storage strategy
3. **Git-Sync Sends Messages**: Requests storage operations without knowing the provider
4. **App Orchestrates**: Ensures both plugins are loaded when git functionality is needed

This approach means git-sync could work with any storage provider that handles the entity messages, not just directory-sync.

## Implementation Plan

### Phase 1: Create Directory Sync Plugin

1. **Create Package Structure**

   ```bash
   packages/directory-sync/
   ├── src/
   │   ├── index.ts
   │   ├── plugin.ts
   │   ├── directorySync.ts
   │   ├── types.ts
   │   ├── schemas.ts
   │   └── formatters/
   │       └── directorySyncStatusFormatter.ts
   ├── test/
   ├── package.json
   └── tsconfig.json
   ```

2. **Extract Directory Operations**
   - Move entity file path logic
   - Move markdown read/write operations
   - Move import/export logic
   - Remove git-specific code

3. **Implement File Watching**
   - Use chokidar or native fs.watch
   - Debounce file change events
   - Trigger imports on changes

4. **Create Tests**
   - Unit tests for directory operations
   - Integration tests with entity service
   - File watching tests

### Phase 2: Refactor Git Sync Plugin

1. **Update Dependencies**

   ```json
   {
     "dependencies": {
       "@brains/directory-sync": "workspace:*"
     }
   }
   ```

2. **Remove Directory Operations**
   - Delete file management code
   - Delete entity serialization code
   - Keep only git-specific operations

3. **Update Configuration**
   - Change `repoPath` to `gitUrl`
   - Add repository cloning logic
   - Handle authentication

4. **Integrate with Directory Sync**
   - Get directory-sync plugin in register
   - Configure it with cloned repo path
   - Use its tools for file operations

5. **Update Tests**
   - Mock directory-sync plugin
   - Test git operations
   - Test plugin interaction

### Phase 3: Migration and Documentation

1. **Update Example Apps**

   ```typescript
   // Old configuration
   plugins: [
     gitSync({
       repoPath: "/path/to/repo",
       branch: "main",
       autoSync: true,
     }),
   ];

   // New configuration
   plugins: [
     directorySync({
       syncPath: "/path/to/sync",
       watchEnabled: true,
     }),
     gitSync({
       gitUrl: "https://github.com/user/brain-repo.git",
       branch: "main",
       autoSync: true,
     }),
   ];
   ```

2. **Migration Guide**
   - Document configuration changes
   - Provide migration script if needed
   - Update all documentation

3. **Backward Compatibility**
   - Consider providing a legacy wrapper
   - Deprecation warnings
   - Grace period for migration

## Benefits

### For Users

1. **Flexibility**
   - Use directory sync without git
   - Choose different VCS systems
   - Mix and match plugins

2. **Performance**
   - Directory sync without git overhead
   - Faster local operations
   - Optional file watching

3. **Simplicity**
   - Clearer configuration
   - Easier troubleshooting
   - Better error messages

### For Developers

1. **Maintainability**
   - Single responsibility per plugin
   - Cleaner codebase
   - Easier to test

2. **Extensibility**
   - Build new VCS plugins
   - Add cloud sync plugins
   - Create specialized directory layouts

3. **Reusability**
   - Directory sync as foundation
   - Shared file operations
   - Common patterns

## Configuration Examples

### Local Directory Sync Only

```typescript
plugins: [
  directorySync({
    syncPath: "./brain-data",
    watchEnabled: true,
    watchInterval: 5000,
  }),
];
```

### Git Sync with Auto-commit

```typescript
plugins: [
  directorySync({
    syncPath: "./brain-repo", // Will be managed by git-sync
    includeMetadata: true,
  }),
  gitSync({
    gitUrl: "git@github.com:user/my-brain.git",
    branch: "main",
    autoSync: true,
    syncInterval: 300,
    commitMessage: "Auto-sync: {date}",
    authorName: "Brain Bot",
    authorEmail: "bot@example.com",
  }),
];
```

### Multiple Sync Targets

```typescript
plugins: [
  // Primary sync to git
  directorySync({
    id: "directory-sync-git",
    syncPath: "./git-brain",
  }),
  gitSync({
    gitUrl: "https://github.com/user/brain.git",
    directorySync: "directory-sync-git", // Specify which directory sync to use
  }),

  // Secondary sync to local backup
  directorySync({
    id: "directory-sync-backup",
    syncPath: "/backup/brain",
    watchEnabled: false,
  }),
];
```

## Testing Strategy

### Directory Sync Tests

1. **Unit Tests**
   - File path generation
   - Markdown conversion
   - Directory structure

2. **Integration Tests**
   - Entity service interaction
   - Import/export operations
   - File watching

3. **Performance Tests**
   - Large entity sets
   - File operation speed
   - Memory usage

### Git Sync Tests

1. **Unit Tests**
   - Git operations
   - URL parsing
   - Branch management

2. **Integration Tests**
   - Plugin communication
   - Full sync workflow
   - Error scenarios

3. **End-to-End Tests**
   - Complete setup
   - Auto-sync behavior
   - Conflict resolution

## Error Handling

### Directory Sync Errors

- **File System Errors**: Permission denied, disk full
- **Parse Errors**: Invalid markdown, corrupted files
- **Entity Errors**: Missing adapters, validation failures

### Git Sync Errors

- **Network Errors**: Connection failed, timeout
- **Authentication Errors**: Invalid credentials, SSH key issues
- **Repository Errors**: Conflicts, invalid remote

### Error Recovery

1. **Graceful Degradation**
   - Continue with partial sync
   - Log detailed errors
   - Notify user of issues

2. **Retry Logic**
   - Exponential backoff for network
   - Configurable retry limits
   - Skip problematic files

3. **Conflict Resolution**
   - For directory conflicts: newest wins
   - For git conflicts: require manual intervention
   - Backup before destructive operations

## Future Enhancements

### Directory Sync

1. **Advanced File Watching**
   - Efficient inotify/FSEvents usage
   - Batch change processing
   - Ignore patterns

2. **Performance Optimization**
   - Parallel file operations
   - Incremental sync
   - Caching mechanisms

3. **Format Support**
   - JSON export option
   - Custom serialization formats
   - Binary attachment handling

### Git Sync

1. **Advanced Git Features**
   - Branch management UI
   - Merge strategies
   - Tag support

2. **Collaboration Features**
   - Multi-user support
   - Conflict resolution UI
   - Change attribution

3. **Security Enhancements**
   - Encrypted repositories
   - Signed commits
   - Access control

## Conclusion

Splitting the git-sync plugin into directory-sync and git-sync plugins provides a cleaner, more flexible architecture. Users gain the ability to use file-based storage without git, while developers benefit from clearer separation of concerns and easier testing. The plugin dependency system ensures smooth integration while maintaining modularity.

This refactoring aligns with the Personal Brain's philosophy of composable, extensible components while maintaining backward compatibility through careful migration planning.
