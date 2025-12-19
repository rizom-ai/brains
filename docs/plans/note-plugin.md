# Note Plugin Implementation Plan

## Summary

Create a minimal Note plugin for personal knowledge capture and research/reference. Notes stored in `note/<id>.md` with optional frontmatter. Designed for **Obsidian-first workflow** where brain-data/ is the Obsidian vault.

## Key Insight

Since brain-data/ IS the Obsidian vault, **directory-sync already handles bidirectional file sync**. The Note plugin's job is to:

1. Register the `note` entity type so notes aren't treated as `base`
2. Parse frontmatter when present, gracefully handle when absent
3. Provide `note_create` tool for agent-created notes

## Design Decisions

| Decision                | Choice                                                     |
| ----------------------- | ---------------------------------------------------------- |
| Relationship to base    | Keep both - base as fallback, note as primary content type |
| Storage location        | `brain-data/note/<id>.md`                                  |
| Frontmatter fields      | `title` (optional) - no tags (Topics plugin handles this)  |
| No frontmatter handling | Use H1 or filename as title                                |
| AI generation           | Yes - `note_generate` tool with async job handler          |
| Status field            | Deferred (keep minimal)                                    |
| Site templates          | Deferred (notes are personal, blog posts are public)       |

## File Structure

```
plugins/note/
  package.json
  tsconfig.json
  src/
    index.ts              # Exports: notePlugin(), NotePlugin, schemas
    plugin.ts             # NotePlugin extends ServicePlugin
    config.ts             # noteConfigSchema
    schemas/
      note.ts             # noteFrontmatterSchema, noteMetadataSchema, noteSchema
    adapters/
      note-adapter.ts     # EntityAdapter<Note, NoteMetadata>
    tools/
      index.ts            # createNoteTools()
      create.ts           # note_create tool
      generate.ts         # note_generate tool (queues job)
    handlers/
      note-generation-handler.ts  # JobHandler for AI generation
```

## Schemas

```typescript
// Frontmatter (optional in markdown)
noteFrontmatterSchema = z.object({
  title: z.string().optional(), // Optional - falls back to H1 or filename
});

// Metadata (in DB for fast queries)
noteMetadataSchema = z.object({
  title: z.string(), // Required - derived from frontmatter, H1, or filename
});

// Entity
noteSchema = baseEntitySchema.extend({
  entityType: z.literal("note"),
  metadata: noteMetadataSchema,
});
```

## Adapter Behavior

**With frontmatter:**

```markdown
---
title: My Note
---

Content here...
```

→ metadata: `{ title: "My Note" }`

**Without frontmatter (Obsidian-created):**

```markdown
# My Note Title

Content here...
```

→ metadata: `{ title: "My Note Title" }` (extracts H1 or uses filename)

## Tools

### `note_create` - Quick capture

```typescript
note_create({
  title: string, // Required
  content: string, // Markdown body
});
```

Creates note entity with frontmatter, syncs to file system via directory-sync.

### `note_generate` - AI-powered generation

```typescript
note_generate({
  prompt: string,     // What to generate (topic, rough ideas, etc.)
  title?: string,     // Optional - AI generates if not provided
})
```

Uses AI to generate note content based on prompt. Runs async via job queue (like `blog_generate`).

**Use cases:**

- "Create a note summarizing key concepts of X"
- "Expand these rough ideas into a proper note: ..."
- "Research Y and create a structured note"

## Example Note File

`brain-data/note/my-first-note.md`:

```markdown
---
title: My First Note
---

Content here...
```

## Implementation Steps

1. **Create package structure** - package.json, tsconfig.json
2. **Implement schemas** - `src/schemas/note.ts`
3. **Implement adapter** - `src/adapters/note-adapter.ts`
4. **Implement `note_create` tool** - `src/tools/create.ts`
5. **Implement `note_generate` tool** - `src/tools/generate.ts`
6. **Implement job handler** - `src/handlers/note-generation-handler.ts`
7. **Implement plugin** - `src/plugin.ts`, `src/index.ts`
8. **Write tests** - adapter roundtrip, tool validation, job handler
9. **Integration test** - register in app, verify directory sync

## Reference Files

- `plugins/blog/src/schemas/blog-post.ts` - Schema pattern
- `plugins/blog/src/adapters/blog-post-adapter.ts` - Adapter pattern
- `plugins/blog/src/handlers/blogGenerationJobHandler.ts` - Job handler pattern
- `plugins/blog/src/tools/generate.ts` - AI generation tool pattern
- `plugins/link/src/tools/index.ts` - Tool registration pattern
- `shell/entity-service/src/frontmatter.ts` - Frontmatter utilities

## Final Step: Update directory-sync

After the plugin is complete, update `directory-sync` to make `note` the default for markdown files:

- If directory doesn't match a registered type AND file is `.md` → `note`
- Otherwise → `base`

This means:

- `brain-data/post/*.md` → `post` (registered type)
- `brain-data/note/*.md` → `note` (registered type)
- `brain-data/random/*.md` → `note` (default for markdown)
- `brain-data/random/*.bin` → `base` (truly unknown)

## Deferred to Later

- Site templates (note-list, note-detail pages)
- DataSource for site-builder
- Status field (draft/published)
- Backlinks/note linking
- Bulk import tool

## Notes

- Tags are handled by the Topics plugin (auto-extraction from content)
- Notes are personal/private; blog posts are for public content
- `note` becomes the default entity type for markdown files (replaces `base` for `.md`)
