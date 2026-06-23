# Extensible Entity Model

The entity model is a core part of the Brain architecture. It provides a unified, functional approach to data modeling using **Zod schemas + TypeScript interfaces** with factory functions for entity creation.

## Core Design Principles

### Functional Approach for Entities

- **Zod schemas** for validation and type inference
- **TypeScript interfaces** for type definitions
- **Factory functions** for entity creation (no classes for entities)
- **Adapter classes** for serialization (classes are used for adapters)

### Hybrid Storage Model

- Database stores core fields in columns: `id`, `entityType`, `content`, `contentHash`, `visibility`, `metadata`, `created`, `updated`
- Entity-specific content stored as markdown in the `content` column
- Per-type fields (including `title` and `tags`) live inside the `metadata` JSON, not as top-level columns
- Adapters handle bidirectional conversion between entities and markdown
- Embeddings stored separately in a vector column
- Single source of truth: database columns for core fields, markdown content for entity-specific fields

## Core Concepts

### Base Entity Schema

All entities share common properties and validation:

```typescript
// Base entity schema with required fields
export const baseEntitySchema = z.object({
  id: z.string(), // nanoid(12) generated
  entityType: z.string(), // Type discriminator
  content: z.string(), // Main content (markdown body)
  created: z.string().datetime(), // ISO timestamp
  updated: z.string().datetime(), // ISO timestamp
  visibility: contentVisibilitySchema, // "public" | "shared" | "restricted"
  metadata: z.record(z.string(), z.unknown()), // Per-type fields (title, tags, etc.)
  contentHash: z.string(), // SHA256 of content, for change detection
});

export type BaseEntity = z.infer<typeof baseEntitySchema>;
```

There is no top-level `title` or `tags` field. Per-type fields such as `title` and `tags` are stored inside the `metadata` JSON, where each entity type defines its own metadata shape.

### Current Implementation Status

The shell package already includes:

- **EntityRegistry**: Manages entity types and adapters
- **EntityService**: Provides CRUD operations and search
- **EntityAdapter interface**: Handles entity ↔ markdown conversion (requires `toMarkdown`, `fromMarkdown`, `extractMetadata`, `parseFrontMatter`, `generateFrontMatter`, and `getBodyTemplate`)
- **Database schema**: Tables for entities and embeddings

Entities themselves are pure data objects. All serialization logic lives on the adapter — there is no `toMarkdown()` method on the entity.

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
// entities/link/src/schemas/link.ts
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
3. **Core fields** (`id`, `entityType`, `content`, `created`, `updated`, `visibility`, `contentHash`) come from the database
4. **Entity-specific fields** (including `title`/`tags` in `metadata`) come from markdown/frontmatter

The adapter interface requires `toMarkdown`, `fromMarkdown`, `extractMetadata`, `parseFrontMatter`, `generateFrontMatter`, and `getBodyTemplate`. Note that `parseFrontMatter` takes the markdown plus a Zod schema to validate the frontmatter against. Several capability flags are optional.

```typescript
export interface EntityAdapter<
  TEntity extends BaseEntity<TMetadata>,
  TMetadata = Record<string, unknown>,
> {
  entityType: string;
  schema: z.ZodType<TEntity, z.ZodTypeDef, unknown>;

  // Convert entity to markdown content (may include frontmatter)
  toMarkdown(entity: TEntity): string;

  // Extract entity-specific fields from markdown
  // Returns Partial<TEntity> - core fields are merged from the database
  fromMarkdown(markdown: string): Partial<TEntity>;

  // Extract typed metadata from the entity for search/filtering
  extractMetadata(entity: TEntity): TMetadata;

  // Parse + validate frontmatter against a provided Zod schema
  parseFrontMatter<TFrontmatter>(
    markdown: string,
    schema: z.ZodSchema<TFrontmatter>,
  ): TFrontmatter;

  // Generate frontmatter for markdown
  generateFrontMatter(entity: TEntity): string;

  // Return a markdown body template with section headings (empty for free-form)
  getBodyTemplate(): string;

  // Optional capability flags
  frontmatterSchema?: z.ZodObject<z.ZodRawShape>;
  isSingleton?: boolean;
  hasBody?: boolean;
  supportsCoverImage?: boolean;
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
class SummaryAdapter implements EntityAdapter<SummaryEntity, SummaryMetadata> {
  entityType = "summary";
  schema = summarySchema;

  toMarkdown(entity: SummaryEntity): string {
    // Conversation context lives in typed metadata frontmatter
    const frontmatter = matter.stringify("", { ...entity.metadata });

    // Content is the rendered summary entries
    return `${frontmatter}${entity.content}`;
  }

  fromMarkdown(markdown: string): Partial<SummaryEntity> {
    const { data, content } = matter(markdown);

    return {
      content: content.trim(),
      metadata: summaryMetadataSchema.parse(data),
    };
  }

  extractMetadata(entity: SummaryEntity): SummaryMetadata {
    return entity.metadata;
  }

  generateFrontMatter(entity: SummaryEntity): string {
    return matter.stringify("", { ...entity.metadata });
  }

  parseFrontMatter<TFrontmatter>(
    markdown: string,
    schema: z.ZodSchema<TFrontmatter>,
  ): TFrontmatter {
    const { data } = matter(markdown);
    return schema.parse(data);
  }

  getBodyTemplate(): string {
    return "";
  }
}
```

## Entity Registry

The registry manages entity types and their schemas:

```typescript
export class EntityRegistry {
  // Register entity type with schema and adapter
  registerEntityType<T extends BaseEntity>(
    type: string,
    schema: z.ZodType<T>,
    adapter: EntityAdapter<T>,
  ): void;

  // Validate entity against registered schema
  validateEntity<T extends BaseEntity>(type: string, entity: unknown): T;

  // Convert entity to markdown using registered adapter
  entityToMarkdown<T extends BaseEntity>(entity: T): string;

  // Convert markdown to entity using registered adapter
  markdownToEntity<T extends BaseEntity>(type: string, markdown: string): T;
}
```

## Common Entity Types

### Core Entity Types

These entity types are part of the core system and managed by shell services:

#### BrainCharacterEntity

Brain identity and AI personality configuration. The entity itself is a singleton; the character data (`name`, `role`, `purpose`, `values`) is parsed from the markdown content body rather than stored as top-level fields:

```typescript
const brainCharacterBodySchema = z.object({
  name: z.string().describe("The brain's friendly display name"),
  role: z.string().describe("The brain's primary role"),
  purpose: z.string().describe("The brain's purpose and goals"),
  values: z.array(z.string()).describe("Core values that guide behavior"),
});

const brainCharacterSchema = baseEntitySchema.extend({
  id: z.literal("brain-character"),
  entityType: z.literal("brain-character"),
});

type BrainCharacterEntity = z.infer<typeof brainCharacterSchema>;
type BrainCharacter = z.infer<typeof brainCharacterBodySchema>;
```

Managed by: `shell/identity-service`

#### AnchorProfileEntity

Public identity of the person, team, or collective behind the brain. The profile data is parsed from the markdown content body:

```typescript
const anchorProfileBodySchema = z.object({
  name: z.string().describe("Name (person or organization)"),
  kind: z
    .enum(["professional", "team", "collective"])
    .describe("Type of anchor: professional (individual), team, or collective"),
  organization: z
    .string()
    .optional()
    .describe("Organization the anchor belongs to"),
  description: z.string().optional().describe("Short description or biography"),
  avatar: z.string().optional().describe("URL or asset path to avatar/logo"),
  website: z.string().optional().describe("Primary website URL"),
  email: z.string().optional().describe("Contact email"),
  socialLinks: z
    .array(
      z.object({
        platform: z
          .enum(["github", "instagram", "linkedin", "email", "website"])
          .describe("Social media platform"),
        url: z.string().describe("Profile or contact URL"),
        label: z.string().optional().describe("Optional display label"),
      }),
    )
    .optional()
    .describe("Social media and contact links"),
});

const anchorProfileSchema = baseEntitySchema.extend({
  id: z.literal("anchor-profile"),
  entityType: z.literal("anchor-profile"),
});

type AnchorProfileEntity = z.infer<typeof anchorProfileSchema>;
type AnchorProfile = z.infer<typeof anchorProfileBodySchema>;
```

Managed by: `shell/identity-service`

#### SiteInfoEntity

Website presentation and configuration:

```typescript
const siteInfoBodySchema = z.object({
  title: z.string().describe("The site's title"),
  description: z.string().describe("The site's description"),
  url: z.string().optional().describe("The site's canonical URL"),
  copyright: z.string().optional().describe("Copyright notice text"),
  themeMode: z
    .enum(["light", "dark"])
    .optional()
    .describe("Default theme mode"),
  cta: z
    .object({
      heading: z.string().describe("Main CTA heading text"),
      buttonText: z.string().describe("Call-to-action button text"),
      buttonLink: z.string().describe("URL or anchor for the CTA button"),
    })
    .optional()
    .describe("Call-to-action configuration"),
});

const siteInfoSchema = baseEntitySchema.extend({
  id: z.literal("site-info"),
  entityType: z.literal("site-info"),
});

type SiteInfoEntity = z.infer<typeof siteInfoSchema>;
type SiteInfoBody = z.infer<typeof siteInfoBodySchema>;
```

Managed by: `plugins/site-builder` (SiteInfoService)

**Note**: The three core entity types serve distinct purposes:

- **brain-character**: AI personality and behavior (brain's name, role, purpose, values)
- **anchor-profile**: Public presence of the person/team/collective behind the brain (name, kind, organization, bio, social links)
- **site-info**: Website presentation (title, description, CTA, theme)

At runtime, site-builder merges site-info and anchor-profile data (e.g., socialLinks from the anchor profile) to create the complete site configuration.

### Plugin Entity Types

These entity types are defined by plugins for specific features:

#### LinkEntity

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

Narrative conversation summaries. All conversation context lives in a typed `metadata` object; the body holds the chronological summary entries:

```typescript
const summaryMetadataSchema = z.object({
  conversationId: z.string(),
  channelId: z.string(),
  channelName: z.string().optional(),
  interfaceType: z.string(),
  timeRange: summaryTimeRangeSchema.optional(),
  messageCount: z.number().int().min(0),
  entryCount: z.number().int().min(0),
  participants: z.array(summaryParticipantSchema).optional(),
  sourceHash: z.string(),
  projectionVersion: z.number().int().min(1),
});

const summarySchema = baseEntitySchema.extend({
  entityType: z.literal("summary"),
  metadata: summaryMetadataSchema,
});

type SummaryEntity = z.infer<typeof summarySchema>;
```

### TopicEntity

Topics derived from source content. Topic metadata is intentionally empty; the title lives in frontmatter and the description lives in the body:

```typescript
const topicMetadataSchema = z.object({});

const topicEntitySchema = baseEntitySchema.extend({
  entityType: z.literal("topic"),
  metadata: topicMetadataSchema,
});

const topicFrontmatterSchema = z.object({
  title: z.string().describe("Topic title"),
});

const topicBodySchema = z.object({
  content: z.string(),
});

type TopicEntity = z.infer<typeof topicEntitySchema>;
```

## Database Storage

Entities live in `brain.db`. Embeddings live in a separate `embeddings.db` that gets attached to the entity DB for cross-DB search joins. FTS5 full-text search runs on entity content for keyword matching.

```sql
-- brain.db: entities table
CREATE TABLE entities (
  id TEXT NOT NULL,
  entityType TEXT NOT NULL,
  content TEXT NOT NULL,          -- Full markdown with frontmatter
  contentHash TEXT NOT NULL,      -- For change detection
  visibility TEXT NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('public', 'shared', 'restricted')),
  metadata TEXT NOT NULL DEFAULT '{}', -- JSON, includes title/tags + per-type fields
  created INTEGER NOT NULL,
  updated INTEGER NOT NULL,
  PRIMARY KEY(id, entityType)
);

-- brain.db: FTS5 virtual table for keyword search
CREATE VIRTUAL TABLE entity_fts USING fts5(
  entity_id UNINDEXED,
  entity_type UNINDEXED,
  content
);

-- embeddings.db: separate database for vector storage
CREATE TABLE embeddings (
  entity_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  embedding F32_BLOB(1536) NOT NULL,  -- OpenAI text-embedding-3-small
  content_hash TEXT NOT NULL,
  PRIMARY KEY(entity_id, entity_type)
);
```

Search queries ATTACH the embedding DB and join across for hybrid vector + keyword scoring.

```sql
-- Entity relationships table (planned)
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
  content: entityData.content,
  visibility: entityData.visibility,
  metadata: entityData.metadata, // includes title/tags for types that use them
  contentHash: entityData.contentHash,
  created: new Date(entityData.created).toISOString(),
  updated: new Date(entityData.updated).toISOString(),

  // Entity-specific fields from adapter
  ...parsedContent,
} as T;
```

### Service Interface

```typescript
export class EntityService {
  // Create new entity (generates ID if not provided)
  async createEntity<T extends BaseEntity>(
    request: CreateEntityRequest<T>,
  ): Promise<EntityMutationResult>;

  // Get entity by ID and type
  async getEntity<T extends BaseEntity>(request: {
    entityType: string;
    id: string;
  }): Promise<T | null>;

  // Update existing entity
  async updateEntity<T extends BaseEntity>(
    request: UpdateEntityRequest<T>,
  ): Promise<EntityMutationResult>;

  // Delete entity by ID and type
  async deleteEntity(request: {
    entityType: string;
    id: string;
  }): Promise<boolean>;

  // List entities by type with pagination
  async listEntities<T extends BaseEntity>(
    request: ListEntitiesRequest,
  ): Promise<T[]>;

  // Full-text + vector search across entities
  async search<T extends BaseEntity = BaseEntity>(request: {
    query: string;
    options?: SearchOptions;
  }): Promise<SearchResult<T>[]>;

  // Search within a single entity type
  async searchEntities(
    entityType: string,
    query: string,
    options?: Pick<SearchOptions, "limit">,
  ): Promise<SearchResult[]>;

  // Diagnostic: raw vector distances for a query
  async searchWithDistances(request: {
    query: string;
  }): Promise<
    Array<{ entityId: string; entityType: string; distance: number }>
  >;
}
```

## Plugin Registration

EntityPlugins auto-register their entity types during initialization:

```typescript
// In LinkPlugin (entities/link/src/plugin.ts)
export class LinkPlugin extends EntityPlugin<LinkEntity, LinkConfig> {
  readonly entityType = linkAdapter.entityType;
  readonly schema = linkSchema;
  readonly adapter = linkAdapter;

  // EntityPlugin base class auto-registers:
  // - Entity type + schema + adapter
  // - Generation handler (if createGenerationHandler() returns one)
  // - Templates (if getTemplates() returns any)
  // - DataSources (if getDataSources() returns any)
  // - Projection jobs (if getDerivedEntityProjections() declares them)
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
