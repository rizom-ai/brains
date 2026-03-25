import type {
  DataSource,
  BaseDataSourceContext,
  IEntityService,
  BaseEntity,
} from "@brains/entity-service";
import { parseMarkdownWithFrontmatter } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import { z } from "@brains/utils";
import type { Series } from "../schemas/series";
import {
  seriesFrontmatterSchema,
  seriesWithDataSchema,
  type SeriesWithData,
} from "../schemas/series";
import { seriesAdapter } from "../adapters/series-adapter";

// DynamicRouteGenerator format (entityType + query)
const dynamicQuerySchema = z.object({
  entityType: z.literal("series"),
  query: z
    .object({
      id: z.string().optional(),
      limit: z.number().optional(),
      page: z.number().optional(),
      pageSize: z.number().optional(),
    })
    .passthrough(),
});

// Custom query format
const customQuerySchema = z.object({
  type: z.enum(["list", "detail"]),
  seriesName: z.string().optional(),
});

function normalizeQuery(query: unknown): {
  type: "list" | "detail";
  seriesName?: string | undefined;
  seriesSlug?: string | undefined;
} {
  const customResult = customQuerySchema.safeParse(query);
  if (customResult.success) {
    return {
      type: customResult.data.type,
      seriesName: customResult.data.seriesName,
    };
  }

  const dynamicResult = dynamicQuerySchema.safeParse(query);
  if (dynamicResult.success) {
    const { query: innerQuery } = dynamicResult.data;
    if (innerQuery.id) {
      return { type: "detail", seriesSlug: innerQuery.id };
    }
    return { type: "list" };
  }

  throw new Error(
    `Invalid series query format. Expected { type: "list"|"detail" } or { entityType: "series", query: { id?: string } }`,
  );
}

function parseSeriesData(entity: Series): SeriesWithData {
  const parsed = parseMarkdownWithFrontmatter(
    entity.content,
    seriesFrontmatterSchema,
  );
  return seriesWithDataSchema.parse({
    ...entity,
    frontmatter: parsed.metadata,
  });
}

/**
 * DataSource for fetching series data.
 * Cross-content: counts entities from ALL types with seriesName metadata.
 */
export class SeriesDataSource implements DataSource {
  public readonly id = "series:entities";
  public readonly name = "Series DataSource";
  public readonly description = "Fetches series list and detail data";

  constructor(private readonly logger: Logger) {}

  async fetch<T>(
    query: unknown,
    outputSchema: z.ZodSchema<T>,
    context: BaseDataSourceContext,
  ): Promise<T> {
    const params = normalizeQuery(query);
    const entityService = context.entityService;

    if (params.type === "list") {
      return this.fetchSeriesList(outputSchema, entityService);
    }

    if (params.seriesName) {
      return this.fetchSeriesDetail(
        params.seriesName,
        outputSchema,
        entityService,
      );
    }

    if (params.seriesSlug) {
      return this.fetchSeriesDetailBySlug(
        params.seriesSlug,
        outputSchema,
        entityService,
      );
    }

    throw new Error(
      "Invalid series query: must specify seriesName or slug for detail",
    );
  }

  private async fetchSeriesList<T>(
    outputSchema: z.ZodSchema<T>,
    entityService: IEntityService,
  ): Promise<T> {
    const seriesEntities = await entityService.listEntities<Series>("series", {
      limit: 1000,
    });

    // Count entities per series across ALL entity types
    const entityCounts = await this.countEntitiesPerSeries(entityService);

    const series = seriesEntities.map((entity) => {
      const parsed = parseSeriesData(entity);
      const body = seriesAdapter.parseBody(entity.content);
      return {
        ...parsed,
        description: body.description,
        postCount: entityCounts.get(entity.metadata.title) ?? 0,
      };
    });

    this.logger.debug(`Found ${series.length} series entities`);
    return outputSchema.parse({ series });
  }

  private async fetchSeriesDetail<T>(
    seriesName: string,
    outputSchema: z.ZodSchema<T>,
    entityService: IEntityService,
    seriesEntity?: Series,
  ): Promise<T> {
    if (!seriesEntity) {
      const candidates = await entityService.listEntities<Series>("series", {
        filter: { metadata: { title: seriesName } },
      });
      seriesEntity = candidates[0];
    }

    if (!seriesEntity) {
      throw new Error(`Series not found: ${seriesName}`);
    }

    const series = parseSeriesData(seriesEntity);
    const body = seriesAdapter.parseBody(seriesEntity.content);

    // Fetch entities from all types that belong to this series
    const members = await this.getSeriesMembers(seriesName, entityService);

    this.logger.debug(
      `Found ${members.length} entities in series "${seriesName}"`,
    );

    return outputSchema.parse({
      seriesName,
      posts: members,
      series: {
        ...series,
        description: body.description,
        postCount: members.length,
      },
      description: body.description,
    });
  }

  private async fetchSeriesDetailBySlug<T>(
    seriesSlug: string,
    outputSchema: z.ZodSchema<T>,
    entityService: IEntityService,
  ): Promise<T> {
    const candidates = await entityService.listEntities<Series>("series", {
      filter: { metadata: { slug: seriesSlug } },
    });

    const seriesEntity = candidates[0];
    if (!seriesEntity) {
      this.logger.warn(`Series not found with slug: ${seriesSlug}`);
      return outputSchema.parse({ seriesName: seriesSlug, posts: [] });
    }

    return this.fetchSeriesDetail(
      seriesEntity.metadata.title,
      outputSchema,
      entityService,
      seriesEntity,
    );
  }

  /**
   * Count entities per series across all entity types.
   */
  private async countEntitiesPerSeries(
    entityService: IEntityService,
  ): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    const types = entityService.getEntityTypes();

    for (const type of types) {
      if (type === "series") continue;
      const entities = await entityService.listEntities(type, { limit: 1000 });
      for (const entity of entities) {
        const name = this.getSeriesName(entity);
        if (name) {
          counts.set(name, (counts.get(name) ?? 0) + 1);
        }
      }
    }

    return counts;
  }

  /**
   * Get all entities belonging to a series, sorted by seriesIndex.
   */
  private async getSeriesMembers(
    seriesName: string,
    entityService: IEntityService,
  ): Promise<BaseEntity[]> {
    const members: BaseEntity[] = [];
    const types = entityService.getEntityTypes();

    for (const type of types) {
      if (type === "series") continue;
      const entities = await entityService.listEntities(type, {
        filter: { metadata: { seriesName } },
      });
      members.push(...entities);
    }

    // Sort by seriesIndex if available
    members.sort((a, b) => {
      const ai = (a.metadata as Record<string, unknown>)["seriesIndex"];
      const bi = (b.metadata as Record<string, unknown>)["seriesIndex"];
      return (
        (typeof ai === "number" ? ai : 999) -
        (typeof bi === "number" ? bi : 999)
      );
    });

    return members;
  }

  private getSeriesName(entity: BaseEntity): string | undefined {
    const metadata = entity.metadata as Record<string, unknown>;
    const name = metadata["seriesName"];
    return typeof name === "string" ? name : undefined;
  }
}
