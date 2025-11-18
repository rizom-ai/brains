import type { DataSource, BaseDataSourceContext } from "@brains/datasource";
import type { IEntityService } from "@brains/entity-service";
import type { z } from "@brains/utils";

/**
 * Entity DataSource
 *
 * Fetches entity content from the entity service.
 * Used by templates to dynamically load entity data.
 */
export class EntityDataSource implements DataSource {
  readonly id = "shell:entities";
  readonly name = "Entity DataSource";
  readonly description = "Fetches entity content from the entity service";

  constructor(private entityService: IEntityService) {}

  /**
   * Fetch entity data
   * @param query - Query object with entityType and query.id
   * @param outputSchema - Schema for validating output data
   * @param context - Optional context (environment, etc.)
   */
  async fetch<T>(
    query: unknown,
    outputSchema: z.ZodSchema<T>,
    _context?: BaseDataSourceContext,
  ): Promise<T> {
    // Parse query to extract entityType and id
    const params = query as {
      entityType?: string;
      query?: { id?: string };
    };

    if (!params.entityType) {
      throw new Error("EntityDataSource: entityType is required");
    }

    if (!params.query?.id) {
      throw new Error("EntityDataSource: query.id is required");
    }

    // Fetch the entity
    const entity = await this.entityService.getEntity(
      params.entityType,
      params.query.id,
    );

    if (!entity) {
      throw new Error(
        `EntityDataSource: Entity not found (${params.entityType}:${params.query.id})`,
      );
    }

    // Parse and validate the entity content against the schema
    // For markdown entities, the content field contains the markdown
    const data = { markdown: entity.content };

    return outputSchema.parse(data);
  }
}
