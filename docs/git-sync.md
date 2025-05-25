# Git Sync for Brains

Git sync provides version control and synchronization capabilities for brain data, enabling backup, history tracking, and sharing across devices.

## Architecture Overview

Git sync is implemented as a core service in the shell, not as a plugin. This ensures:

- All entity types benefit from version control
- Consistent sync behavior across different brain types
- No dependencies on specific contexts

## Design Principles

1. **Non-intrusive**: Git operations don't interfere with normal brain operations
2. **Entity-agnostic**: Works with any entity type that supports markdown serialization
3. **Conflict-aware**: Handles merge conflicts gracefully
4. **Privacy-first**: Supports encrypted repositories for sensitive data

## Implementation

### GitSyncService

The `GitSyncService` is a core shell component:

```typescript
// packages/shell/src/sync/gitSyncService.ts
import { Registry } from "../registry/registry";
import { EntityService } from "../entity/entityService";
import { Logger } from "@brains/utils";

export interface GitSyncConfig {
  repoPath: string;
  remote?: string;
  branch?: string;
  autoSync?: boolean;
  syncInterval?: number; // minutes
}

export class GitSyncService {
  private static instance: GitSyncService | null = null;

  public static getInstance(): GitSyncService {
    if (!GitSyncService.instance) {
      GitSyncService.instance = new GitSyncService();
    }
    return GitSyncService.instance;
  }

  public static resetInstance(): void {
    GitSyncService.instance = null;
  }

  public static createFresh(): GitSyncService {
    return new GitSyncService();
  }

  private constructor(
    private config?: GitSyncConfig,
    private logger?: Logger,
    private entityService?: EntityService,
  ) {}

  async initialize(config: GitSyncConfig): Promise<void> {
    // Initialize git repository
    // Set up file watchers
    // Configure auto-sync if enabled
  }

  async syncAll(): Promise<void> {
    // Export all entities to markdown
    // Stage changes
    // Commit with timestamp
    // Push to remote if configured
  }

  async pull(): Promise<void> {
    // Pull from remote
    // Import changed markdown files
    // Update database
  }

  async push(): Promise<void> {
    // Export current state
    // Commit changes
    // Push to remote
  }
}
```

### File Structure

Git sync uses a predictable file structure:

```
brain-repo/
├── .git/
├── .gitignore
├── README.md
├── notes/
│   ├── 2024/
│   │   ├── 01/
│   │   │   └── note-abc123.md
│   │   └── 02/
│   │       └── note-def456.md
│   └── index.md
├── tasks/
│   ├── active/
│   │   └── task-ghi789.md
│   ├── completed/
│   │   └── task-jkl012.md
│   └── index.md
├── people/
│   └── person-mno345.md
└── projects/
    └── project-pqr678.md
```

### Commands

Git sync is exposed through the BrainProtocol:

```typescript
// Sync commands
brain sync              // Sync all changes
brain sync --pull       // Pull remote changes
brain sync --push       // Push local changes
brain sync --status     // Show sync status

// Configuration
brain sync --init <repo-url>  // Initialize sync with remote
brain sync --auto on          // Enable auto-sync
brain sync --interval 30      // Set sync interval (minutes)
```

### Conflict Resolution

When conflicts occur:

1. **Automatic resolution** for non-conflicting changes
2. **Manual resolution** for conflicting content:
   - Creates `.conflict` files
   - Notifies user
   - Provides merge tools

### Integration with Shell

The GitSyncService integrates with:

- **EntityService**: For exporting/importing entities
- **MessageBus**: For sync notifications
- **BrainProtocol**: For command handling

## Benefits

1. **Version History**: Track changes over time
2. **Backup**: Automatic backups to git repository
3. **Multi-device**: Sync across devices
4. **Collaboration**: Share specific contexts (with permissions)
5. **Offline Support**: Work offline, sync when connected

## Security Considerations

- Supports encrypted git repositories
- Can exclude sensitive entities from sync
- Respects brain-specific privacy settings
- Optional commit signing

## Future Enhancements

1. **Selective Sync**: Choose which entity types to sync
2. **Branch Management**: Support for feature branches
3. **Merge Strategies**: Configurable merge behavior
4. **Git LFS**: Support for large attachments
5. **Hook System**: Pre/post sync hooks for custom logic
