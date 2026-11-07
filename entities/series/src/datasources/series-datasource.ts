import {
  defineDataSource,
  z,
  type DataSourceDefinition,
} from "@brains/sdk/entities";
import {
  entityRuntime,
  type AnyEntityReads,
} from "@brains/sdk/internal/entity-runtime";
import { generateMarkdown } from "@brains/utils/markdown-frontmatter";
import {
  parseSeriesBody,
  seriesMetadataSchema,
  type SeriesFrontmatter,
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

type AnyEntity = Awaited<ReturnType<AnyEntityReads["getEntity"]>> & object;

/**
 * A series as the templates read it: its record, its content the document
 * it is stored as, so the site finds the cover its frontmatter names; its
 * frontmatter; and its description.
 */
function seriesData(entity: AnyEntity): {
  readonly record: Record<string, unknown>;
  readonly title: string;
  readonly description: string | undefined;
} {
  const metadata = seriesMetadataSchema.parse(entity.metadata);
  const frontmatter: SeriesFrontmatter = {
    title: metadata.title,
    slug: metadata.slug,
    coverImageId: metadata.coverImageId,
  };
  const stated = Object.fromEntries(
    Object.entries(frontmatter).filter(([, value]) => value !== null),
  );
  return {
    record: {
      ...entity,
      content: generateMarkdown(stated, entity.content),
      metadata: { title: metadata.title, slug: metadata.slug },
      frontmatter,
    },
    title: metadata.title,
    description: parseSeriesBody(metadata.title, entity.content).description,
  };
}

async function seriesWhere(
  reads: AnyEntityReads,
  metadata: Record<string, string>,
): Promise<AnyEntity | undefined> {
  const [found] = await reads.listEntities({
    entityType: "series",
    options: { filter: { metadata } },
  });
  return found;
}

async function fetchSeriesList(reads: AnyEntityReads): Promise<unknown> {
  const seriesEntities = await reads.listEntities({ entityType: "series" });

  // Count entities per series across ALL entity types
  const entityCounts = await countEntitiesPerSeries(reads);

  const series = seriesEntities.map((entity) => {
    const { record, title, description } = seriesData(entity);
    return {
      ...record,
      description,
      postCount: entityCounts.get(title) ?? 0,
    };
  });
  return { series };
}

async function fetchSeriesDetail(
  seriesName: string,
  reads: AnyEntityReads,
  seriesEntity?: AnyEntity,
): Promise<unknown> {
  const found =
    seriesEntity ?? (await seriesWhere(reads, { title: seriesName }));
  if (!found) {
    throw new Error(`Series not found: ${seriesName}`);
  }

  const { record, description } = seriesData(found);

  // Fetch entities from all types that belong to this series
  const members = await getSeriesMembers(seriesName, reads);

  return {
    seriesName,
    posts: members,
    series: {
      ...record,
      description,
      postCount: members.length,
    },
    description,
  };
}

async function fetchSeriesDetailBySlug(
  seriesSlug: string,
  reads: AnyEntityReads,
): Promise<unknown> {
  const seriesEntity = await seriesWhere(reads, { slug: seriesSlug });
  if (!seriesEntity) {
    // Consistent with fetchSeriesDetail: a missing series is a not-found,
    // not a renderable empty page. The detail schema requires `series`, so
    // returning a partial payload here would throw an opaque ZodError —
    // throw a clear error the route can turn into a 404 instead.
    throw new Error(`Series not found with slug: ${seriesSlug}`);
  }

  return fetchSeriesDetail(
    seriesMetadataSchema.parse(seriesEntity.metadata).title,
    reads,
    seriesEntity,
  );
}

/**
 * Count entities per series across all entity types.
 */
async function countEntitiesPerSeries(
  reads: AnyEntityReads,
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const types = reads
    .getEntityTypes()
    .filter((entityType) => entityType !== "series");
  const listed = await Promise.all(
    types.map((entityType) => reads.listEntities({ entityType })),
  );
  for (const entity of listed.flat()) {
    const name = getSeriesName(entity);
    if (name) {
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  return counts;
}

/**
 * Get all entities belonging to a series, sorted by seriesIndex.
 */
async function getSeriesMembers(
  seriesName: string,
  reads: AnyEntityReads,
): Promise<AnyEntity[]> {
  const types = reads
    .getEntityTypes()
    .filter((entityType) => entityType !== "series");
  const found = await Promise.all(
    types.map((entityType) =>
      reads.listEntities({
        entityType,
        options: { filter: { metadata: { seriesName } } },
      }),
    ),
  );
  // Sort by seriesIndex; members without an index sort last.
  return found.flat().sort(compareBySeriesIndex);
}

/**
 * The series list and detail pages' data. Cross-content: a series counts
 * and lists the entities of every type whose `seriesName` names it, read at
 * the build's scope.
 */
export const seriesDataSource: DataSourceDefinition = defineDataSource({
  id: "entities",
  name: "Series DataSource",
  description: "Fetches series list and detail data",
  fetch: async (query, _entities, context) => {
    const params = normalizeQuery(query);
    const reads = entityRuntime(context).anyEntities;

    if (params.type === "list") {
      return fetchSeriesList(reads);
    }

    if (params.seriesName) {
      return fetchSeriesDetail(params.seriesName, reads);
    }

    if (params.seriesSlug) {
      return fetchSeriesDetailBySlug(params.seriesSlug, reads);
    }

    throw new Error(
      "Invalid series query: must specify seriesName or slug for detail",
    );
  },
});
