# @brains/note

Personal knowledge capture with markdown-first workflow.

## Features

- **Quick Capture**: Fast note creation from thoughts and ideas
- **Markdown Storage**: Notes stored as plain markdown files
- **AI Enhancement**: Optional AI-powered note refinement
- **Tagging**: Organize notes with tags
- **Search**: Full-text search across notes

## Usage

```typescript
import { notePlugin } from "@brains/note";

const config = defineConfig({
  plugins: [notePlugin()],
});
```

## Tools

- `note:create` - Create a new note
- `note:update` - Update existing note
- `note:list` - List all notes

## Schema

Notes are stored as entities with minimal metadata:

```yaml
---
title: Note Title
tags:
  - idea
  - project
---
Note content in markdown...
```
