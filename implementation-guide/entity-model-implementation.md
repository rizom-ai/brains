# Entity Model Implementation Guide

This guide provides detailed steps for implementing the unified entity model in the Personal Brain rebuild project.

## Overview

The unified entity model is already implemented in the shell package. This guide explains how to create new entity types (like Note, Task, Profile) that work with the existing infrastructure.

## Current State

The shell package already provides:

- **EntityRegistry**: For registering entity types and adapters
- **EntityService**: For CRUD operations and search
- **EntityAdapter interface**: For markdown serialization (currently requires `fromMarkdown` only)
- **Database schema**: SQLite tables with vector support

## Prerequisites

1. The shell infrastructure is already set up
2. Review the entity model documentation in `../docs/entity-model.md`
3. Understand that entities are stored as markdown with YAML frontmatter

## Implementation Steps

### 1. Create a Context Plugin Directory

Context plugins live within the shell package. To add a new entity type (e.g., Note):

```bash
# Create the context directory
mkdir -p packages/shell/src/contexts/note
```

### 2. Define the Entity Type

Create the entity schema and factory function:

```typescript
// packages/shell/src/contexts/note/noteEntity.ts
import { z } from "zod";
import { nanoid } from "nanoid";
import { baseEntitySchema } from "@personal-brain/shell";

// Define entity-specific schema
export const noteSchema = baseEntitySchema.extend({
  entityType: z.literal("note"),
  category: z.string().optional(),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
});

// Pure data type (no methods)
export type Note = z.infer<typeof noteSchema>;

// Factory function
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

**Note**: The current shell implementation still expects entities to implement `IContentModel` with `toMarkdown()`. This will need to be updated to support pure data entities.

### 3. Create an Entity Adapter

Create an adapter that implements the EntityAdapter interface:

```typescript
import matter from "gray-matter";
import type { EntityAdapter } from "@personal-brain/shell/src/entity/entityRegistry";
import type { Note } from "./noteEntity";
import { createNote } from "./noteEntity";

export class NoteAdapter implements EntityAdapter<Note> {
  fromMarkdown(markdown: string, metadata?: Record<string, unknown>): Note {
    const { data, content } = matter(markdown);
    const parsedData = metadata ?? data;

    // Extract title from content if not in frontmatter
    let title = parsedData["title"] as string;
    let noteContent = content.trim();

    if (!title) {
      const match = noteContent.match(/^#\s+(.+)$/m);
      if (match) {
        title = match[1];
        noteContent = noteContent.replace(/^#\s+.+\n?/, "").trim();
      }
    }

    return createNote({
      id: parsedData["id"] as string,
      title: title || "Untitled",
      content: noteContent,
      tags: Array.isArray(parsedData["tags"]) ? parsedData["tags"] : [],
      category: parsedData["category"] as string,
      priority:
        (parsedData["priority"] as "low" | "medium" | "high") || "medium",
    });
  }

  /**
   * Convert entity to markdown
   * @param entity Entity instance
   * @returns Markdown string with frontmatter
   */
  toMarkdown(entity: T): string;

  /**
   * Validate entity against schema
   * @param entity Entity to validate
   * @returns True if valid, false otherwise
   */
  validateEntity(entity: T): boolean;

  /**
   * Extract metadata from entity for search/filtering
   * @param entity Entity instance
   * @returns Metadata record
   */
  extractMetadata(entity: T): Record<string, unknown>;

  /**
   * Format entity for inclusion in AI prompts
   * @param entity Entity instance
   * @returns Formatted string
   */
  formatForPrompt(entity: T): string;
}
```

### 3. Create Markdown Utilities

Implement utilities for working with markdown and frontmatter.

Create `src/entity/markdownUtils.ts`:

```typescript
import matter from "gray-matter";

/**
 * Extract frontmatter from markdown
 * @param markdown Markdown content with optional frontmatter
 * @returns Object with data (frontmatter) and content
 */
export function extractFrontmatter(markdown: string): {
  data: Record<string, unknown>;
  content: string;
} {
  return matter(markdown);
}

/**
 * Add frontmatter to markdown content
 * @param content Markdown content without frontmatter
 * @param data Frontmatter data
 * @returns Markdown with frontmatter
 */
export function addFrontmatter(
  content: string,
  data: Record<string, unknown>,
): string {
  const result = matter.stringify(content, data);
  return result;
}

/**
 * Convert entity metadata to frontmatter-compatible format
 * Ensures all values are JSON-serializable
 * @param metadata Entity metadata
 * @returns Frontmatter-compatible metadata
 */
export function prepareFrontmatter(
  metadata: Record<string, unknown>,
): Record<string, unknown> {
  // Convert any complex objects to strings if necessary
  return Object.entries(metadata).reduce(
    (result, [key, value]) => {
      if (value instanceof Date) {
        result[key] = value.toISOString();
      } else if (typeof value === "object" && value !== null) {
        result[key] = JSON.stringify(value);
      } else {
        result[key] = value;
      }
      return result;
    },
    {} as Record<string, unknown>,
  );
}
```

### 4. Implement Abstract EntityAdapter Base Class

Create a base class that implements common functionality for all entity adapters.

Create `src/entity/baseEntityAdapter.ts`:

```typescript
import { z } from "zod";
import { BaseEntity } from "../types/entity";
import { EntityAdapter } from "./entityAdapter";
import {
  extractFrontmatter,
  addFrontmatter,
  prepareFrontmatter,
} from "./markdownUtils";

/**
 * Abstract base class for entity adapters
 * Implements common functionality for all entity adapters
 */
export abstract class BaseEntityAdapter<T extends BaseEntity>
  implements EntityAdapter<T>
{
  /**
   * Schema for validating entity
   */
  protected abstract schema: z.ZodType<T>;

  /**
   * Entity type
   */
  protected abstract entityType: string;

  /**
   * Create an entity from markdown
   * @param markdown Markdown with optional frontmatter
   * @returns Entity instance
   */
  fromMarkdown(markdown: string): T {
    const { data, content } = extractFrontmatter(markdown);

    // Convert frontmatter to entity properties
    const entity: Partial<T> = {
      ...data,
      content,
      type: this.entityType,
    } as Partial<T>;

    // Validate with schema
    const validated = this.schema.parse(entity);
    return validated;
  }

  /**
   * Convert entity to markdown
   * @param entity Entity instance
   * @returns Markdown with frontmatter
   */
  toMarkdown(entity: T): string {
    // Extract content from entity
    const { content = "", ...rest } = entity;

    // Prepare frontmatter
    const frontmatter = prepareFrontmatter(rest);

    // Create markdown with frontmatter
    return addFrontmatter(content, frontmatter);
  }

  /**
   * Validate entity against schema
   * @param entity Entity to validate
   * @returns True if valid
   */
  validateEntity(entity: T): boolean {
    try {
      this.schema.parse(entity);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Extract searchable metadata from entity
   * @param entity Entity instance
   * @returns Metadata record
   */
  extractMetadata(entity: T): Record<string, unknown> {
    // Default implementation extracts standard fields
    const { content, ...metadata } = entity;
    return metadata;
  }

  /**
   * Format entity for inclusion in AI prompts
   * @param entity Entity instance
   * @returns Formatted string
   */
  formatForPrompt(entity: T): string {
    // Default implementation creates a simple text representation
    let result = "";

    if (entity.title) {
      result += `# ${entity.title}\n\n`;
    }

    if (entity.tags && entity.tags.length > 0) {
      result += `Tags: ${entity.tags.join(", ")}\n\n`;
    }

    if (entity.content) {
      result += entity.content;
    }

    return result;
  }
}
```

### 5. Implement EntityRegistry

Create the registry responsible for managing entity adapters.

Create `src/entity/entityRegistry.ts`:

```typescript
import { Logger } from "../utils/logger";
import { BaseEntity } from "../types/entity";
import { EntityAdapter } from "./entityAdapter";

/**
 * Registry for entity adapters
 * Manages registration and retrieval of entity adapters by type
 */
export class EntityRegistry {
  private static instance: EntityRegistry | null = null;
  private adapters: Map<string, EntityAdapter<any>> = new Map();
  private logger = Logger.getInstance();

  /**
   * Get the singleton instance
   */
  static getInstance(): EntityRegistry {
    if (!EntityRegistry.instance) {
      EntityRegistry.instance = new EntityRegistry();
    }
    return EntityRegistry.instance;
  }

  /**
   * Reset the singleton instance (for testing)
   */
  static resetInstance(): void {
    EntityRegistry.instance = null;
  }

  /**
   * Create a fresh instance (for testing)
   */
  static createFresh(): EntityRegistry {
    return new EntityRegistry();
  }

  /**
   * Private constructor enforces singleton pattern
   */
  private constructor() {}

  /**
   * Register an entity adapter for a specific type
   * @param type Entity type
   * @param adapter Adapter for the entity type
   */
  registerAdapter<T extends BaseEntity>(
    type: string,
    adapter: EntityAdapter<T>,
  ): void {
    if (this.adapters.has(type)) {
      this.logger.warn(
        `Adapter for type '${type}' already registered. Overwriting.`,
      );
    }

    this.adapters.set(type, adapter);
    this.logger.debug(`Registered adapter for entity type: ${type}`);
  }

  /**
   * Get adapter for entity type
   * @param type Entity type
   * @returns Entity adapter
   * @throws Error if adapter not found
   */
  getAdapter<T extends BaseEntity>(type: string): EntityAdapter<T> {
    const adapter = this.adapters.get(type) as EntityAdapter<T>;

    if (!adapter) {
      throw new Error(`No adapter registered for entity type: ${type}`);
    }

    return adapter;
  }

  /**
   * Check if adapter exists for type
   * @param type Entity type
   * @returns True if adapter exists
   */
  hasAdapter(type: string): boolean {
    return this.adapters.has(type);
  }

  /**
   * Get all registered entity types
   * @returns Array of entity types
   */
  getEntityTypes(): string[] {
    return Array.from(this.adapters.keys());
  }
}
```

### 6. Implement EntityService

Create the service responsible for entity operations.

Create `src/entity/entityService.ts`:

```typescript
import { v4 as uuidv4 } from "uuid";
import { BaseEntity, Entity, EntitySearchOptions } from "../types/entity";
import { EntityAdapter } from "./entityAdapter";
import { EntityRegistry } from "./entityRegistry";
import { DbClient } from "../db";
import { ResourceRegistry } from "../resources/resourceRegistry";
import { Logger } from "../utils/logger";

/**
 * Configuration for EntityService
 */
export interface EntityServiceConfig {
  entityRegistry?: EntityRegistry;
  dbClient?: DbClient;
  resourceRegistry?: ResourceRegistry;
}

/**
 * Service for entity operations
 * Provides a unified interface for working with entities
 */
export class EntityService {
  private static instance: EntityService | null = null;
  private entityRegistry: EntityRegistry;
  private dbClient: DbClient;
  private resourceRegistry: ResourceRegistry;
  private logger = Logger.getInstance();

  /**
   * Get the singleton instance
   */
  static getInstance(config: EntityServiceConfig = {}): EntityService {
    if (!EntityService.instance) {
      EntityService.instance = new EntityService(config);
    }
    return EntityService.instance;
  }

  /**
   * Reset the singleton instance (for testing)
   */
  static resetInstance(): void {
    EntityService.instance = null;
  }

  /**
   * Create a fresh instance (for testing)
   */
  static createFresh(config: EntityServiceConfig = {}): EntityService {
    return new EntityService(config);
  }

  /**
   * Private constructor enforces singleton pattern
   */
  private constructor(config: EntityServiceConfig) {
    this.entityRegistry = config.entityRegistry || EntityRegistry.getInstance();
    this.dbClient = config.dbClient || DbClient.getInstance();
    this.resourceRegistry =
      config.resourceRegistry || ResourceRegistry.getInstance();
  }

  /**
   * Create a new entity
   * @param type Entity type
   * @param data Entity data
   * @returns Created entity
   */
  async createEntity<T extends BaseEntity>(
    type: string,
    data: Partial<T>,
  ): Promise<T> {
    // Get adapter for entity type
    const adapter = this.entityRegistry.getAdapter<T>(type);

    // Create entity with defaults
    const now = new Date().toISOString();
    const entity = {
      id: uuidv4(),
      type,
      created: now,
      updated: now,
      ...data,
    } as T;

    // Validate entity
    if (!adapter.validateEntity(entity)) {
      throw new Error(`Invalid entity data for type: ${type}`);
    }

    // Convert to markdown
    const markdown = adapter.toMarkdown(entity);

    // Store in database
    await this.dbClient.storeEntity(entity.id, type, markdown);

    // Generate and store embedding if content is available
    if (entity.content) {
      const embedding = await this.generateEmbedding(entity.content);
      await this.dbClient.storeEmbedding(entity.id, embedding);
    }

    return entity;
  }

  /**
   * Get entity by ID
   * @param id Entity ID
   * @returns Entity or null if not found
   */
  async getEntity<T extends BaseEntity>(id: string): Promise<T | null> {
    // Get entity from database
    const result = await this.dbClient.getEntity(id);

    if (!result) {
      return null;
    }

    // Get adapter for entity type
    const adapter = this.entityRegistry.getAdapter<T>(result.type);

    // Convert from markdown
    const entity = adapter.fromMarkdown(result.markdown) as T;

    // Get embedding if requested
    const embedding = await this.dbClient.getEmbedding(id);
    if (embedding) {
      (entity as unknown as Entity).embedding = embedding;
    }

    return entity;
  }

  /**
   * Update an entity
   * @param id Entity ID
   * @param data Updated entity data
   * @returns Updated entity
   */
  async updateEntity<T extends BaseEntity>(
    id: string,
    data: Partial<T>,
  ): Promise<T> {
    // Get existing entity
    const existing = await this.getEntity<T>(id);

    if (!existing) {
      throw new Error(`Entity not found: ${id}`);
    }

    // Get adapter for entity type
    const adapter = this.entityRegistry.getAdapter<T>(existing.type);

    // Update entity
    const updated = {
      ...existing,
      ...data,
      updated: new Date().toISOString(),
    } as T;

    // Validate updated entity
    if (!adapter.validateEntity(updated)) {
      throw new Error(`Invalid entity data for type: ${existing.type}`);
    }

    // Convert to markdown
    const markdown = adapter.toMarkdown(updated);

    // Store in database
    await this.dbClient.storeEntity(id, existing.type, markdown);

    // Update embedding if content changed
    if (data.content && data.content !== existing.content) {
      const embedding = await this.generateEmbedding(data.content);
      await this.dbClient.storeEmbedding(id, embedding);
    }

    return updated;
  }

  /**
   * Delete an entity
   * @param id Entity ID
   * @returns True if deleted
   */
  async deleteEntity(id: string): Promise<boolean> {
    // Delete from database
    const deleted = await this.dbClient.deleteEntity(id);

    // Delete embedding
    await this.dbClient.deleteEmbedding(id);

    return deleted;
  }

  /**
   * Search for entities
   * @param query Search query
   * @param options Search options
   * @returns Matching entities
   */
  async searchEntities<T extends BaseEntity>(
    query: string,
    options: EntitySearchOptions = {},
  ): Promise<T[]> {
    // Generate embedding for query
    const queryEmbedding = await this.generateEmbedding(query);

    // Search by embedding
    const results = await this.dbClient.searchByEmbedding(
      queryEmbedding,
      options.limit || 10,
      options.entityTypes,
    );

    // Load entities
    const entities: T[] = [];
    for (const result of results) {
      const entity = await this.getEntity<T>(result.id);
      if (entity) {
        // Add embedding if requested
        if (options.includeEmbeddings) {
          (entity as unknown as Entity).embedding = result.embedding;
        }

        entities.push(entity);
      }
    }

    return entities;
  }

  /**
   * Get adapter for entity type
   * @param type Entity type
   * @returns Entity adapter
   */
  getAdapterForType<T extends BaseEntity>(type: string): EntityAdapter<T> {
    return this.entityRegistry.getAdapter<T>(type);
  }

  /**
   * Get all supported entity types
   * @returns Array of entity types
   */
  getSupportedEntityTypes(): string[] {
    return this.entityRegistry.getEntityTypes();
  }

  /**
   * Generate embedding for text
   * @param text Text to embed
   * @returns Embedding vector
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    const embeddings = this.resourceRegistry.getEmbeddingService();
    return embeddings.createEmbedding(text);
  }

  /**
   * Calculate cosine similarity between vectors
   * @param a First vector
   * @param b Second vector
   * @returns Similarity score (0-1)
   */
  private calculateSimilarity(a: number[], b: number[]): number {
    // Delegate to AI service
    const ai = this.resourceRegistry.getAiService();
    return ai.calculateSimilarity(a, b);
  }
}
```

### 7. Implement Basic Database Client

Create a simplified database client for storing entities.

Create `src/db/client.ts`:

```typescript
import { db } from "./index";
import { entities, embeddings } from "./schema";
import { eq, and } from "drizzle-orm";
import { Logger } from "../utils/logger";

/**
 * Database client for entity operations
 */
export class DbClient {
  private static instance: DbClient | null = null;
  private logger = Logger.getInstance();

  /**
   * Get the singleton instance
   */
  static getInstance(): DbClient {
    if (!DbClient.instance) {
      DbClient.instance = new DbClient();
    }
    return DbClient.instance;
  }

  /**
   * Reset the singleton instance (for testing)
   */
  static resetInstance(): void {
    DbClient.instance = null;
  }

  /**
   * Create a fresh instance (for testing)
   */
  static createFresh(): DbClient {
    return new DbClient();
  }

  /**
   * Private constructor enforces singleton pattern
   */
  private constructor() {}

  /**
   * Store entity in database
   * @param id Entity ID
   * @param type Entity type
   * @param markdown Markdown representation
   */
  async storeEntity(id: string, type: string, markdown: string): Promise<void> {
    try {
      // Check if entity exists
      const existing = await db
        .select()
        .from(entities)
        .where(eq(entities.id, id))
        .execute();

      if (existing.length > 0) {
        // Update existing entity
        await db
          .update(entities)
          .set({
            type,
            markdown,
            updated: new Date().toISOString(),
          })
          .where(eq(entities.id, id))
          .execute();
      } else {
        // Insert new entity
        await db
          .insert(entities)
          .values({
            id,
            type,
            markdown,
            created: new Date().toISOString(),
            updated: new Date().toISOString(),
          })
          .execute();
      }
    } catch (error) {
      this.logger.error(`Error storing entity: ${error}`);
      throw error;
    }
  }

  /**
   * Get entity from database
   * @param id Entity ID
   * @returns Entity or null if not found
   */
  async getEntity(
    id: string,
  ): Promise<{ id: string; type: string; markdown: string } | null> {
    try {
      const result = await db
        .select()
        .from(entities)
        .where(eq(entities.id, id))
        .execute();

      if (result.length === 0) {
        return null;
      }

      return {
        id: result[0].id,
        type: result[0].type,
        markdown: result[0].markdown,
      };
    } catch (error) {
      this.logger.error(`Error getting entity: ${error}`);
      throw error;
    }
  }

  /**
   * Delete entity from database
   * @param id Entity ID
   * @returns True if deleted
   */
  async deleteEntity(id: string): Promise<boolean> {
    try {
      const result = await db
        .delete(entities)
        .where(eq(entities.id, id))
        .execute();

      return result.rowsAffected > 0;
    } catch (error) {
      this.logger.error(`Error deleting entity: ${error}`);
      throw error;
    }
  }

  /**
   * Store embedding for entity
   * @param entityId Entity ID
   * @param embedding Embedding vector
   */
  async storeEmbedding(entityId: string, embedding: number[]): Promise<void> {
    try {
      // Check if embedding exists
      const existing = await db
        .select()
        .from(embeddings)
        .where(eq(embeddings.entityId, entityId))
        .execute();

      if (existing.length > 0) {
        // Update existing embedding
        await db
          .update(embeddings)
          .set({
            embedding: JSON.stringify(embedding),
            updated: new Date().toISOString(),
          })
          .where(eq(embeddings.entityId, entityId))
          .execute();
      } else {
        // Insert new embedding
        await db
          .insert(embeddings)
          .values({
            entityId,
            embedding: JSON.stringify(embedding),
            created: new Date().toISOString(),
            updated: new Date().toISOString(),
          })
          .execute();
      }
    } catch (error) {
      this.logger.error(`Error storing embedding: ${error}`);
      throw error;
    }
  }

  /**
   * Get embedding for entity
   * @param entityId Entity ID
   * @returns Embedding vector or null if not found
   */
  async getEmbedding(entityId: string): Promise<number[] | null> {
    try {
      const result = await db
        .select()
        .from(embeddings)
        .where(eq(embeddings.entityId, entityId))
        .execute();

      if (result.length === 0) {
        return null;
      }

      return JSON.parse(result[0].embedding);
    } catch (error) {
      this.logger.error(`Error getting embedding: ${error}`);
      throw error;
    }
  }

  /**
   * Delete embedding for entity
   * @param entityId Entity ID
   * @returns True if deleted
   */
  async deleteEmbedding(entityId: string): Promise<boolean> {
    try {
      const result = await db
        .delete(embeddings)
        .where(eq(embeddings.entityId, entityId))
        .execute();

      return result.rowsAffected > 0;
    } catch (error) {
      this.logger.error(`Error deleting embedding: ${error}`);
      throw error;
    }
  }

  /**
   * Search entities by embedding similarity
   * @param queryEmbedding Query embedding
   * @param limit Maximum number of results
   * @param entityTypes Entity types to include
   * @returns Matching entities with embeddings
   */
  async searchByEmbedding(
    queryEmbedding: number[],
    limit: number = 10,
    entityTypes?: string[],
  ): Promise<Array<{ id: string; score: number; embedding: number[] }>> {
    try {
      // For simplicity, we'll implement a basic version here
      // In a real implementation, this would use a vector database or optimized query

      // Get all embeddings
      let query = db
        .select()
        .from(embeddings)
        .innerJoin(entities, eq(embeddings.entityId, entities.id));

      // Filter by entity types if provided
      if (entityTypes && entityTypes.length > 0) {
        // Create a condition for each entity type
        const typeConditions = entityTypes.map((type) =>
          eq(entities.type, type),
        );

        // Combine with OR
        if (typeConditions.length === 1) {
          query = query.where(typeConditions[0]);
        } else {
          // This is a simplified approach - in practice you'd use more sophisticated filtering
          // For complex conditions, you'd typically use SQL's IN operator
        }
      }

      const results = await query.execute();

      // Calculate similarity scores
      const scoredResults = results.map((result) => {
        const embedding = JSON.parse(result.embeddings.embedding) as number[];
        // Calculate cosine similarity
        // This is a placeholder - in practice, you'd use a library or database function
        const score = this.calculateCosineSimilarity(queryEmbedding, embedding);

        return {
          id: result.entities.id,
          score,
          embedding,
        };
      });

      // Sort by score (descending) and limit results
      return scoredResults.sort((a, b) => b.score - a.score).slice(0, limit);
    } catch (error) {
      this.logger.error(`Error searching by embedding: ${error}`);
      throw error;
    }
  }

  /**
   * Calculate cosine similarity between vectors
   * @param a First vector
   * @param b Second vector
   * @returns Similarity score (0-1)
   */
  private calculateCosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error("Vectors must have the same length");
    }

    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      magnitudeA += a[i] * a[i];
      magnitudeB += b[i] * b[i];
    }

    magnitudeA = Math.sqrt(magnitudeA);
    magnitudeB = Math.sqrt(magnitudeB);

    if (magnitudeA === 0 || magnitudeB === 0) {
      return 0;
    }

    return dotProduct / (magnitudeA * magnitudeB);
  }
}
```

### 8. Create Sample Entity Adapter Implementation

Implement a specific adapter as a reference.

Create `src/entity/noteEntityAdapter.ts`:

```typescript
import { z } from "zod";
import { BaseEntityAdapter } from "./baseEntityAdapter";
import { EntityAdapter } from "./entityAdapter";

/**
 * Note entity interface
 */
export interface NoteEntity {
  id: string;
  type: string;
  title: string;
  content: string;
  created: string;
  updated: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  readingTime?: number;
}

/**
 * Schema for validating note entities
 */
export const noteEntitySchema = z.object({
  id: z.string().min(1, "ID is required"),
  type: z.literal("note"),
  title: z.string().min(1, "Title is required"),
  content: z.string(),
  created: z.string().datetime(),
  updated: z.string().datetime(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
  readingTime: z.number().optional(),
});

/**
 * Adapter for note entities
 */
export class NoteEntityAdapter
  extends BaseEntityAdapter<NoteEntity>
  implements EntityAdapter<NoteEntity>
{
  protected schema = noteEntitySchema;
  protected entityType = "note";

  /**
   * Get singleton instance
   */
  private static instance: NoteEntityAdapter | null = null;

  static getInstance(): NoteEntityAdapter {
    if (!NoteEntityAdapter.instance) {
      NoteEntityAdapter.instance = new NoteEntityAdapter();
    }
    return NoteEntityAdapter.instance;
  }

  /**
   * Reset singleton instance (for testing)
   */
  static resetInstance(): void {
    NoteEntityAdapter.instance = null;
  }

  /**
   * Create fresh instance (for testing)
   */
  static createFresh(): NoteEntityAdapter {
    return new NoteEntityAdapter();
  }

  /**
   * Private constructor enforces singleton
   */
  private constructor() {
    super();
  }

  /**
   * Override fromMarkdown to handle reading time
   */
  fromMarkdown(markdown: string): NoteEntity {
    const entity = super.fromMarkdown(markdown);

    // Calculate reading time if not already set
    if (!entity.readingTime && entity.content) {
      entity.readingTime = this.calculateReadingTime(entity.content);
    }

    return entity;
  }

  /**
   * Extract specific metadata for notes
   */
  extractMetadata(entity: NoteEntity): Record<string, unknown> {
    const metadata = super.extractMetadata(entity);

    // Add reading time if not present
    if (!metadata.readingTime && entity.content) {
      metadata.readingTime = this.calculateReadingTime(entity.content);
    }

    return metadata;
  }

  /**
   * Format note specifically for AI prompts
   */
  formatForPrompt(entity: NoteEntity): string {
    let result = `# ${entity.title}\n\n`;

    if (entity.tags && entity.tags.length > 0) {
      result += `Tags: ${entity.tags.join(", ")}\n\n`;
    }

    if (entity.readingTime) {
      result += `Reading time: ${Math.round(entity.readingTime)} min\n\n`;
    }

    if (entity.content) {
      result += entity.content;
    }

    return result;
  }

  /**
   * Calculate reading time in minutes
   * @param text Content text
   * @returns Reading time in minutes
   */
  private calculateReadingTime(text: string): number {
    const wordsPerMinute = 200; // Average reading speed
    const wordCount = text.split(/\s+/).length;
    return wordCount / wordsPerMinute;
  }
}
```

### 9. Update Database Schema

Ensure your database schema supports the entity model.

Update `src/db/schema.ts`:

```typescript
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

/**
 * Entities table
 * Stores all entities with their markdown representation
 */
export const entities = sqliteTable("entities", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  markdown: text("markdown").notNull(),
  created: text("created").notNull(),
  updated: text("updated").notNull(),
});

/**
 * Embeddings table
 * Stores vector embeddings for entities
 */
export const embeddings = sqliteTable("embeddings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  entityId: text("entity_id")
    .notNull()
    .references(() => entities.id, { onDelete: "cascade" }),
  embedding: text("embedding").notNull(), // JSON string of vector
  created: text("created").notNull(),
  updated: text("updated").notNull(),
});

/**
 * Entity tags table
 * For efficient tag-based querying
 */
export const entityTags = sqliteTable("entity_tags", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  entityId: text("entity_id")
    .notNull()
    .references(() => entities.id, { onDelete: "cascade" }),
  tag: text("tag").notNull(),
});
```

### 10. Register Adapters in Application Startup

In the application startup code, register all entity adapters.

Update `src/app.ts` to include:

```typescript
// Import entity adapters
import { EntityRegistry } from "./entity/entityRegistry";
import { NoteEntityAdapter } from "./entity/noteEntityAdapter";
// Import other entity adapters as needed

/**
 * Register entity adapters
 */
function registerEntityAdapters(): void {
  const entityRegistry = EntityRegistry.getInstance();

  // Register note adapter
  entityRegistry.registerAdapter("note", NoteEntityAdapter.getInstance());

  // Register other entity adapters as needed
  // entityRegistry.registerAdapter('profile', ProfileEntityAdapter.getInstance());
}

/**
 * Initialize application
 */
export async function initializeApp(): Promise<void> {
  // Register entity adapters
  registerEntityAdapters();

  // Other initialization...
}
```

## Testing the Entity Model

Follow these steps to verify your implementation:

1. Create unit tests for each component
2. Create integration tests that exercise the complete entity lifecycle
3. Verify serialization to/from markdown works correctly
4. Test embedding generation and similarity search
5. Benchmark performance with a large number of entities

See `testing-guide.md` for detailed testing guidelines.

## Next Steps

After implementing the entity model:

1. Create specific entity adapters for each entity type (profile, etc.)
2. Implement the plugin system that uses the entity model
3. Develop contexts that leverage the unified entity approach
4. Connect the entity model to the query processor

For guidance on building contexts using the entity model, see `skeleton-implementation.md` and `app-integration.md`.

## Troubleshooting

Common issues and solutions:

1. **Schema validation errors**: Ensure entity properties match the schema definition
2. **Embedding generation failures**: Check AI service configuration
3. **Database errors**: Verify schema migrations have run correctly
4. **Performance issues**: Consider adding indices for common query patterns
5. **Search quality problems**: Adjust embedding generation parameters or chunk size

## Reference Implementation

For a complete reference implementation, see the sample code in `../sample-code/note-context/src/entity/`.

This sample provides a working implementation of a Note entity adapter and demonstrates how to integrate with the entity model.
