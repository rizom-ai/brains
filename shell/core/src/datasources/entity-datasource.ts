import type { DataSource, BaseDataSourceContext } from "@brains/datasource";
import type { IEntityService } from "@brains/entity-service";
import { z } from "@brains/utils";
import { SHELL_DATASOURCE_IDS } from "../constants";

const entityQuerySchema = z.object({
  entityType: z.string(),
  query: z.object({
    id: z.string(),
  }),
});

export class EntityDataSource implements DataSource {
  readonly id = SHELL_DATASOURCE_IDS.ENTITIES;
  readonly name = "Entity DataSource";
  readonly description = "Fetches entity content from the entity service";

  constructor(private entityService: IEntityService) {}

  async fetch<T>(
    query: unknown,
    outputSchema: z.ZodSchema<T>,
    _context?: BaseDataSourceContext,
  ): Promise<T> {
    const parseResult = entityQuerySchema.safeParse(query);
    if (!parseResult.success) {
      const issues = parseResult.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join(", ");
      throw new Error(`EntityDataSource: Invalid query - ${issues}`);
    }
    const params = parseResult.data;

    const entity = await this.entityService.getEntity(
      params.entityType,
      params.query.id,
    );

    if (!entity) {
      throw new Error(
        `EntityDataSource: Entity not found (${params.entityType}:${params.query.id})`,
      );
    }

    return outputSchema.parse({ markdown: entity.content });
  }
}
