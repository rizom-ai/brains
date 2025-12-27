import type { EntityDB } from "./db";
import type { BaseEntity } from "./types";
import { entities } from "./schema/entities";
import { eq, and, desc, asc, sql, type SQL } from "drizzle-orm";
import { z } from "@brains/utils";
import type { Logger } from "@brains/utils";
import type { EntitySerializer } from "./entity-serializer";

/**
 * Schema for sort field
 */
const sortFieldSchema = z.object({
  field: z.string(),
  direction: z.enum(["asc", "desc"]),
});

/**
 * Schema for list entities options
 */
const listOptionsSchema = z.object({
  limit: z.number().int().positive().optional().default(20),
  offset: z.number().int().min(0).optional().default(0),
  sortFields: z.array(sortFieldSchema).optional(),
  filter: z
    .object({
      metadata: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
  /** Filter to only entities with metadata.status = "published" */
  publishedOnly: z.boolean().optional(),
});

type ListOptions = z.input<typeof listOptionsSchema>;

/**
 * EntityQueries handles database query operations for entities
 * Extracted from EntityService for single responsibility
 */
export class EntityQueries {
  private db: EntityDB;
  private serializer: EntitySerializer;
  private logger: Logger;

  constructor(db: EntityDB, serializer: EntitySerializer, logger: Logger) {
    this.db = db;
    this.serializer = serializer;
    this.logger = logger.child("EntityQueries");
  }

  /**
   * Get an entity by ID from database
   */
  public async getEntityData(
    entityType: string,
    id: string,
  ): Promise<{
    id: string;
    entityType: string;
    content: string;
    contentHash: string;
    created: number;
    updated: number;
    metadata: Record<string, unknown>;
  } | null> {
    this.logger.debug(`Getting entity of type ${entityType} with ID ${id}`);

    // Query database
    const result = await this.db
      .select()
      .from(entities)
      .where(and(eq(entities.id, id), eq(entities.entityType, entityType)))
      .limit(1);

    if (result.length === 0) {
      this.logger.debug(`Entity of type ${entityType} with ID ${id} not found`);
      return null;
    }

    const entityData = result[0];
    if (!entityData) {
      return null;
    }

    return {
      id: entityData.id,
      entityType: entityData.entityType,
      content: entityData.content,
      contentHash: entityData.contentHash,
      created: entityData.created,
      updated: entityData.updated,
      metadata: (entityData.metadata as Record<string, unknown> | null) ?? {},
    };
  }

  /**
   * List entities by type with pagination
   */
  public async listEntities<T extends BaseEntity>(
    entityType: string,
    options: ListOptions = {},
  ): Promise<T[]> {
    const validatedOptions = listOptionsSchema.parse(options);
    const { limit, offset, sortFields, filter, publishedOnly } =
      validatedOptions;

    this.logger.debug(
      `Listing entities of type ${entityType} (limit: ${limit}, offset: ${offset}, filter: ${JSON.stringify(filter)}, publishedOnly: ${publishedOnly})`,
    );

    // Build where conditions
    const whereConditions = [eq(entities.entityType, entityType)];

    // Handle publishedOnly filter (filters on metadata.status = "published")
    if (publishedOnly) {
      whereConditions.push(
        sql`json_extract(${entities.metadata}, '$.status') = 'published'`,
      );
    }

    // Handle metadata filters
    if (filter?.metadata) {
      // For each metadata filter, add a JSON query condition
      for (const [key, value] of Object.entries(filter.metadata)) {
        if (value !== undefined) {
          // SQLite JSON query: json_extract(metadata, '$.key') = value
          const jsonPath = `$.${key}`;
          whereConditions.push(
            sql`json_extract(${entities.metadata}, ${jsonPath}) = ${value}`,
          );
        }
      }
    }

    // Build order by clauses
    const orderByClauses = this.buildOrderByClauses(sortFields);

    // Query database
    const query = this.db
      .select()
      .from(entities)
      .where(and(...whereConditions))
      .limit(limit)
      .offset(offset)
      .orderBy(...orderByClauses);

    const result = await query;

    // Convert from database format to entities
    const entityList = await this.serializer.convertToEntities<T>(
      result.map((row) => ({
        id: row.id,
        entityType: row.entityType,
        content: row.content,
        contentHash: row.contentHash,
        created: row.created,
        updated: row.updated,
        metadata: (row.metadata as Record<string, unknown> | null) ?? {},
      })),
      entityType,
    );

    this.logger.debug(
      `Listed ${entityList.length} entities of type ${entityType}`,
    );

    return entityList;
  }

  /**
   * Build ORDER BY clauses from sortFields
   * Supports system fields (created, updated) and metadata fields via json_extract
   */
  private buildOrderByClauses(
    sortFields?: Array<{ field: string; direction: "asc" | "desc" }>,
  ): SQL[] {
    // Default: sort by updated desc
    if (!sortFields || sortFields.length === 0) {
      return [desc(entities.updated)];
    }

    return sortFields.map(({ field, direction }) => {
      const orderFn = direction === "desc" ? desc : asc;

      // System fields
      if (field === "created") {
        return orderFn(entities.created);
      }
      if (field === "updated") {
        return orderFn(entities.updated);
      }

      // Metadata fields - use json_extract
      return orderFn(sql`json_extract(${entities.metadata}, '$.' || ${field})`);
    });
  }

  /**
   * Count entities of a specific type with optional filters
   * Used for database-level pagination
   */
  public async countEntities(
    entityType: string,
    options: {
      publishedOnly?: boolean;
      filter?: { metadata?: Record<string, unknown> };
    } = {},
  ): Promise<number> {
    const { publishedOnly, filter } = options;

    // Build where conditions (same logic as listEntities)
    const whereConditions = [eq(entities.entityType, entityType)];

    if (publishedOnly) {
      whereConditions.push(
        sql`json_extract(${entities.metadata}, '$.status') = 'published'`,
      );
    }

    if (filter?.metadata) {
      for (const [key, value] of Object.entries(filter.metadata)) {
        if (value !== undefined) {
          const jsonPath = `$.${key}`;
          whereConditions.push(
            sql`json_extract(${entities.metadata}, ${jsonPath}) = ${value}`,
          );
        }
      }
    }

    const result = await this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(entities)
      .where(and(...whereConditions));

    return Number(result[0]?.count ?? 0);
  }

  /**
   * Get entity counts grouped by type
   */
  public async getEntityCounts(): Promise<
    Array<{ entityType: string; count: number }>
  > {
    this.logger.debug("Getting entity counts by type");

    const result = await this.db
      .select({
        entityType: entities.entityType,
        count: sql<number>`COUNT(*)`.as("count"),
      })
      .from(entities)
      .groupBy(entities.entityType);

    this.logger.debug(`Found ${result.length} entity types`);

    return result.map((row) => ({
      entityType: row.entityType,
      count: Number(row.count),
    }));
  }

  /**
   * Check if entity exists
   */
  public async entityExists(entityType: string, id: string): Promise<boolean> {
    const result = await this.db
      .select({ id: entities.id })
      .from(entities)
      .where(and(eq(entities.entityType, entityType), eq(entities.id, id)))
      .limit(1);

    return result.length > 0;
  }

  /**
   * Delete an entity by type and ID
   */
  public async deleteEntity(entityType: string, id: string): Promise<boolean> {
    this.logger.debug(`Deleting entity of type ${entityType} with ID ${id}`);

    // First check if entity exists
    const exists = await this.entityExists(entityType, id);

    if (!exists) {
      this.logger.debug(
        `Entity of type ${entityType} with ID ${id} not found for deletion`,
      );
      return false;
    }

    // Delete from database (cascades to chunks and embeddings)
    await this.db
      .delete(entities)
      .where(and(eq(entities.entityType, entityType), eq(entities.id, id)));

    this.logger.debug(`Deleted entity of type ${entityType} with ID ${id}`);
    return true;
  }
}
