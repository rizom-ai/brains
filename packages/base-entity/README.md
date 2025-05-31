# @brains/base-entity

Core entity support for the Personal Brain application. This package provides the base entity adapter and formatter that is automatically registered by the Shell during initialization.

## Overview

The base-entity package is **not a plugin** - it's a core package that provides:

- `BaseEntityAdapter`: Handles serialization/deserialization of generic entities to/from markdown
- `BaseEntityFormatter`: Formats base entities for display
- Base entity schema definitions

## Usage

This package is automatically used by the Shell. You don't need to explicitly register it.

### When Base Entity is Used

The base entity type (`"base"`) is used as a fallback for:

- Files in the root directory during git sync
- Generic entities that don't have a specific type
- Testing and development

### Entity Structure

Base entities follow this structure:

```typescript
interface BaseEntity {
  id: string;
  entityType: string;
  title: string;
  content: string;
  created: string; // ISO datetime
  updated: string; // ISO datetime
  tags: string[];
}
```

### Markdown Format

Base entities are stored as markdown with YAML frontmatter:

```markdown
---
id: "abc123"
entityType: "base"
title: "My Note"
created: "2024-01-01T00:00:00Z"
updated: "2024-01-01T00:00:00Z"
tags:
  - example
  - note
---

# My Note

This is the content of the note.
```

## For Plugin Developers

If you're creating a context plugin that adds new entity types:

1. Create your own entity adapter by implementing the `EntityAdapter` interface
2. Register it with the entity registry in your plugin's `register` method
3. Your adapter should handle the specific fields for your entity type

Example:

```typescript
import type { EntityAdapter } from "@brains/types";

class NoteAdapter implements EntityAdapter<Note> {
  entityType = "note";
  schema = noteSchema;

  toMarkdown(entity: Note): string {
    // Convert note to markdown
  }

  fromMarkdown(markdown: string): Partial<Note> {
    // Parse note from markdown
  }
}
```

## Development

```bash
# Install dependencies
bun install

# Run tests
bun test

# Type check
bun run typecheck

# Lint
bun run lint
```
