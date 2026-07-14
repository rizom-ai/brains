import type { UseQueryOptions } from "@tanstack/react-query";
import { fetchEntities, type EntitySummary } from "./api";

export type EntityListQueryKey = readonly ["cms", "entities", string];

export const cmsKeys = {
  all: ["cms"] as const,
  entities: (entityType: string): EntityListQueryKey => [
    "cms",
    "entities",
    entityType,
  ],
};

export function entityListQueryOptions(
  entityType: string,
): UseQueryOptions<
  EntitySummary[],
  Error,
  EntitySummary[],
  EntityListQueryKey
> {
  return {
    queryKey: cmsKeys.entities(entityType),
    queryFn: () => fetchEntities(entityType),
  };
}
