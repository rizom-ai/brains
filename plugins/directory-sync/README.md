# @brains/directory-sync

File system synchronization plugin for Personal Brain applications.

## Overview

This plugin monitors directories for changes and automatically syncs markdown files to the Brain's entity system. It enables bidirectional synchronization between your file system and the Brain database.

## Features

- Watch directories for file changes
- Auto-import markdown files as entities
- Bidirectional sync (file ↔ entity)
- Frontmatter metadata extraction
- Ignore patterns support
- Batch import capabilities
- Real-time file monitoring

## Installation

```bash
bun add @brains/directory-sync
```

## Usage

```typescript
import { DirectorySyncPlugin } from "@brains/directory-sync";

const plugin = new DirectorySyncPlugin({
  directories: [
    {
      path: "~/Documents/notes",
      pattern: "**/*.md",
      entityType: "note",
    },
    {
      path: "~/Documents/articles",
      pattern: "**/*.md",
      entityType: "article",
    },
  ],
  watch: true,
  syncInterval: 5000,
});

// Register with shell
await shell.registerPlugin(plugin);
```

## Configuration

```typescript
interface DirectorySyncConfig {
  directories: DirectoryConfig[];
  watch?: boolean;           // Enable file watching
  syncInterval?: number;      // Sync check interval (ms)
  ignorePatterns?: string[];  // Glob patterns to ignore
  preserveFrontmatter?: boolean;
  autoImport?: boolean;       // Auto-import new files
}

interface DirectoryConfig {
  path: string;              // Directory path
  pattern?: string;          // File pattern (glob)
  entityType?: string;       // Default entity type
  recursive?: boolean;       // Scan subdirectories
}
```

## File Format

Markdown files with optional frontmatter:

```markdown
---
title: My Note
tags: [typescript, tutorial]
type: note
created: 2024-01-01
---

# Content

Your markdown content here...
```

## Sync Operations

### Import Files

```typescript
// Import single file
await plugin.importFile("/path/to/file.md");

// Import directory
await plugin.importDirectory("/path/to/directory", {
  pattern: "**/*.md",
  entityType: "note",
});

// Batch import
await plugin.batchImport([
  "/path/to/file1.md",
  "/path/to/file2.md",
]);
```

### Export Entities

```typescript
// Export entity to file
await plugin.exportEntity(entityId, "/path/to/file.md");

// Export all entities of type
await plugin.exportByType("note", "/path/to/directory");
```

## File Watching

Real-time monitoring of file changes:

```typescript
const plugin = new DirectorySyncPlugin({
  directories: [{ path: "~/notes" }],
  watch: true,
});

// File changes are automatically synced
// - New files → Create entities
// - Modified files → Update entities
// - Deleted files → Mark entities as deleted
```

## Ignore Patterns

Exclude files from sync:

```typescript
const plugin = new DirectorySyncPlugin({
  ignorePatterns: [
    "**/.git/**",
    "**/node_modules/**",
    "**/*.tmp",
    ".DS_Store",
    "**/_drafts/**",
  ],
});
```

## Conflict Resolution

Handle sync conflicts:

```typescript
plugin.on("conflict", async (conflict) => {
  // conflict.type: "file-newer" | "entity-newer" | "both-modified"
  // conflict.file: File information
  // conflict.entity: Entity information
  
  // Resolve strategy
  return "use-file"; // or "use-entity" or "merge"
});
```

## Metadata Mapping

Map file metadata to entity properties:

```typescript
const plugin = new DirectorySyncPlugin({
  metadataMapper: (frontmatter) => ({
    title: frontmatter.title,
    tags: frontmatter.tags || [],
    metadata: {
      author: frontmatter.author,
      published: frontmatter.published,
    },
  }),
});
```

## Events

```typescript
plugin.on("file:imported", (event) => {
  console.log(`Imported: ${event.file} → ${event.entityId}`);
});

plugin.on("file:updated", (event) => {
  console.log(`Updated: ${event.file}`);
});

plugin.on("sync:complete", (stats) => {
  console.log(`Synced: ${stats.imported} imported, ${stats.updated} updated`);
});
```

## Commands

The plugin provides these commands:

```typescript
// Import directory
shell.execute("directory-sync:import", {
  path: "/path/to/directory",
});

// Export entities
shell.execute("directory-sync:export", {
  type: "note",
  path: "/export/directory",
});

// Check sync status
shell.execute("directory-sync:status");
```

## Performance

- Uses file watching for efficient monitoring
- Batches database operations
- Caches file metadata
- Incremental sync based on modification times

## Testing

```typescript
import { DirectorySyncPlugin } from "@brains/directory-sync";
import { createTestDirectory } from "@brains/directory-sync/test";

const testDir = await createTestDirectory({
  "note1.md": "# Note 1",
  "note2.md": "# Note 2",
});

const plugin = new DirectorySyncPlugin({
  directories: [{ path: testDir }],
});

await plugin.importDirectory(testDir);
```

## Exports

- `DirectorySyncPlugin` - Main plugin class
- `FileWatcher` - File monitoring utility
- `MetadataExtractor` - Frontmatter parser
- Types and configuration schemas

## License

MIT