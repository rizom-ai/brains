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

2. **Context plugins define their entities**:
   - Note Context → Note entity
   - Task Context → Task entity
   - Profile Context → Profile entity

Each context plugin is responsible for:

- Defining its entity schema
- Creating factory functions
- Implementing entity adapters
- Registering with the shell's EntityRegistry

### Entity Creation in Context Plugins

Each context plugin defines its own entities:

```typescript
// packages/note-context/src/entities/note.ts
import { z } from "zod";
import { nanoid } from "nanoid";
import { baseEntitySchema } from "@brains/shell";

// 1. Define entity-specific schema
export const noteSchema = baseEntitySchema.extend({
  entityType: z.literal("note"),
  category: z.string().optional(),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
});

// 2. Infer the type (pure data, no methods)
export type Note = z.infer<typeof noteSchema>;

// 3. Create factory function
export function createNote(
  input: Omit<
    z.input<typeof noteSchema>,
    "id" | "created" | "updated" | "entityType"
  > & {
    id?: string;
  },
): Note {
  const now = new Date().toISOString();
  return noteSchema.parse({
    id: input.id ?? nanoid(12),
    created: now,
    updated: now,
    entityType: "note",
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

// Example implementation for Note (content-heavy entity)
class NoteAdapter implements EntityAdapter<Note> {
  entityType = "note";
  schema = noteSchema;

  toMarkdown(note: Note): string {
    // For notes, we only store content and entity-specific fields
    // Title is in database, so we don't duplicate it in markdown
    const frontmatter =
      note.category || note.priority !== "medium"
        ? this.generateFrontMatter(note)
        : "";

    return `${frontmatter}${note.content}`;
  }

  fromMarkdown(markdown: string): Partial<Note> {
    const { data, content } = matter(markdown);

    // Return only entity-specific fields
    // Core fields (id, title, created, etc.) will come from database
    return {
      content: content.trim(),
      category: data.category as string | undefined,
      priority: (data.priority as "low" | "medium" | "high") || "medium",
    };
  }

  generateFrontMatter(note: Note): string {
    const metadata: Record<string, unknown> = {};
    if (note.category) metadata.category = note.category;
    if (note.priority !== "medium") metadata.priority = note.priority;

    return Object.keys(metadata).length > 0
      ? matter.stringify("", metadata)
      : "";
  }
}

// Example implementation for Profile (metadata-heavy entity)
class ProfileAdapter implements EntityAdapter<Profile> {
  entityType = "profile";
  schema = profileSchema;

  toMarkdown(profile: Profile): string {
    // For profiles, most data is in frontmatter
    const frontmatter = matter.stringify("", {
      name: profile.name,
      email: profile.email,
      avatar: profile.avatar,
      links: profile.links,
      skills: profile.skills,
    });

    // Bio is the main content
    return `${frontmatter}${profile.bio || ""}`;
  }

  fromMarkdown(markdown: string): Partial<Profile> {
    const { data, content } = matter(markdown);

    return {
      name: data.name as string,
      email: data.email as string,
      bio: content.trim() || undefined,
      avatar: data.avatar as string | undefined,
      links: data.links as string[] | undefined,
      skills: data.skills as string[] | undefined,
    };
  }

  extractMetadata(entity: Note): Record<string, unknown> {
    return {
      id: entity.id,
      title: entity.title,
      tags: entity.tags,
      category: entity.category,
      priority: entity.priority,
      created: entity.created,
      updated: entity.updated,
      entityType: entity.entityType,
    };
  }

  generateFrontMatter(entity: Note): string {
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

### Note Entity

```typescript
const noteSchema = baseEntitySchema.extend({
  entityType: z.literal("note"),
  category: z.string().optional(),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  format: z.enum(["markdown", "text"]).default("markdown"),
});

type Note = z.infer<typeof noteSchema> & IContentModel;

function createNote(input: CreateNoteInput): Note {
  // Implementation as shown above
}
```

### Profile Entity

```typescript
const profileSchema = baseEntitySchema.extend({
  entityType: z.literal("profile"),
  name: z.string(),
  bio: z.string().optional(),
  skills: z.array(z.string()).default([]),
  experience: z.array(experienceSchema).default([]),
});

type Profile = z.infer<typeof profileSchema> & IContentModel;

function createProfile(input: CreateProfileInput): Profile {
  // Factory implementation
}
```

### Website Section Entity

```typescript
const websiteSectionSchema = baseEntitySchema.extend({
  entityType: z.literal("website_section"),
  sectionType: z.enum(["hero", "about", "services", "contact"]),
  status: z.enum(["draft", "review", "published"]).default("draft"),
  quality: z.number().min(0).max(100).optional(),
});

type WebsiteSection = z.infer<typeof websiteSectionSchema> & IContentModel;

function createWebsiteSection(
  input: CreateWebsiteSectionInput,
): WebsiteSection {
  // Factory implementation
}
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

Context plugins register their entity types:

```typescript
// In a context plugin
const noteContext: ContextPlugin = {
  id: "note",
  version: "1.0.0",

  register({ entityRegistry }) {
    // Register the note entity type
    entityRegistry.registerEntityType("note", noteSchema, new NoteAdapter());
  },
};
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
