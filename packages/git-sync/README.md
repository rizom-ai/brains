# @brains/git-sync

Git synchronization plugin for Personal Brain applications.

## Features

- Export entities to markdown files in a git repository
- Automatic commits with timestamps
- Push/pull to remote repositories
- Conflict resolution
- Auto-sync scheduling
- Entity type organization

## Installation

```bash
bun add @brains/git-sync
```

## Usage

```typescript
import { gitSync } from "@brains/git-sync";

// In your brain config
runBrainApp({
  plugins: [
    gitSync({
      repoPath: "./brain-repo",
      remote: "git@github.com:username/brain-backup.git",
      branch: "main",
      autoSync: true,
      syncInterval: 30, // minutes
    }),
  ],
});
```

## File Structure

The plugin organizes entities by type:

```
brain-repo/
├── .git/
├── .gitignore
├── README.md
├── notes/
│   ├── Welcome to Brain.md
│   ├── Project Ideas.md
│   └── Meeting Notes 2024-01-15.md
├── tasks/
│   ├── Setup Git Sync.md
│   └── Review Documentation.md
├── profiles/
│   ├── John Doe.md
│   └── Jane Smith.md
└── [other-entity-types]/
```

Each entity is saved with its title as the filename. The context plugins define their own title conventions.

## Commands

Once registered, the plugin adds these commands:

- `brain sync` - Sync all changes
- `brain sync:pull` - Pull remote changes
- `brain sync:push` - Push local changes
- `brain sync:status` - Show sync status

## MCP Tools

The plugin exposes the following MCP tool:

```json
{
  "name": "git_sync",
  "description": "Synchronize brain data with git repository",
  "inputSchema": {
    "type": "object",
    "properties": {
      "operation": {
        "type": "string",
        "enum": ["sync", "pull", "push", "status"]
      }
    },
    "required": ["operation"]
  }
}
```

## Configuration

```typescript
interface GitSyncConfig {
  repoPath: string; // Path to git repository
  remote?: string; // Remote repository URL
  branch?: string; // Branch name (default: "main")
  autoSync?: boolean; // Enable automatic syncing
  syncInterval?: number; // Sync interval in minutes
}
```

## License

MIT
