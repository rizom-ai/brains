import type {
  BaseEntity,
  ContentVisibility,
  ListEntitiesRequest,
} from "@brains/plugins";

/** Sources read per page: only what the mapper keeps outlives a page. */
export const SOURCE_PAGE_SIZE = 100;

export interface TopicSourcePageRequest {
  entityType: string;
  filter: { visibilityScope: ContentVisibility };
  publishedOnly?: true;
  signal?: AbortSignal;
}

/**
 * One type's sources, in id order, a page at a time. The mapper turns each
 * source into what the reader keeps of it, or nothing to drop it, so a large
 * corpus is never held in memory.
 */
export async function readTopicSourcePages<T>(
  entityService: {
    listEntities(request: ListEntitiesRequest): Promise<BaseEntity[]>;
  },
  { entityType, filter, publishedOnly, signal }: TopicSourcePageRequest,
  map: (source: BaseEntity) => T[],
): Promise<T[]> {
  const readFrom = async (offset: number): Promise<T[]> => {
    const page = await entityService.listEntities({
      entityType,
      options: {
        limit: SOURCE_PAGE_SIZE,
        offset,
        sortFields: [{ field: "id", direction: "asc" }],
        filter,
        ...(publishedOnly && { publishedOnly }),
        ...(signal && { signal }),
      },
    });
    const kept = page.flatMap(map);
    if (page.length < SOURCE_PAGE_SIZE) return kept;
    return [...kept, ...(await readFrom(offset + SOURCE_PAGE_SIZE))];
  };
  return readFrom(0);
}
