import type { EntityDB } from "./db";
import type { BaseEntity } from "./types";
import { entities } from "./schema/entities";
import { eq, and, desc, asc, sql } from "drizzle-orm";
import { z } from "@brains/utils";
import type { Logger } from "@brains/utils";
import type { EntitySerializer } from "./entity-serializer";

/**
 * Schema for list entities options
 */
const listOptionsSchema = z.object({
  limit: z.number().int().positive().optional().default(20),
  offset: z.number().int().min(0).optional().default(0),
  sortBy: z.enum(["created", "updated"]).optional().default("updated"),
  sortDirection: z.enum(["asc", "desc"]).optional().default("desc"),
  filter: z
    .object({
      metadata: z.record(z.unknown()).optional(),
    })
    .optional(),
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
      this.logger.info(`Entity of type ${entityType} with ID ${id} not found`);
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
      created: entityData.created,
      updated: entityData.updated,
      metadata: entityData.metadata as Record<string, unknown>,
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
    const { limit, offset, sortBy, sortDirection, filter } = validatedOptions;

    this.logger.debug(
      `Listing entities of type ${entityType} (limit: ${limit}, offset: ${offset}, filter: ${JSON.stringify(filter)})`,
    );

    // Build where conditions
    const whereConditions = [eq(entities.entityType, entityType)];

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

    // Query database
    const query = this.db
      .select()
      .from(entities)
      .where(and(...whereConditions))
      .limit(limit)
      .offset(offset)
      .orderBy(
        sortDirection === "desc"
          ? desc(sortBy === "created" ? entities.created : entities.updated)
          : asc(sortBy === "created" ? entities.created : entities.updated),
      );

    const result = await query;

    // Convert from database format to entities
    const entityList = await this.serializer.convertToEntities<T>(
      result.map((row) => ({
        id: row.id,
        entityType: row.entityType,
        content: row.content,
        created: row.created,
        updated: row.updated,
        metadata: row.metadata as Record<string, unknown>,
      })),
      entityType,
    );

    this.logger.info(
      `Listed ${entityList.length} entities of type ${entityType}`,
    );

    return entityList;
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
      this.logger.info(
        `Entity of type ${entityType} with ID ${id} not found for deletion`,
      );
      return false;
    }

    // Delete from database (cascades to chunks and embeddings)
    await this.db
      .delete(entities)
      .where(and(eq(entities.entityType, entityType), eq(entities.id, id)));

    this.logger.info(`Deleted entity of type ${entityType} with ID ${id}`);
    return true;
  }
}
