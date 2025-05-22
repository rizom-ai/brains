# Extensible Entity Model

The entity model is a core part of the Personal Brain architecture. It provides a unified, functional approach to data modeling using **Zod schemas + TypeScript interfaces** with factory functions for entity creation.

## Core Design Principles

### Functional Approach (No Classes)

- **Zod schemas** for validation and type inference
- **TypeScript interfaces** for type definitions
- **Factory functions** for entity creation
- **Pure functions** for entity operations

### Universal Content Interface

- All entities implement `IContentModel` for markdown conversion
- Consistent `toMarkdown()` method across all entity types
- Storage agnostic through markdown serialization

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

### Content Model Interface

Every entity must implement markdown conversion:

```typescript
export interface IContentModel {
  // Convert entity to markdown representation
  toMarkdown(): string;
}

// All entities must satisfy this type
type Entity = BaseEntity & IContentModel;
```

### Entity Creation Pattern

Entities are created using factory functions with Zod validation:

```typescript
// 1. Define entity-specific schema
const noteSchema = baseEntitySchema.extend({
  entityType: z.literal("note"),
  category: z.string().optional(),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
});

// 2. Infer the type
type Note = z.infer<typeof noteSchema> & IContentModel;

// 3. Create factory function
function createNote(
  input: Omit<z.input<typeof noteSchema>, "id" | "created" | "updated"> & {
    id?: string;
  },
): Note {
  const validated = noteSchema.parse({
    id: input.id ?? createId(),
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    entityType: "note",
    ...input,
  });

  return {
    ...validated,
    toMarkdown(): string {
      return `# ${this.title}\n\n${this.content}`;
    },
  };
}

// 4. Usage
const note = createNote({
  title: "My Note",
  content: "Note content here",
  tags: ["work", "project"],
});
```

## Entity Adapter Pattern

Each entity type requires an adapter for markdown serialization:

```typescript
export interface EntityAdapter<T extends BaseEntity & IContentModel> {
  // Convert from markdown to entity
  fromMarkdown(markdown: string, metadata?: Record<string, unknown>): T;

  // Extract metadata for frontmatter
  extractMetadata(entity: T): Record<string, unknown>;

  // Parse frontmatter from markdown
  parseFrontMatter(markdown: string): Record<string, unknown>;

  // Generate frontmatter for markdown storage
  generateFrontMatter(entity: T): string;
}

// Example implementation
class NoteAdapter implements EntityAdapter<Note> {
  fromMarkdown(markdown: string, metadata?: Record<string, unknown>): Note {
    const { data, content } = matter(markdown);
    const parsedData = metadata ?? data;

    return createNote({
      id: parsedData["id"] as string,
      title: (parsedData["title"] as string) || "Untitled",
      content: content.trim(),
      tags: Array.isArray(parsedData["tags"]) ? parsedData["tags"] : [],
      category: parsedData["category"] as string,
      priority:
        (parsedData["priority"] as "low" | "medium" | "high") || "medium",
      created: (parsedData["created"] as string) || new Date().toISOString(),
      updated: (parsedData["updated"] as string) || new Date().toISOString(),
    });
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

  // ... other methods
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

Entities are stored as markdown with metadata in a unified table:

```sql
-- Single entities table
CREATE TABLE entities (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  created TEXT NOT NULL,
  updated TEXT NOT NULL,
  tags TEXT NOT NULL,     -- JSON array of strings
  markdown TEXT NOT NULL, -- Full markdown with frontmatter

  INDEX idx_entity_type (entity_type),
  INDEX idx_created (created),
  INDEX idx_updated (updated)
);

-- Chunks for search and processing
CREATE TABLE entity_chunks (
  id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,

  FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE
);

-- Embeddings for vector search
CREATE TABLE entity_embeddings (
  id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL,
  chunk_id TEXT REFERENCES entity_chunks(id) ON DELETE CASCADE,
  embedding BLOB,         -- JSON array of numbers
  created_at TEXT NOT NULL,

  FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE
);
```

## Entity Service

Unified CRUD operations for all entity types:

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
