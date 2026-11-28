# Extensible Entity Model

The entity model is a core part of the Brain architecture. It provides a unified, declarative approach to data modeling: each entity type is a **`defineEntity` declaration** with a **Zod metadata schema**, and the runtime builds its storage, validation, and markdown handling from it.

## Core Design Principles

### Declarative Approach for Entities

- **Zod schemas** for validation and type inference
- **`defineEntity` declarations** for entity types (no classes for entities)
- **Markdown codecs** on a declaration when a type's file differs from its metadata
- **Adapters** for serialization: the runtime builds one from each declaration; a few shell-owned types (`brain-character`, `anchor-profile`) use adapter classes

### Hybrid Storage Model

- Database stores core fields in columns: `id`, `entityType`, `content`, `contentHash`, `visibility`, `metadata`, `created`, `updated`
- Entity-specific content stored as markdown in the `content` column
- Per-type fields (including `title` and `tags`) live inside the `metadata` JSON, not as top-level columns
- Adapters handle bidirectional conversion between entities and markdown
- Embeddings stored separately in a vector column
- Binary types (`image`, `document`) store an `asset://sha256/<digest>` reference in `content`; the bytes live in content-addressed asset tables
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

`visibility` decides who can read an entity: `public` entities are open to anyone, `shared` entities to trusted people and admins, and `restricted` entities to admins only. Search, derivation, and site builds respect it.

There is no top-level `title` or `tags` field. Per-type fields such as `title` and `tags` are stored inside the `metadata` JSON, where each entity type defines its own metadata shape.

### Current Implementation Status

The shell package already includes:

- **EntityRegistry**: Manages entity types and adapters
- **EntityService**: Provides CRUD operations and search
- **EntityAdapter interface**: Handles entity ↔ markdown conversion (requires `entityType`, `purpose`, `schema`, `toMarkdown`, `fromMarkdown`, `extractMetadata`, `parseFrontMatter`, `generateFrontMatter`, and `getBodyTemplate`)
- **Database schema**: Tables for entities, assets, and embeddings

Entities themselves are pure data objects. All serialization logic lives on the adapter — there is no `toMarkdown()` method on the entity.

### Where Entities Are Defined

Entities are **NOT** defined in the shell package. Instead:

1. **Shell provides base infrastructure**:
   - Base entity schema and types
   - EntityRegistry for registration
   - EntityService for CRUD operations
   - EntityAdapter interface

2. **Plugins define their entities**:
   - `@brains/link` → `link` (web content capture)
   - `@brains/conversation-memory` → `summary`, `decision`, `action-item` (conversation memory)
   - `@brains/topics` → `topic` (extracted topics)

Each entity package is responsible for:

- Declaring each type with `defineEntity`: its purpose, its metadata schema, and its behavior
- Giving a type a markdown codec when its file differs from its metadata
- Exporting its types in an entity package, which registers them with the shell's EntityRegistry when installed

### Entity Creation in Plugins

Each plugin declares its own entities:

```typescript
// entities/link/src/link.ts (simplified)
import { defineEntity, z, type EntityOf } from "@brains/sdk/entities";

// 1. Define the type's metadata schema
export const linkMetadataSchema = z.object({
  status: z.enum(["pending", "draft", "published"]),
  title: z.string(),
  url: z.string().url(),
  description: z.string().optional(),
  capturedAt: z.string().datetime(),
  source: z.object({ ref: z.string(), label: z.string() }),
});

// 2. Declare the type
export const link = defineEntity({
  type: "link",
  purpose: "A saved external URL or web resource captured for later reference.",
  metadata: linkMetadataSchema,
});

// 3. Infer the entity: the runtime adds id, content, visibility, and timestamps
export type LinkEntity = EntityOf<typeof link>;
```

Entities are created through the entity service, system tools, or a declared create route, never by a factory in the package. The real `link` declaration adds a markdown codec, templates, create routes, and an ATProto projection.

**Important**: Entities are pure data objects. All serialization logic belongs in the adapter.

## Entity Adapter Pattern

Each entity type requires an adapter for markdown serialization. Adapters work with the hybrid storage model:

### Adapter Responsibilities

1. **toMarkdown**: Converts entity to markdown (may include frontmatter for entity-specific fields)
2. **fromMarkdown**: Extracts entity-specific fields from markdown content
3. **Core fields** (`id`, `entityType`, `content`, `created`, `updated`, `visibility`, `contentHash`) come from the database
4. **Entity-specific fields** (including `title`/`tags` in `metadata`) come from markdown/frontmatter

The adapter interface requires `entityType`, `purpose`, `schema`, `toMarkdown`, `fromMarkdown`, `extractMetadata`, `parseFrontMatter`, `generateFrontMatter`, and `getBodyTemplate`. `purpose` is one sentence saying what the type is; the model reads it to choose an `entityType`. `parseFrontMatter` takes the markdown plus a schema to validate the frontmatter against. Several capability flags are optional.

```typescript
export interface EntityAdapter<
  TEntity extends BaseEntity<TMetadata>,
  TMetadata = Record<string, unknown>,
> {
  entityType: string;

  // One declarative sentence describing what this entity type is
  purpose: string;

  schema: EntitySchema<TEntity>;

  // Convert entity to markdown content (may include frontmatter)
  toMarkdown(entity: TEntity): string;

  // Extract entity-specific fields from markdown
  // Returns Partial<TEntity> - core fields are merged from the database
  fromMarkdown(markdown: string): Partial<TEntity>;

  // Extract typed metadata from the entity for search/filtering
  extractMetadata(entity: TEntity): TMetadata;

  // The label lists and search results show, when metadata has no title
  displayTitle?(entity: TEntity): string | undefined;

  // Parse + validate frontmatter against a provided schema
  parseFrontMatter<TFrontmatter>(
    markdown: string,
    schema: { parse(data: unknown): TFrontmatter },
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
```

A declared type does not implement this interface by hand. By default its frontmatter is its metadata and its body is its content. When the file should differ, the declaration gives a `markdown` codec: `decode` reads a stored document's body and frontmatter into content and metadata, and `encode` writes them back. The stored header is flat, so the `link` codec writes the nested `source` as two flat keys and reads either form:

```typescript
export const link = defineEntity({
  type: "link",
  purpose: "A saved external URL or web resource captured for later reference.",
  metadata: linkMetadataSchema,
  markdown: {
    // A file in either form: flat source keys, or a nested source
    decode: ({ content, frontmatter }) => {
      const { sourceRef, sourceLabel, ...rest } = frontmatter;
      return {
        content,
        metadata: {
          ...rest,
          source: rest["source"] ?? { ref: sourceRef, label: sourceLabel },
        },
      };
    },
    // Only the flat form is written
    encode: ({ content, metadata }) => {
      const { source, ...rest } = metadata;
      return {
        content,
        frontmatter: {
          ...rest,
          sourceRef: source.ref,
          sourceLabel: source.label,
        },
      };
    },
  },
});
```

See [The stored format](./external-plugin-authoring.md#the-stored-format) for the rules a stored file follows.

## Entity Registry

The registry manages entity types and their schemas:

```typescript
export interface EntityRegistry {
  // Register entity type with schema, adapter, and type config
  registerEntityType(
    type: string,
    schema: UnknownEntitySchema,
    adapter: EntityAdapter<TEntity, TMetadata>,
    config?: EntityTypeConfig,
  ): void;

  // Look up a registered type
  hasEntityType(type: string): boolean;
  getAllEntityTypes(): string[];
  getSchema(type: string): UnknownEntitySchema;
  getAdapter(type: string): EntityAdapter<BaseEntity>;
  getEntityTypeConfig(type: string): EntityTypeConfig;

  // Validate entity against registered schema
  validateEntity(type: string, entity: unknown): BaseEntity;
}
```

Conversion between entities and markdown goes through the adapter `getAdapter` returns. The registry also holds create routes, persist validators, frontmatter extensions, and groupings.

## Common Entity Types

### Core Entity Types

These entity types are part of the core system and managed by shell services:

#### BrainCharacterEntity

Brain identity and AI personality configuration. The entity itself is a singleton; the character data (`name`, `role`, `purpose`, `values`) is parsed from the markdown content rather than stored as top-level fields:

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

The file states `name` and `role` in the header and `purpose` and `values` as body sections.

Managed by: `shell/identity-service`

#### AnchorProfileEntity

Public identity of the person, team, or organization behind the brain. The profile data is parsed from the markdown content:

```typescript
const anchorProfileBodySchema = z.object({
  name: z.string().describe("Name of the anchor"),
  organization: z
    .string()
    .optional()
    .describe("Organization the anchor belongs to"),
  description: z.string().optional().describe("Short description or biography"),
  avatar: z.string().optional().describe("URL or asset path to avatar/logo"),
  photo: z
    .string()
    .optional()
    .describe(
      "A photo of the people behind the anchor, as ![alt](entity://image/<id>)",
    ),
  website: z.string().optional().describe("Primary website URL"),
  email: z.string().optional().describe("Contact email"),
  socialLinks: z
    .array(
      z.object({
        platform: z
          .enum([
            "github",
            "instagram",
            "linkedin",
            "podcast",
            "email",
            "website",
          ])
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

Whether the anchor is a person, team, or organization is set by `anchor` in `brain.yaml`, not in the profile. The file states the short facts in the header; the description, links, and the kind-aware prose fields are body sections, and the long-form story closes the body under `## Story`.

Managed by: `shell/identity-service`, with kind-aware professional, team, and organization profile extensions and persistence validation owned by `@brains/profile`.

#### StyleGuideEntity

Singleton messaging, voice, and visual guidance for generation. The header holds the guide's name; messaging, voice, and visual guidance are body sections above the free-form guidance:

```markdown
---
name: Default style guide
---

## Messaging

- **Positioning:** Practical guidance grounded in real work

## Voice

- **Summary:** Clear and direct

### Traits

- grounded

## Visual

- **Art direction:** Geometric editorial collage
- **Composition:** Layered and interconnected
- **Mood:** Playful and rigorous

### Palette

- #3921D7
- #E7640A

### Avoid

- photorealism

## Guidance

Rationale, examples, and exceptions.
```

In metadata the guidance keeps its structured shape: `name`, `messaging` (`audiences`, `positioning`), `voice` (`summary`, `traits`, `principles`, `preferredTerms`, `avoid`), and `visual` (`artDirection`, `palette`, `composition`, `mood`, `preferred`, `avoid`). Generation separately selects represented identity (`brain | anchor | none`) and style facets (`voice | visual | both | none`).

Managed by: `@brains/style-guide`

#### SiteInfoEntity

Website presentation and configuration:

```typescript
const siteInfoBodySchema = z.object({
  represents: z.enum(["brain", "anchor"]).default("anchor"),
  title: z.string().optional().describe("Optional site title override"),
  description: z
    .string()
    .optional()
    .describe("Optional site description override"),
  copyright: z.string().optional().describe("Copyright notice text"),
  logo: z
    .boolean()
    .optional()
    .describe("Whether to display logo instead of title text in header"),
  themeMode: z
    .enum(["light", "dark"])
    .optional()
    .describe("Default theme mode"),
  cta: z
    .object({
      heading: z.string().describe("Main CTA heading text"),
      subtitle: z.string().optional().describe("A line under the CTA heading"),
      buttonText: z.string().describe("Call-to-action button text"),
      buttonLink: z.string().describe("URL or anchor for the CTA button"),
    })
    .optional()
    .describe("Call-to-action configuration"),
  sections: z
    .record(z.string(), z.object({ blurb: z.string().optional() }))
    .optional()
    .describe("Per-section blurbs, keyed by section id"),
  translations: z
    .record(languageTagSchema, siteMetadataTranslationSchema)
    .optional()
    .describe("Title, description, copyright, and CTA per language tag"),
});

type SiteInfoBody = z.infer<typeof siteInfoBodySchema>;
```

`site-info` is a singleton declared with `defineEntity`, whose metadata is this schema. The site's canonical URL comes from the brain's configuration, not from site-info. The file states the CTA as flat `ctaHeading`, `ctaButtonText`, and `ctaButtonLink` header keys, and the CTA subtitle, section blurbs, and translations as body sections.

Managed by: `@brains/site-info`; consumed by `@brains/site-builder-plugin`.

**Note**: The four singleton types serve distinct purposes:

- **brain-character**: AI personality and behavior (brain's name, role, purpose, values)
- **anchor-profile**: Public presence of the person, team, or organization behind the brain
- **style-guide**: Durable voice and visual guidance for generation
- **site-info**: Optional website channel configuration and represented-identity selection

At runtime, site-info defaults `represents` to `anchor` and derives omitted title and description values from the represented singleton. Site-builder composes anchor social links only for anchor-representing sites; brain-representing sites do not silently inherit anchor presentation data.

### Plugin Entity Types

These entity types are defined by plugins for specific features:

#### LinkEntity

Web content capture with AI extraction. The body is the extracted summary; the metadata is the link's frontmatter:

```typescript
const linkMetadataSchema = z.object({
  status: z.enum(["pending", "draft", "published"]),
  title: z.string(),
  url: z.string().url(),
  description: z.string().optional(),
  capturedAt: z.string().datetime(),
  source: z.object({ ref: z.string(), label: z.string() }),
});

const link = defineEntity({
  type: "link",
  purpose: "A saved external URL or web resource captured for later reference.",
  metadata: linkMetadataSchema,
});

type LinkEntity = EntityOf<typeof link>;
```

### SummaryEntity

Narrative conversation summaries. All conversation context lives in a typed `metadata` object; the body holds the chronological summary entries:

```typescript
const summaryMetadataSchema = z.object({
  channelId: z.string(),
  channelName: z.string().optional(),
  interfaceType: z.string(),
  timeRange: summaryTimeRangeSchema.optional(),
  messageCount: z.number().int().min(0),
  participants: z.array(summaryParticipantSchema).optional(),
  sourceHash: z.string(),
});

const summary = defineEntity({
  type: "summary",
  purpose:
    "A read-only, system-maintained summary derived from stored conversation messages.",
  metadata: summaryMetadataSchema,
});

type SummaryEntity = EntityOf<typeof summary>;
```

Older summaries may still carry `conversationId`, `entryCount`, and `projectionVersion`; those fields are retired.

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

-- embeddings.db: the embedding model the vectors came from
CREATE TABLE embedding_meta (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  model TEXT NOT NULL,
  dimensions INTEGER NOT NULL,
  prompt_revision INTEGER NOT NULL
);

-- embeddings.db: separate database for vector storage
CREATE TABLE embeddings (
  entity_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  embedding F32_BLOB(<dimensions>) NOT NULL,  -- size from embedding_meta
  content_hash TEXT NOT NULL,
  PRIMARY KEY(entity_id, entity_type)
);
```

The vector size comes from the embedding provider and is recorded in `embedding_meta`. A database written before the table existed is read as the legacy `openai:text-embedding-3-small` model at 1536 dimensions. When the model, dimensions, or prompt revision change, the brain drops the embeddings table and re-embeds every entity.

Search queries ATTACH the embedding DB and join across for hybrid vector + keyword scoring.

Binary content lives in `brain.db` beside the entities: `asset_uploads` and `asset_chunks` stage bytes in 1 MiB chunks, and `assets` publishes each one under its SHA-256 digest. An image or document entity's `content` is the `asset://sha256/<digest>` reference.

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

An entity package's types register when the package is installed:

```typescript
// An entity package (entities/<name>/src/index.ts)
const faq = defineEntity({
  type: "faq",
  purpose: "A question the brain answers, with its answer.",
  metadata: faqMetadataSchema,
});

export default defineEntityPackage({ id: "faq", entities: [faq] });

// Installing it registers, per declared type:
// - the entity type, its schema and its markdown adapter
// - its generation handler (`<type>:generation`), when it declares generation
// - its templates and data sources
// - its scheduler-owned projection rules
```

## Best Practices

### Schema Design

1. **Declare metadata, not the entity**: `defineEntity` adds the base fields; the schema describes only `metadata`
2. **Keep the header flat**: metadata the file states in its header is scalars or lists of scalars; structured fields go in body sections through a codec
3. **Provide defaults**: Use `.default()` for optional fields
4. **Keep schemas simple**: Complex validation in business logic, not schemas

### Entity Definitions

1. **Write one purpose sentence**: the model reads it to choose an `entityType`
2. **Let the runtime create entities**: ids, timestamps, and validation come from the entity service
3. **Declare behavior on the definition**: templates, create routes, generation, and jobs belong on the declaration
4. **Export the definition**: other packages read and write the type through it

### Codecs

1. **Handle missing data**: Provide sensible defaults in `decode`
2. **Preserve metadata**: Round-trip all entity properties through the stored document
3. **Read old forms**: `decode` accepts the previous form of a renamed or moved field; `encode` writes only the current one
4. **Keep stateless**: No instance state in codecs or adapters

### Testing

1. **Test schemas**: Validate schema parsing and error handling
2. **Test definitions**: Ensure entities persist and read back as declared
3. **Test codecs**: Verify markdown round-trip consistency
4. **Mock dependencies**: Use dependency injection for testability

This declarative approach provides type safety, validation, and flexibility while avoiding the complexity of class hierarchies.
