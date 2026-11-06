import type { BaseEntity, ListEntitiesRequest } from "@brains/plugins";

/** The entity reads needed to find series members across types. */
export interface SeriesMemberReader {
  getEntityTypes(): string[];
  listEntities(request: ListEntitiesRequest): Promise<BaseEntity[]>;
}

export interface SeriesCandidateOptions {
  /** Only entities that name this series in their metadata. */
  seriesName?: string | undefined;
  /** Upper bound per entity type. */
  limit?: number | undefined;
}

/**
 * Entities of every type but series that may belong to a series. Membership
 * lives in metadata, so binary content is never loaded.
 */
export async function listSeriesCandidates(
  reader: SeriesMemberReader,
  { seriesName, limit }: SeriesCandidateOptions = {},
): Promise<BaseEntity[]> {
  const entityTypes = reader
    .getEntityTypes()
    .filter((entityType) => entityType !== "series");
  const lists = await Promise.all(
    entityTypes.map((entityType) =>
      reader.listEntities({
        entityType,
        options: {
          ...(seriesName !== undefined && {
            filter: { metadata: { seriesName } },
          }),
          ...(limit !== undefined && { limit }),
          binaryContent: "reference",
        },
      }),
    ),
  );
  return lists.flat();
}
