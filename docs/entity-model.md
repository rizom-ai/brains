# Extensible Entity Model

The entity model is a core part of the Personal Brain architecture. It provides a unified, functional approach to data modeling using **Zod schemas + TypeScript interfaces** with factory functions for entity creation.

## Core Design Principles

### Functional Approach for Entities

- **Zod schemas** for validation and type inference
- **TypeScript interfaces** for type definitions
- **Factory functions** for entity creation (no classes for entities)
- **Adapter classes** for serialization (classes are used for adapters)

### Hybrid Storage Model

- Database stores core metadata in columns: `id`, `entityType`, `title`, `created`, `updated`, `tags`
- Entity-specific content stored as markdown in `content` column
- Adapters handle bidirectional conversion between entities and markdown
- Embeddings stored separately in vector column
- Single source of truth: database columns for core metadata, markdown for entity-specific fields

## Core Concepts

### Base Entity Schema

All entities share common properties and validation:

```typescript
// Base entity schema with required fields
export const baseEntitySchema = z.object({
  id: z.string().min(1), // nanoid(12) generated
  entityType: z.string(), // Type discriminator
  title: z.string(), // Display title
  content: z.string(), // Main content
  created: z.string().datetime(), // ISO timestamp
  updated: z.string().datetime(), // ISO timestamp
  tags: z.array(z.string()).default([]), // Tags array
});

export type BaseEntity = z.infer<typeof baseEntitySchema>;
```

### Current Implementation Status

The shell package already includes:

- **EntityRegistry**: Manages entity types and adapters
- **EntityService**: Provides CRUD operations and search
- **EntityAdapter interface**: Currently expects `fromMarkdown` only
- **IContentModel interface**: Currently expects entities to have `toMarkdown()`
- **Database schema**: Tables for entities and embeddings

### Where Entities Are Defined

Entities are **NOT** defined in the shell package. Instead:

1. **Shell provides base infrastructure**:
   - Base entity schema and types
   - EntityRegistry for registration
   - EntityService for CRUD operations
   - EntityAdapter interface

2. **Plugins define their entities**:
   - Link Plugin → LinkEntity (web content capture)
   - Summary Plugin → SummaryEntity (AI-generated summaries)
   - Topics Plugin → TopicEntity (extracted topics)

Each plugin is responsible for:

- Defining its entity schema
- Creating factory functions
- Implementing entity adapters
- Registering with the shell's EntityRegistry

### Entity Creation in Plugins

Each plugin defines its own entities:

```typescript
// plugins/link/src/entities/link-entity.ts
import { z } from "zod";
import { nanoid } from "nanoid";
import { baseEntitySchema } from "@brains/plugins";

// 1. Define entity-specific schema
export const linkEntitySchema = baseEntitySchema.extend({
  entityType: z.literal("link"),
  url: z.string().url(),
  description: z.string().optional(),
  summary: z.string().optional(),
  author: z.string().optional(),
  publishDate: z.string().optional(),
  images: z.array(z.string()).default([]),
  metadata: z.record(z.unknown()).default({}),
});

// 2. Infer the type (pure data, no methods)
export type LinkEntity = z.infer<typeof linkEntitySchema>;

// 3. Create factory function
export function createLinkEntity(
  input: Omit<
    z.input<typeof linkEntitySchema>,
    "id" | "created" | "updated" | "entityType"
  > & {
    id?: string;
  },
): LinkEntity {
  const now = new Date().toISOString();
  return linkEntitySchema.parse({
    id: input.id ?? nanoid(12),
    created: now,
    updated: now,
    entityType: "link",
    ...input,
  });
}
```

**Important**: Entities are pure data objects. All serialization logic belongs in the adapter.

## Entity Adapter Pattern

Each entity type requires an adapter for markdown serialization. Adapters work with the hybrid storage model:

### Adapter Responsibilities

1. **toMarkdown**: Converts entity to markdown (may include frontmatter for entity-specific fields)
2. **fromMarkdown**: Extracts entity-specific fields from markdown content
3. **Core fields** (`id`, `entityType`, `title`, `created`, `updated`, `tags`) come from database
4. **Entity-specific fields** come from markdown/frontmatter

```typescript
export interface EntityAdapter<T extends BaseEntity> {
  entityType: string;
  schema: z.ZodSchema<T>;

  // Convert entity to markdown representation
  toMarkdown(entity: T): string;

  // Extract entity-specific fields from markdown
  // Note: This returns Partial<T> - core fields will be merged from database
  fromMarkdown(markdown: string): Partial<T>;

  // Optional: Metadata handling for frontmatter
  extractMetadata?(entity: T): Record<string, unknown>;
  parseFrontMatter?(markdown: string): Record<string, unknown>;
  generateFrontMatter?(entity: T): string;
}

// Example implementation for LinkEntity (content-heavy entity)
class LinkAdapter implements EntityAdapter<LinkEntity> {
  entityType = "link";
  schema = linkEntitySchema;

  toMarkdown(entity: LinkEntity): string {
    // Store URL and metadata in frontmatter
    const frontmatter = matter.stringify("", {
      url: entity.url,
      description: entity.description,
      summary: entity.summary,
      author: entity.author,
      publishDate: entity.publishDate,
      images: entity.images,
      metadata: entity.metadata,
    });

    // Main content is the body
    return `${frontmatter}${entity.content}`;
  }

  fromMarkdown(markdown: string): Partial<LinkEntity> {
    const { data, content } = matter(markdown);

    // Return only entity-specific fields
    // Core fields (id, title, created, etc.) will come from database
    return {
      content: content.trim(),
      url: data.url as string,
      description: data.description as string | undefined,
      summary: data.summary as string | undefined,
      author: data.author as string | undefined,
      publishDate: data.publishDate as string | undefined,
      images: (data.images as string[]) || [],
      metadata: (data.metadata as Record<string, unknown>) || {},
    };
  }

  generateFrontMatter(entity: LinkEntity): string {
    const metadata: Record<string, unknown> = {
      url: entity.url,
    };
    if (entity.description) metadata.description = entity.description;
    if (entity.summary) metadata.summary = entity.summary;
    if (entity.author) metadata.author = entity.author;
    if (entity.publishDate) metadata.publishDate = entity.publishDate;
    if (entity.images?.length) metadata.images = entity.images;
    if (entity.metadata && Object.keys(entity.metadata).length > 0) {
      metadata.metadata = entity.metadata;
    }

    return matter.stringify("", metadata);
  }
}

// Example implementation for SummaryEntity (metadata-heavy entity)
class SummaryAdapter implements EntityAdapter<SummaryEntity> {
  entityType = "summary";
  schema = summaryEntitySchema;

  toMarkdown(entity: SummaryEntity): string {
    // Most data in frontmatter for summaries
    const frontmatter = matter.stringify("", {
      summaryType: entity.summaryType,
      conversationId: entity.conversationId,
      entityIds: entity.entityIds,
      messageCount: entity.messageCount,
      dateRange: entity.dateRange,
      metadata: entity.metadata,
    });

    // Content is the summary text
    return `${frontmatter}${entity.content}`;
  }

  fromMarkdown(markdown: string): Partial<SummaryEntity> {
    const { data, content } = matter(markdown);

    return {
      content: content.trim(),
      summaryType: data.summaryType as
        | "daily"
        | "weekly"
        | "monthly"
        | "custom",
      conversationId: data.conversationId as string,
      entityIds: (data.entityIds as string[]) || [],
      messageCount: (data.messageCount as number) || 0,
      dateRange: data.dateRange as { start: string; end: string },
      metadata: (data.metadata as Record<string, unknown>) || {},
    };
  }

  extractMetadata(entity: SummaryEntity): Record<string, unknown> {
    return {
      id: entity.id,
      title: entity.title,
      tags: entity.tags,
      summaryType: entity.summaryType,
      conversationId: entity.conversationId,
      entityIds: entity.entityIds,
      messageCount: entity.messageCount,
      dateRange: entity.dateRange,
      created: entity.created,
      updated: entity.updated,
      entityType: entity.entityType,
    };
  }

  generateFrontMatter(entity: SummaryEntity): string {
    const metadata = this.extractMetadata(entity);
    return matter.stringify("", metadata);
  }

  parseFrontMatter(markdown: string): Record<string, unknown> {
    const { data } = matter(markdown);
    return data;
  }
}
```

## Entity Registry

The registry manages entity types and their schemas:

```typescript
export class EntityRegistry {
  // Register entity type with schema and adapter
  registerEntityType<T extends BaseEntity & IContentModel>(
    type: string,
    schema: z.ZodType<T>,
    adapter: EntityAdapter<T>,
  ): void;

  // Validate entity against registered schema
  validateEntity<T extends BaseEntity & IContentModel>(
    type: string,
    entity: unknown,
  ): T;

  // Convert entity to markdown using registered adapter
  entityToMarkdown<T extends BaseEntity & IContentModel>(entity: T): string;

  // Convert markdown to entity using registered adapter
  markdownToEntity<T extends BaseEntity & IContentModel>(
    type: string,
    markdown: string,
  ): T;
}
```

## Common Entity Types

### LinkEntity

Web content capture with AI extraction:

```typescript
const linkEntitySchema = baseEntitySchema.extend({
  entityType: z.literal("link"),
  url: z.string().url(),
  description: z.string().optional(),
  summary: z.string().optional(),
  author: z.string().optional(),
  publishDate: z.string().optional(),
  images: z.array(z.string()).default([]),
  metadata: z.record(z.unknown()).default({}),
});

type LinkEntity = z.infer<typeof linkEntitySchema>;
```

### SummaryEntity

AI-generated summaries and daily digests:

```typescript
const summaryEntitySchema = baseEntitySchema.extend({
  entityType: z.literal("summary"),
  summaryType: z.enum(["daily", "weekly", "monthly", "custom"]),
  conversationId: z.string(),
  entityIds: z.array(z.string()).default([]),
  messageCount: z.number().default(0),
  dateRange: z.object({
    start: z.string().datetime(),
    end: z.string().datetime(),
  }),
  metadata: z.record(z.unknown()).default({}),
});

type SummaryEntity = z.infer<typeof summaryEntitySchema>;
```

### TopicEntity

Extracted topics from conversations:

```typescript
const topicEntitySchema = baseEntitySchema.extend({
  entityType: z.literal("topic"),
  conversationId: z.string(),
  importance: z.enum(["low", "medium", "high"]),
  relatedEntities: z.array(z.string()).default([]),
  metadata: z.record(z.unknown()).default({}),
});

type TopicEntity = z.infer<typeof topicEntitySchema>;
```

## Database Storage

Entities are stored with core metadata in columns and content as markdown:

```sql
-- Single entities table with hybrid storage
CREATE TABLE entities (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  title TEXT NOT NULL,           -- Core field stored in column
  content TEXT NOT NULL,         -- Markdown content (without title)
  tags TEXT NOT NULL DEFAULT '[]', -- JSON array of strings
  content_weight INTEGER DEFAULT 100,
  embedding BLOB NOT NULL,       -- Vector embedding
  created INTEGER NOT NULL,      -- Unix timestamp
  updated INTEGER NOT NULL,      -- Unix timestamp

  INDEX idx_entity_type (entity_type),
  INDEX idx_created (created),
  INDEX idx_updated (updated)
);

-- Entity relationships table
CREATE TABLE entity_relations (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  relation_type TEXT NOT NULL,  -- e.g., "references", "parent", "related"
  metadata TEXT,                 -- JSON metadata
  created INTEGER NOT NULL,

  FOREIGN KEY (source_id) REFERENCES entities(id) ON DELETE CASCADE,
  FOREIGN KEY (target_id) REFERENCES entities(id) ON DELETE CASCADE
);
```

## Entity Service

Unified CRUD operations for all entity types. The EntityService handles the hybrid storage model by:

1. **When saving**: Stores core fields in database columns, entity-specific content as markdown
2. **When loading**: Reconstructs full entity by merging database metadata with adapter-parsed content

### Entity Reconstruction Process

```typescript
// In EntityService.getEntity()
const entityData = await db.select().from(entities).where(eq(entities.id, id));
const adapter = entityRegistry.getAdapter(entityType);

// Extract entity-specific fields from markdown
const parsedContent = adapter.fromMarkdown(entityData.content);

// Merge database fields with parsed content
const entity = {
  // Core fields from database (always authoritative)
  id: entityData.id,
  entityType: entityData.entityType,
  title: entityData.title,
  created: new Date(entityData.created).toISOString(),
  updated: new Date(entityData.updated).toISOString(),
  tags: entityData.tags,

  // Entity-specific fields from adapter
  ...parsedContent,
} as T;
```

### Service Interface

```typescript
export class EntityService {
  // Create new entity (generates ID if not provided)
  async createEntity<T extends BaseEntity & IContentModel>(
    entity: Omit<T, "id"> & { id?: string },
  ): Promise<T>;

  // Get entity by ID and type
  async getEntity<T extends BaseEntity & IContentModel>(
    entityType: string,
    id: string,
  ): Promise<T | null>;

  // Update existing entity
  async updateEntity<T extends BaseEntity & IContentModel>(
    entity: T,
  ): Promise<T>;

  // Delete entity by ID
  async deleteEntity(id: string): Promise<boolean>;

  // List entities by type with pagination
  async listEntities<T extends BaseEntity & IContentModel>(
    entityType: string,
    options?: ListOptions,
  ): Promise<T[]>;

  // Search entities by tags
  async searchEntitiesByTags(
    tags: string[],
    options?: SearchOptions,
  ): Promise<SearchResult[]>;
}
```

## Plugin Registration

Plugins register their entity types during initialization:

```typescript
// In LinkPlugin
export class LinkPlugin extends CorePlugin {
  async register(context: CorePluginContext): Promise<PluginCapabilities> {
    const { entityService, logger } = context;

    // Register the link entity adapter
    const adapter = new LinkAdapter();
    entityService.registerEntityAdapter(adapter);

    // Register tools, resources, etc.
    return {
      tools: [...],
      resources: [...],
    };
  }
}
```

## Best Practices

### Schema Design

1. **Extend baseEntitySchema**: Always start with the base schema
2. **Use literal types**: `z.literal("note")` for entityType discrimination
3. **Provide defaults**: Use `.default()` for optional fields
4. **Keep schemas simple**: Complex validation in business logic, not schemas

### Factory Functions

1. **Handle ID generation**: Create ID if not provided
2. **Set timestamps**: Always set created/updated timestamps
3. **Validate input**: Use Zod parsing for type safety
4. **Implement toMarkdown**: Provide meaningful markdown representation

### Adapters

1. **Handle missing data**: Provide sensible defaults in fromMarkdown
2. **Preserve metadata**: Round-trip all entity properties through frontmatter
3. **Error handling**: Gracefully handle malformed markdown
4. **Keep stateless**: No instance state in adapter classes

### Testing

1. **Test schemas**: Validate schema parsing and error handling
2. **Test factories**: Ensure proper entity creation
3. **Test adapters**: Verify markdown round-trip consistency
4. **Mock dependencies**: Use dependency injection for testability

This functional approach provides type safety, validation, and flexibility while avoiding the complexity of class hierarchies.
