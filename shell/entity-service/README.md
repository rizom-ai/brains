# @brains/entity-service

Entity persistence, markdown serialization, embeddings, and search for Brain applications.

## Overview

`@brains/entity-service` provides a typed entity registry plus CRUD operations backed by SQLite/libSQL. Entities are stored as markdown with frontmatter-derived metadata, while embeddings are generated asynchronously and stored in a separate embedding database.

## Features

- Typed entity registration with Zod schemas and markdown adapters
- Entity CRUD with immediate persistence
- Async embedding job enqueueing through `@brains/job-queue`
- Vector + FTS5 keyword search
- Metadata filtering, published filtering, pagination, and multi-field sorting
- Markdown/frontmatter serialization helpers
- Optional structural event bus for entity lifecycle notifications
- Separate entity and embedding databases

## Basic usage

```typescript
import { EntityRegistry, EntityService } from "@brains/entity-service";
import { Logger } from "@brains/utils";

const logger = Logger.getInstance();
const registry = EntityRegistry.createFresh(logger);

registry.registerEntityType("note", noteSchema, noteAdapter, {
  weight: 1.2,
  embeddable: true,
});

const entityService = EntityService.createFresh({
  embeddingService,
  entityRegistry: registry,
  logger,
  jobQueueService,
  dbConfig: { url: "file:./entities.db" },
  embeddingDbConfig: { url: "file:./embeddings.db" },
  // Optional. Structural contract; does not require importing a concrete message bus here.
  messageBus: eventBus,
});

await entityService.initialize();

const { entityId, jobId } = await entityService.createEntity({
  entityType: "note",
  content: "---\ntitle: My Note\n---\n\nNote content...",
  metadata: { title: "My Note", tags: ["important"] },
});

const note = await entityService.getEntity("note", entityId);

const results = await entityService.search("important notes about AI", {
  types: ["note"],
  limit: 10,
});

if (note) {
  await entityService.updateEntity({
    ...note,
    content: "Updated content",
  });
}

await entityService.deleteEntity("note", entityId);
```

## Entity model

All entities extend `BaseEntity`:

```typescript
interface BaseEntity<TMetadata = Record<string, unknown>> {
  id: string;
  entityType: string;
  content: string;
  created: string; // ISO datetime
  updated: string; // ISO datetime
  metadata: TMetadata;
  contentHash: string;
}
```

Creation inputs omit system-managed fields such as `id`, timestamps, and `contentHash`; the service fills them in and computes hashes from serialized markdown.

## Entity registry

```typescript
import { EntityRegistry } from "@brains/entity-service";
import { Logger } from "@brains/utils";

const registry = EntityRegistry.createFresh(Logger.getInstance());

registry.registerEntityType("task", taskSchema, taskAdapter, {
  weight: 0.8,
  embeddable: true,
});

const types = registry.getAllEntityTypes();
const task = registry.validateEntity("task", taskData);
const adapter = registry.getAdapter("task");
```

## Entity adapters

Adapters define how an entity type is serialized to markdown and parsed back from markdown.

```typescript
interface EntityAdapter<
  TEntity extends BaseEntity,
  TMetadata = Record<string, unknown>,
> {
  entityType: string;
  schema: z.ZodSchema<TEntity>;
  toMarkdown(entity: TEntity): string;
  fromMarkdown(markdown: string): Partial<TEntity>;
  extractMetadata(entity: TEntity): TMetadata;
  parseFrontMatter<TFrontmatter>(
    markdown: string,
    schema: z.ZodSchema<TFrontmatter>,
  ): TFrontmatter;
  generateFrontMatter(entity: TEntity): string;
  getBodyTemplate(): string;
}
```

Use `BaseEntityAdapter` for common frontmatter/body behavior.

## Search

```typescript
const results = await entityService.search("machine learning concepts", {
  types: ["note", "article"],
  excludeTypes: ["image"],
  limit: 20,
  offset: 0,
  weight: { article: 1.5, note: 1.0 },
});
```

Search combines vector similarity with an FTS5 keyword boost. Entity type weights are applied inside the SQL score expression.

## Event bus contract

Entity lifecycle events are optional. To avoid coupling this package to a concrete messaging implementation, pass any object that satisfies `EntityEventBus`:

```typescript
interface EntityEventBus {
  send(
    type: string,
    payload: Record<string, unknown>,
    sender: string,
    target?: string,
    metadata?: Record<string, unknown>,
    broadcast?: boolean,
  ): Promise<unknown>;
}
```

Emitted events include:

- `entity:created`
- `entity:updated`
- `entity:deleted`
- `entity:embedding:ready`

## Database schema

### Entities database

```sql
CREATE TABLE entities (
  id TEXT NOT NULL,
  entityType TEXT NOT NULL,
  content TEXT NOT NULL,
  contentHash TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  created INTEGER NOT NULL,
  updated INTEGER NOT NULL,
  PRIMARY KEY (id, entityType)
);
```

The service also ensures an `entity_fts` FTS5 table for keyword search.

### Embedding database

```sql
CREATE TABLE embeddings (
  entity_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  embedding F32_BLOB(<provider dimensions>) NOT NULL,
  content_hash TEXT NOT NULL,
  PRIMARY KEY (entity_id, entity_type)
);
```

The embedding database is attached to the entity database as `emb` for search queries.

## Frontmatter utilities

```typescript
import {
  generateMarkdownWithFrontmatter,
  parseMarkdownWithFrontmatter,
} from "@brains/entity-service";

const parsed = parseMarkdownWithFrontmatter(markdown, frontmatterSchema);
const markdown = generateMarkdownWithFrontmatter("Body", {
  title: "Example",
});
```

## Validation

From this package directory:

```bash
bun run lint
bun run typecheck
bun test
```

## Key exports

- `EntityService`
- `EntityRegistry`
- `BaseEntityAdapter`
- `FallbackEntityAdapter`
- `EmbeddingJobHandler`
- `SingletonEntityService`
- `BaseEntity`, `EntityAdapter`, `SearchOptions`, `ListOptions`, `EntityEventBus`
- `parseMarkdownWithFrontmatter`, `generateMarkdownWithFrontmatter`, `generateFrontmatter`
- Entity and embedding database helpers

## License

Apache-2.0
