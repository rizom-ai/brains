# Markdown Serialization Plan

## Overview

This document outlines the approach for using Markdown as the primary serialization format in the Personal Brain system while maintaining structured data in the database for efficient querying and vector search.

## Core Principles

1. **Markdown as Source of Truth**: All entity data is serialized to/from Markdown format
2. **Database as Index**: SQLite stores extracted fields for querying and search
3. **Automatic Synchronization**: Database fields are automatically extracted from Markdown on save
4. **Vector Embeddings**: Generated automatically for semantic search capabilities

## Architecture

### Data Flow

```
Entity Object → Markdown → Database Storage
     ↑                           ↓
     └─────── Deserialization ←──┘
```

### Storage Strategy

1. **Primary Storage**:

   - Full Markdown representation stored in `content` column
   - Includes YAML frontmatter and body content

2. **Indexed Fields** (extracted from Markdown):
   - `id`: Unique identifier
   - `entityType`: Type discriminator
   - `title`: Extracted from frontmatter or first heading if no frontmatter title
   - `tags`: JSON array extracted from frontmatter (optional, used by some entity types like blog posts)
   - `contentWeight`: Numeric value (0.0-1.0) indicating human vs generated content ratio
   - `created`/`updated`: Timestamps
   - `embedding`: Vector representation of content
   - `embeddingStatus`: Status of embedding generation ('pending' | 'processing' | 'ready' | 'failed')

## Implementation Details

### Markdown Format

```markdown
---
id: abc123
entityType: note
title: Example Note
created: 2024-05-23T10:00:00Z
updated: 2024-05-23T10:00:00Z
tags: [example, documentation]
contentWeight: 0.8
customField: value
---

# Example Note

This is the content of the note...
```

### Serialization Rules

1. **Structured Data**: ALL structured data goes in YAML frontmatter
2. **Content**: Markdown body reserved for free-form content only
3. **Complex Types**: Nested YAML supported but with practical limits:
   - Maximum 50 lines of frontmatter
   - Maximum 3 levels of nesting
   - Beyond limits: consider splitting into multiple entities

### Entity Type Examples

#### Note Entity

```markdown
---
id: note_123
entityType: note
title: Meeting Notes
tags: [meeting, project-x]
attendees: [Alice, Bob]
---

# Meeting Notes

Discussed project timeline...
```

#### Profile Entity

```markdown
---
id: profile_123
entityType: profile
title: John Doe Profile
preferences:
  theme: dark
  language: en
  notifications: true
linkedAccounts:
  github: johndoe
  twitter: jdoe
---

Professional software developer interested in...
```

### Database Schema

```typescript
export const entities = sqliteTable("entities", {
  id: text("id").primaryKey(),
  entityType: text("entityType").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(), // Full markdown with frontmatter
  contentWeight: real("contentWeight").notNull().default(1.0), // 0.0-1.0, human vs generated ratio
  tags: text("tags", { mode: "json" })
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'`),
  embedding: vector("embedding"), // F32_BLOB(1536) for semantic search
  embeddingStatus: text("embeddingStatus")
    .$type<"pending" | "processing" | "ready" | "failed">()
    .default("pending"),
  created: integer("created").notNull(),
  updated: integer("updated").notNull(),
});
```

### Entity Service Flow

#### Create/Update Entity

1. Receive entity object with `toMarkdown()` method
2. Serialize to Markdown using `toMarkdown()`
3. Parse Markdown to extract indexed fields:
   - Parse YAML frontmatter
   - Extract title (frontmatter > first heading > default)
   - Extract tags, contentWeight
   - Convert timestamps to Unix milliseconds
4. Store in database with full Markdown and extracted fields
5. Queue embedding generation (async)

#### Retrieve Entity

1. Query database by indexed fields
2. Get full Markdown content
3. Use entity adapter's `fromMarkdown()` to reconstruct entity object
4. Add `toMarkdown()` method to restored entity
5. Return fully functional entity instance

## Embedding Generation Strategy

### Overview

Embeddings are generated asynchronously within the shell service to maintain responsive entity creation while ensuring all entities are searchable.

### Implementation

```typescript
// Entity creation is non-blocking
async createEntity(entity: T): Promise<T> {
  // Store immediately with null embedding
  const result = await this.db.insert(entities).values({
    ...extractedFields,
    content: markdown,
    embedding: null,
    embeddingStatus: 'pending'
  });

  // Queue for embedding generation
  await this.embeddingQueue.add({
    entityId: result.id,
    content: markdown
  });

  return entity;
}

// Background processing
async processEmbeddingQueue() {
  const pending = await this.getPendingEmbeddings();
  for (const job of pending) {
    const embedding = await this.embeddingService.generate(job.content);
    await this.updateEmbedding(job.entityId, embedding);
  }
}
```

### Embedding Service Design

- **Pluggable Providers**: Support OpenAI, Anthropic, local models
- **Automatic Retry**: Handle API failures gracefully
- **Batch Processing**: Generate multiple embeddings efficiently
- **Status Tracking**: 'pending' | 'processing' | 'ready' | 'failed'

### Search Behavior

- Only search entities with `embeddingStatus: 'ready'`
- Fallback to keyword search for pending entities
- Transparent to API consumers

### Future Local Model Support

When needed for offline/constrained environments:

- all-MiniLM-L6-v2: 23MB, ~300ms on Pi 5
- Trade-off: Lower quality but no network dependency
- Configuration option: `embedding.mode: 'local' | 'api'`

## Migration Path

### Phase 1: Schema Update ✓

- Modify schema to store full Markdown in `content` column
- Add embedding and status columns

### Phase 2: Entity Service Refactor (Current)

- Update create/update to serialize via Markdown
- Implement markdown parsing and field extraction
- Add embedding queue infrastructure

### Phase 3: Embedding Integration

- Implement embedding service interface
- Add background worker for processing
- Configure provider (start with OpenAI)

### Phase 4: Testing & Validation

- Round-trip serialization tests
- Embedding generation tests
- Search functionality tests
- Performance benchmarks

## Benefits

1. **Flexibility**: Easy to add new fields without schema changes
2. **Portability**: Markdown files can be exported/imported easily
3. **Human Readable**: Database content is understandable without special tools
4. **Version Control Friendly**: Markdown diffs are meaningful
5. **Extensibility**: Plugins can define custom frontmatter fields
6. **Offline Capable**: With local embeddings option

## Considerations

### Performance

- Parsing overhead on read (mitigate with caching if needed)
- Async embedding generation keeps creation fast
- Index extraction overhead on write (minimal impact)

### Consistency

- Frontmatter validation prevents malformed data
- Entity registry enforces consistent serialization
- Embedding status ensures search completeness

### Search Capabilities

- Full-text search on markdown content
- Structured queries on extracted fields
- Semantic search via embeddings
- Hybrid search combining all approaches

## Extension Examples

### Future Entity Types

Each entity type defines its own frontmatter schema while following common patterns:

```typescript
// Task entity
interface TaskEntity extends BaseEntity {
  entityType: 'task';
  status: 'todo' | 'in-progress' | 'done';
  dueDate?: string;
  assignee?: string;
}

// Serializes to:
---
id: task_123
entityType: task
title: Implement embedding service
status: in-progress
dueDate: 2024-06-01
assignee: john
tags: [backend, embeddings]
---

Design and implement the embedding service...
```

### Plugin Integration

Plugins can register custom entity types with their own:

- Frontmatter schema (Zod)
- Markdown serialization rules
- Field extraction logic
- Display formatting

## Version Control & Git Sync

### Overview

Instead of database-level versioning, the Personal Brain leverages Git for version control:

1. **Export to Git**: Entities can be exported as individual markdown files
2. **File Structure**: Organized by entity type (e.g., `/notes/`, `/profiles/`)
3. **Sync Command**: Built-in command to sync database ↔ Git repository
4. **History**: Full version history through standard Git tools

### Benefits

- **Standard tooling**: Use any Git client or command line
- **Branching**: Experiment with content changes safely
- **Collaboration**: Share specific entities or entire brain
- **Backup**: Automatic versioning and remote backup
- **Diff-friendly**: Markdown format shows meaningful changes

### Implementation Approach

```typescript
// Example sync command
brain sync --repo ./my-brain-backup
brain sync --pull  # Import changes from Git
brain sync --push  # Export changes to Git
```

### File Naming Convention

```
/my-brain-repo/
  /notes/
    note_abc123_meeting-notes.md
    note_def456_project-ideas.md
  /profiles/
    profile_main_user-profile.md
  /tasks/
    task_ghi789_implement-feature.md
```

Files named as: `{entityType}_{id}_{slugified-title}.md`

This approach eliminates the need for complex database versioning while providing superior version control capabilities through Git's proven ecosystem.

## Summary

This approach provides a robust foundation for the Personal Brain system that:

- Uses Markdown as the canonical data format
- Maintains query performance through indexed fields
- Enables semantic search through embeddings
- Stays extensible for future entity types
- Keeps complexity contained within the shell service
- Leverages Git for version control instead of database versioning
