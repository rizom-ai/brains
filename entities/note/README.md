# @brains/note

Personal knowledge capture with markdown-first workflow.

## Features

- **Quick Capture**: Fast note creation from thoughts and ideas
- **Markdown Storage**: Notes stored as plain markdown files
- **AI Enhancement**: Optional AI-powered note refinement
- **Tagging**: Organize notes with tags
- **Search**: Full-text search across notes

## Titles

Adapter titles prefer nonblank frontmatter titles, then body H1 headings, then the first nonblank body line without heading markers. First-line fallbacks are capped at 80 Unicode code points including `…`, preferring a whitespace-delimited word boundary; a single overlong token is cut without splitting surrogate pairs. Authored titles and H1 headings are not capped. Empty notes remain `Untitled`. Metadata extraction also resolves stored blank/`Untitled` placeholders without mutating the entity or its source. Meaningful stored titles and explicit frontmatter titles, including literal `Untitled`, are preserved.

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
