# @brains/entity-service

Entity management service with vector search capabilities for Personal Brain applications.

## Overview

The entity service provides unified CRUD operations, vector search, and markdown serialization for all entity types in Brain applications. It includes built-in support for embeddings and similarity search.

## Features

- Unified entity CRUD operations
- Vector embeddings with 384 dimensions
- Similarity search across entities
- Tag-based filtering and search
- Markdown storage with frontmatter
- Entity type registry
- Batch operations support
- SQLite with vector extension

## Installation

```bash
bun add @brains/entity-service
```

## Usage

```typescript
import { EntityService, EntityRegistry } from "@brains/entity-service";

// Initialize service
const entityService = EntityService.getInstance({
  database: db,
  embeddingService: embeddings,
  messageBus: bus,
});

// Register an entity type
entityRegistry.registerType("note", noteSchema, noteAdapter);

// Create entity
const note = await entityService.create({
  type: "note",
  title: "My Note",
  content: "Note content...",
  tags: ["important"],
});

// Search entities
const results = await entityService.search({
  query: "important notes about AI",
  types: ["note"],
  limit: 10,
});

// Update entity
await entityService.update(note.id, {
  content: "Updated content",
});

// Delete entity
await entityService.delete(note.id);
```

## Entity Schema

All entities extend the base entity schema:

```typescript
interface BaseEntity {
  id: string; // Unique identifier
  type: string; // Entity type
  content: string; // Main content
  created: Date; // Creation timestamp
  updated: Date; // Last update timestamp
  tags: string[]; // Associated tags
  metadata?: unknown; // Type-specific metadata
}
```

## Entity Registry

Register custom entity types with their schemas and adapters:

```typescript
import { EntityRegistry } from "@brains/entity-service";

const registry = EntityRegistry.getInstance();

// Register a new entity type
registry.registerType(
  "task",
  taskSchema, // Zod schema
  taskAdapter, // Markdown adapter
);

// Get registered types
const types = registry.getEntityTypes(); // ["note", "task", ...]

// Validate entity
const isValid = registry.validateEntity("task", taskData);
```

## Entity Adapters

Adapters handle markdown serialization for each entity type:

```typescript
interface EntityAdapter<T extends BaseEntity> {
  toMarkdown(entity: T): string;
  fromMarkdown(markdown: string, type: string): T;
  getTitle(entity: T): string;
}
```

## Vector Search

Built-in similarity search using embeddings:

```typescript
// Search by semantic similarity
const similar = await entityService.search({
  query: "machine learning concepts",
  types: ["note", "article"],
  limit: 20,
  threshold: 0.7, // Similarity threshold
});

// Find related entities
const related = await entityService.findRelated(entityId, { limit: 10 });
```

## Database Schema

### Entities Table

```sql
CREATE TABLE entities (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  created INTEGER NOT NULL,
  updated INTEGER NOT NULL,
  metadata TEXT
);
```

### Vectors Table

```sql
CREATE VIRTUAL TABLE vectors USING vec0(
  entity_id TEXT PRIMARY KEY,
  embedding FLOAT[384]
);
```

### Tags Table

```sql
CREATE TABLE entity_tags (
  entity_id TEXT,
  tag TEXT,
  PRIMARY KEY (entity_id, tag)
);
```

## Frontmatter Utilities

Parse and serialize YAML frontmatter:

```typescript
import { parseFrontmatter, serializeFrontmatter } from "@brains/entity-service";

// Parse markdown with frontmatter
const { attributes, body } = parseFrontmatter(markdown);

// Serialize to markdown
const markdown = serializeFrontmatter(attributes, body);
```

## Background Jobs

Automatic embedding generation via job queue:

- Embeddings are generated asynchronously
- Failed embeddings are retried
- Progress tracked through job queue

## Configuration

```typescript
interface EntityServiceConfig {
  database: Database;
  embeddingService: EmbeddingService;
  messageBus: MessageBus;
  jobQueue?: JobQueueService;
}
```

## Testing

```typescript
import { createTestEntityDb } from "@brains/entity-service/test";

// Create test database
const db = await createTestEntityDb();

// Use in tests
const service = EntityService.createFresh({
  database: db,
  // ... other services
});
```

## Exports

- `EntityService` - Main service class
- `EntityRegistry` - Type registry
- `BaseEntityAdapter` - Base adapter class
- `entitySchema` - Base entity Zod schema
- `parseFrontmatter`, `serializeFrontmatter` - Frontmatter utilities
- Database utilities and schemas

## License

MIT
