import {
  defineDataSource,
  parseMarkdownWithFrontmatter,
  z,
  type BaseEntity,
  type DataSourceDefinition,
  type EntityQueryReader,
} from "@brains/sdk/entities";
import type { Series } from "../schemas/series";
import { seriesSchema } from "../schemas/series";
import {
  parseSeriesBody,
  seriesFrontmatterSchema,
  seriesWithDataSchema,
  type SeriesWithData,
} from "../schemas/series";

import { getSeriesName, compareBySeriesIndex } from "../lib/series-metadata";

// DynamicRouteGenerator format (entityType + query)
const dynamicQuerySchema = z.object({
  entityType: z.literal("series"),
  query: z.looseObject({
    id: z.string().optional(),
    limit: z.number().optional(),
    page: z.number().optional(),
    pageSize: z.number().optional(),
  }),
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
export const seriesDataSource: DataSourceDefinition = defineDataSource({
  id: "entities",
  name: "Series DataSource",
  description: "Fetches series list and detail data",
  fetch: async (query, entities) => {
    const params = normalizeQuery(query);

    if (params.type === "list") {
      return fetchSeriesList(entities);
    }

    if (params.seriesName) {
      return fetchSeriesDetail(params.seriesName, entities);
    }

    if (params.seriesSlug) {
      return fetchSeriesDetailBySlug(params.seriesSlug, entities);
    }

    throw new Error(
      "Invalid series query: must specify seriesName or slug for detail",
    );
  },
});

async function fetchSeriesList(entities: EntityQueryReader): Promise<unknown> {
  const seriesEntities = await entities.listEntities(
    {
      entityType: "series",
    },
    seriesSchema,
  );

  // Count entities per series across ALL entity types
  const entityCounts = await countEntitiesPerSeries(entities);

  const series = seriesEntities.map((entity) => {
    const parsed = parseSeriesData(entity);
    const body = parseSeriesBody(entity.content);
    return {
      ...parsed,
      description: body.description,
      postCount: entityCounts.get(entity.metadata.title) ?? 0,
    };
  });
  return { series };
}

async function fetchSeriesDetail(
  seriesName: string,
  entities: EntityQueryReader,
  seriesEntity?: Series,
): Promise<unknown> {
  if (!seriesEntity) {
    const candidates = await entities.listEntities(
      {
        entityType: "series",
        options: {
          filter: { metadata: { title: seriesName } },
        },
      },
      seriesSchema,
    );
    seriesEntity = candidates[0];
  }

  if (!seriesEntity) {
    throw new Error(`Series not found: ${seriesName}`);
  }

  const series = parseSeriesData(seriesEntity);
  const body = parseSeriesBody(seriesEntity.content);

  // Fetch entities from all types that belong to this series
  const members = await getSeriesMembers(seriesName, entities);

  return {
    seriesName,
    posts: members,
    series: {
      ...series,
      description: body.description,
      postCount: members.length,
    },
    description: body.description,
  };
}

async function fetchSeriesDetailBySlug(
  seriesSlug: string,
  entities: EntityQueryReader,
): Promise<unknown> {
  const candidates = await entities.listEntities(
    {
      entityType: "series",
      options: {
        filter: { metadata: { slug: seriesSlug } },
      },
    },
    seriesSchema,
  );

  const seriesEntity = candidates[0];
  if (!seriesEntity) {
    // Consistent with fetchSeriesDetail: a missing series is a not-found,
    // not a renderable empty page. The detail schema requires `series`, so
    // returning a partial payload here would throw an opaque ZodError —
    // throw a clear error the route can turn into a 404 instead.
    throw new Error(`Series not found with slug: ${seriesSlug}`);
  }

  return fetchSeriesDetail(seriesEntity.metadata.title, entities, seriesEntity);
}

/**
 * Count entities per series across all entity types.
 */
async function countEntitiesPerSeries(
  entities: EntityQueryReader,
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const types = entities.getEntityTypes();

  for (const type of types) {
    if (type === "series") continue;
    const members = await entities.listEntities({
      entityType: type,
    });
    for (const entity of members) {
      const name = getSeriesName(entity);
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
async function getSeriesMembers(
  seriesName: string,
  entities: EntityQueryReader,
): Promise<BaseEntity[]> {
  const members: BaseEntity[] = [];
  const types = entities.getEntityTypes();

  for (const type of types) {
    if (type === "series") continue;
    const found = await entities.listEntities({
      entityType: type,
      options: {
        filter: { metadata: { seriesName } },
      },
    });
    members.push(...found);
  }

  // Sort by seriesIndex; members without an index sort last.
  members.sort(compareBySeriesIndex);

  return members;
}
