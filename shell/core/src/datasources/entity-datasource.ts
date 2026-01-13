import type { DataSource, BaseDataSourceContext } from "@brains/datasource";
import type { IEntityService } from "@brains/entity-service";
import { z } from "@brains/utils";
import { SHELL_DATASOURCE_IDS } from "../constants";

/**
 * Schema for entity datasource query parameters
 */
const entityQuerySchema = z.object({
  entityType: z.string(),
  query: z.object({
    id: z.string(),
  }),
});

/**
 * Entity DataSource
 *
 * Fetches entity content from the entity service.
 * Used by templates to dynamically load entity data.
 */
export class EntityDataSource implements DataSource {
  readonly id = SHELL_DATASOURCE_IDS.ENTITIES;
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
    // Parse and validate query parameters
    const parseResult = entityQuerySchema.safeParse(query);
    if (!parseResult.success) {
      const issues = parseResult.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join(", ");
      throw new Error(`EntityDataSource: Invalid query - ${issues}`);
    }
    const params = parseResult.data;

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
