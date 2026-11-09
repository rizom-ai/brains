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

The package default-exports a declarative entity package. The canonical brain composes it under the plugin id `note`, so its template and jobs keep the `note:` names:

```typescript
import notePackage from "@brains/note";
```

## Tools

None of its own. Notes are written with `system_create`, generated with `system_generate` through `note:generation`, and imported from an upload through `note:upload-import`.

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
