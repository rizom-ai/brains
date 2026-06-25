import type {
  DataSource,
  DataSourceSchema,
  BaseDataSourceContext,
} from "@brains/entity-service";
import type { IEntityService } from "@brains/entity-service";
import { z } from "@brains/utils/zod-v4";
import { SHELL_DATASOURCE_IDS } from "../constants";

const entityQuerySchema = z.object({
  entityType: z.string(),
  query: z.object({
    id: z.string(),
  }),
});

type EntityQuery = z.output<typeof entityQuerySchema>;

export class EntityDataSource implements DataSource {
  private entityService: IEntityService;
  readonly id = SHELL_DATASOURCE_IDS.ENTITIES;
  readonly name = "Entity DataSource";
  readonly description = "Fetches entity content from the entity service";

  constructor(entityService: IEntityService) {
    this.entityService = entityService;
  }

  async fetch<T>(
    query: unknown,
    outputSchema: DataSourceSchema<T>,
    _context?: BaseDataSourceContext,
  ): Promise<T> {
    const parseResult = entityQuerySchema.safeParse(query);
    if (!parseResult.success) {
      const issues = parseResult.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join(", ");
      throw new Error(`EntityDataSource: Invalid query - ${issues}`);
    }
    const params: EntityQuery = parseResult.data;

    const entityService = _context?.entityService ?? this.entityService;
    const entity = await entityService.getEntity({
      entityType: params.entityType,
      id: params.query.id,
    });

    if (!entity) {
      throw new Error(
        `EntityDataSource: Entity not found (${params.entityType}:${params.query.id})`,
      );
    }

    return outputSchema.parse({ markdown: entity.content });
  }
}
