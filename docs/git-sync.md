# Git Sync Plugin

The Git Sync plugin provides version control and synchronization capabilities for brain data, enabling backup, history tracking, and sharing across devices.

## Overview

Git Sync works alongside the Directory Sync plugin to add git version control to your entity data. When directory-sync exports entities to markdown files, git-sync commits and pushes those changes to a remote repository.

## Installation

Add the git-sync plugin to your brain configuration:

```typescript
import { defineConfig } from "@brains/app";
import { gitSync } from "@brains/git-sync";

export default defineConfig({
  plugins: [
    gitSync({
      repo: "username/brain-data",
      branch: "main",
      autoSync: true,
      syncInterval: 5, // minutes
      autoPush: true,
      authToken: process.env.GIT_AUTH_TOKEN,
      authorName: "Brain Bot",
      authorEmail: "brain@example.com",
    }),
  ],
});
```

## Configuration Options

| Option          | Type    | Default               | Description                                              |
| --------------- | ------- | --------------------- | -------------------------------------------------------- |
| `repo`          | string  | -                     | GitHub repository in owner/name format                   |
| `gitUrl`        | string  | -                     | Git remote URL override (derived from `repo` if omitted) |
| `branch`        | string  | `"main"`              | Git branch to sync                                       |
| `autoSync`      | boolean | `false`               | Enable automatic syncing on interval                     |
| `syncInterval`  | number  | `5`                   | Sync interval in minutes (when autoSync is enabled)      |
| `autoPush`      | boolean | `true`                | Automatically push after commits                         |
| `authToken`     | string  | -                     | Authentication token for private repositories            |
| `authorName`    | string  | -                     | Git author name for commits                              |
| `authorEmail`   | string  | -                     | Git author email for commits                             |
| `commitMessage` | string  | `"Auto-sync: {date}"` | Commit message template                                  |

## Commands

### `/git-sync`

Manually trigger a sync with the remote repository:

```
/git-sync
```

This will:

1. Pull latest changes from remote
2. Import any new entities from pulled files
3. Commit local changes
4. Push to remote

## How It Works

### Integration with Directory Sync

Git Sync integrates with the directory-sync plugin via the message bus:

1. **On startup**: Git initializes/clones the repository in the `brain-data` directory
2. **After directory-sync export**: Git commits and optionally pushes changes
3. **After git pull**: Sends `entity:import:request` to directory-sync to import new files

### Sync Flow

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Entity Change  │────▶│  Directory Sync  │────▶│    Git Sync     │
│   (Database)    │     │  (Export to MD)  │     │ (Commit & Push) │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                                                          │
                                                          ▼
                                                 ┌─────────────────┐
                                                 │  Remote Repo    │
                                                 │   (GitHub)      │
                                                 └─────────────────┘
```

### Automatic Syncing

When `autoSync: true`, the plugin runs sync at the configured interval:

1. Pulls remote changes
2. Imports any new entities
3. Commits local changes
4. Pushes if `autoPush: true`

### Conflict Resolution

Git Sync uses an automatic conflict resolution strategy:

- Conflicts are resolved by accepting the **remote version** (`-Xtheirs`)
- This ensures remote changes are never lost
- Local changes that conflict will be overwritten

For manual conflict resolution, disable `autoSync` and use `/git-sync` manually.

## File Structure

Git Sync uses the same directory structure as directory-sync:

```
brain-data/
├── .git/
├── .gitkeep
├── notes/
│   └── note-abc123.md
├── posts/
│   └── my-blog-post.md
├── links/
│   └── link-def456.md
└── decks/
    └── presentation-ghi789.md
```

## Authentication

### GitHub Personal Access Token

For GitHub repositories, create a Personal Access Token with `repo` scope:

1. Go to GitHub Settings → Developer settings → Personal access tokens
2. Generate a new token with `repo` scope
3. Pass the token via `authToken` config or environment variable:

```typescript
gitSync({
  repo: "username/brain-data",
  authToken: process.env.GITHUB_TOKEN,
});
```

### SSH Authentication

For SSH URLs, use the `gitUrl` override:

```typescript
gitSync({
  repo: "username/brain-data",
  gitUrl: "git@github.com:username/brain-data.git",
  // No authToken needed for SSH
});
```

## Events

Git Sync listens for these message bus events:

| Event                    | Description                                       |
| ------------------------ | ------------------------------------------------- |
| `sync:initial:completed` | Triggers sync after directory-sync initial export |
| `system:plugins:ready`   | Final sync after all plugins initialize           |

## Environment Variables

For deployment, you can use environment variables:

```bash
# Git authentication
GIT_AUTH_TOKEN=ghp_xxxxxxxxxxxx

# For testing (overrides default brain-data path)
GIT_SYNC_TEST_PATH=/tmp/test-repo
```

## Troubleshooting

### "Failed to push changes"

- Verify your `authToken` is valid and has push permissions
- Check if the remote branch exists (git-sync will create it on first push)
- Ensure the repository URL is correct

### "Conflict markers detected"

- Git-sync automatically resolves conflicts using remote version
- If this persists, manually resolve in the brain-data directory

### "Remote branch doesn't exist"

- This is normal for new repositories
- Git-sync will create the branch on first push

### Auto-sync not working

- Ensure `autoSync: true` is set
- Check `syncInterval` is a reasonable value (minimum 1 minute)
- Verify the plugin loaded successfully in logs

## Best Practices

1. **Use private repositories** for personal brain data
2. **Set up backup remotes** for redundancy
3. **Configure auto-sync** for hands-off operation
4. **Use environment variables** for tokens in production
5. **Review sync logs** periodically for errors
