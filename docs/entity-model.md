# Extensible Entity Model

The entity model is a core part of the Personal Brain architecture. It provides a unified approach to data modeling while allowing each context to extend the model with domain-specific properties and behavior.

## Core Concepts

### Base Entity

All entities in the system share a common set of properties:

- **id**: Unique identifier (UUID)
- **created**: Creation timestamp
- **updated**: Last update timestamp
- **tags**: Array of string tags
- **entityType**: Type identifier for the entity

```typescript
// Base entity schema
export const baseEntitySchema = z.object({
  id: z.string().uuid(),
  created: z.string().datetime(),
  updated: z.string().datetime(),
  tags: z.array(z.string()).default([]),
  entityType: z.string(),
});

export type BaseEntity = z.infer<typeof baseEntitySchema>;
```

### Entity Interface

In addition to the base properties, all entities must implement a common interface:

```typescript
export interface IContentModel extends BaseEntity {
  // Convert entity to markdown format for processing
  toMarkdown(): string;
}
```

The `toMarkdown()` method is essential for various operations like:

- Generating embeddings for search
- Creating chunks for processing
- Exporting content

### Entity Registry

The EntityRegistry is responsible for managing entity type definitions:

```typescript
export class EntityRegistry {
  // Register a new entity type with its schema and adapter
  registerEntityType<T extends BaseEntity>(
    type: string,
    schema: z.ZodType<T>,
    adapter: EntityAdapter<T>,
  ): void;

  // Get schema for a specific entity type
  getSchema<T extends BaseEntity>(type: string): z.ZodType<T>;

  // Get adapter for a specific entity type
  getAdapter<T extends BaseEntity>(type: string): EntityAdapter<T>;

  // Validate entity against its schema
  validateEntity<T extends BaseEntity>(type: string, entity: unknown): T;
}
```

### Entity Adapter

Each entity type needs an adapter for storage, retrieval, and processing:

```typescript
export interface EntityAdapter<T extends BaseEntity & IContentModel> {
  // Convert from markdown to entity
  fromMarkdown(markdown: string, metadata?: Record<string, unknown>): T;

  // Extract metadata from entity for search/filtering
  extractMetadata(entity: T): Record<string, unknown>;

  // Parse frontmatter metadata from markdown
  parseFrontMatter(markdown: string): Record<string, unknown>;

  // Generate frontmatter for markdown
  generateFrontMatter(entity: T): string;
}
```

## Domain-Specific Entities

### Note Entity

A Note is the most basic entity type:

```typescript
// Note schema
export const noteSchema = baseEntitySchema.extend({
  entityType: z.literal("note"),
  title: z.string(),
  content: z.string(),
  format: z.enum(["markdown", "text", "html"]).default("markdown"),
  metadata: z.record(z.any()).optional(),
});

export type Note = z.infer<typeof noteSchema>;
```

### Profile Entity

A Profile represents a user profile:

```typescript
// Profile schema
export const profileSchema = baseEntitySchema.extend({
  entityType: z.literal("profile"),
  name: z.string(),
  tagline: z.string().optional(),
  bio: z.string().optional(),
  skills: z.array(z.string()).default([]),
  experience: z
    .array(
      z.object({
        title: z.string(),
        company: z.string(),
        startDate: z.string(),
        endDate: z.string().optional(),
        description: z.string().optional(),
      }),
    )
    .default([]),
  metadata: z.record(z.any()).optional(),
});

export type Profile = z.infer<typeof profileSchema>;
```

### WebsiteSection Entity

A WebsiteSection represents a section of a generated website:

```typescript
// WebsiteSection schema
export const websiteSectionSchema = baseEntitySchema.extend({
  entityType: z.literal("website_section"),
  sectionType: z.enum(["hero", "about", "services", "contact", "testimonials"]),
  title: z.string(),
  content: z.string(),
  status: z.enum(["draft", "review", "published"]).default("draft"),
  quality: z.number().min(0).max(100).optional(),
  metadata: z.record(z.any()).optional(),
});

export type WebsiteSection = z.infer<typeof websiteSectionSchema>;
```

## Repository Implementation

The repository provides a unified data access layer for all entity types:

```typescript
export class Repository {
  // Create entity of any registered type
  async createEntity<T extends BaseEntity>(
    type: string,
    data: Omit<T, "id" | "created" | "updated">,
  ): Promise<T>;

  // Get entity by ID
  async getEntity<T extends BaseEntity>(
    type: string,
    id: string,
  ): Promise<T | null>;

  // Update entity
  async updateEntity<T extends BaseEntity>(
    type: string,
    id: string,
    data: Partial<Omit<T, "id" | "created" | "updated">>,
  ): Promise<T>;

  // Delete entity
  async deleteEntity(type: string, id: string): Promise<boolean>;

  // Search across entities
  async search(
    query: string,
    options?: {
      types?: string[];
      limit?: number;
      tags?: string[];
    },
  ): Promise<SearchResult[]>;
}
```

## Entity Storage

Entities are stored in a SQLite database with the following schema:

```sql
-- Entities table
CREATE TABLE entities (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  created TEXT NOT NULL,
  updated TEXT NOT NULL,
  tags TEXT NOT NULL,  -- JSON array
  data TEXT NOT NULL,  -- JSON object

  -- Indexes
  INDEX idx_entity_type (entity_type),
  INDEX idx_tags (tags)
);

-- Entity chunks table for search
CREATE TABLE entity_chunks (
  id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  embedding BLOB,  -- Vector embedding

  FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE,

  -- Indexes
  INDEX idx_entity_id (entity_id),
  INDEX idx_entity_type (entity_type)
);
```

## Registering Custom Entity Types

When implementing a new context plugin, you'll need to register your entity type:

```typescript
// In note-context/src/index.ts
import { registerContext, ContextPlugin } from "@personal-brain/shell";
import { noteSchema, NoteAdapter } from "./entity/noteEntity";

const noteContext: ContextPlugin = {
  id: "note",
  version: "1.0.0",

  register({ registry, entityRegistry }) {
    // Register note-specific components
    registry.register("noteService", () => new NoteService());

    // Register note entity type
    entityRegistry.registerEntityType("note", noteSchema, new NoteAdapter());
  },
};
```

## Cross-Entity Operations

The unified entity model allows for powerful cross-entity operations:

### Search Across Types

```typescript
// Search across multiple entity types
const results = await repository.search("project management", {
  types: ["note", "profile", "website_section"],
});
```

### Entity Relationships

```typescript
// Find related entities
const related = await repository.findRelated(noteId, {
  limit: 5,
  minSimilarity: 0.7,
});
```

## Entity Migration

When entity schemas evolve, migrations are handled through the repository:

```typescript
// Migration system
export class EntityMigration {
  // Register a migration for an entity type
  registerMigration(
    type: string,
    fromVersion: string,
    toVersion: string,
    migrationFn: (entity: any) => any,
  ): void;

  // Migrate an entity to the latest version
  async migrateEntity(type: string, entity: any): Promise<any>;
}
```

## Best Practices

1. **Keep Base Properties Minimal**: Only include truly common properties in the base entity.
2. **Use Strong Typing**: Always define Zod schemas for your entity types.
3. **Implement toMarkdown() Carefully**: This method is critical for search and processing.
4. **Consider Chunking Strategy**: Different entity types may need different chunking approaches.
5. **Set Appropriate Indexes**: Add database indexes for frequently queried properties.
6. **Version Your Schemas**: Include version information to support future migrations.
7. **Keep Adapters Simple**: Focus on data transformation, not business logic.
8. **Test Schema Validation**: Ensure your schemas properly validate input data.
