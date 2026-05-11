import type { ServicePluginContext } from "@rizom/brain/plugins";
import type { BaseEntity, SearchResult } from "@rizom/brain/entities";

interface SearchFixtureEntity extends BaseEntity<{ title: string }> {
  entityType: "search-fixture";
  metadata: { title: string };
}

export async function assertSearchResultShape(
  context: ServicePluginContext,
): Promise<SearchResult<SearchFixtureEntity>[]> {
  const results: SearchResult<SearchFixtureEntity>[] =
    await context.entityService.search<SearchFixtureEntity>({
      query: "typed search fixture",
      options: { limit: 5, types: ["search-fixture"] },
    });

  const firstEntity: SearchFixtureEntity | undefined = results[0]?.entity;
  void firstEntity;

  return results;
}
