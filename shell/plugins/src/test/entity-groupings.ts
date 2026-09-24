import {
  getVisibleContentVisibilities,
  queryGroupingCatalogSchema,
  queryGroupingMembersSchema,
  type BaseEntity,
  type IEntityService,
} from "@brains/entity-service";
import type { MockEntityStore } from "./mock-entity-store";

const binary = (left: string, right: string): number =>
  Buffer.compare(Buffer.from(left), Buffer.from(right));
const asciiLower = (value: string): string =>
  value.replace(/[A-Z]/g, (letter) => letter.toLowerCase());

/** Deterministic fixture queries with the native schemas, scope and ordering rules. */
export function createFixtureGroupingQueries(
  store: MockEntityStore,
): Pick<
  IEntityService,
  | "queryGroupingCatalog"
  | "queryGroupingMembers"
  | "reprojectRegisteredGroupings"
> {
  const records = (
    key: string,
    types: string[],
    scope: "public" | "shared" | "restricted",
  ): { field: string; entities: BaseEntity[] } => {
    const grouping = store.registry.getGrouping(key);
    const admitted = new Set(
      grouping.types.filter((type) => types.includes(type)),
    );
    const visible = new Set(getVisibleContentVisibilities(scope));
    return {
      field: grouping.field,
      entities: [...store.entities.values()].filter(
        (entity) =>
          admitted.has(entity.entityType) && visible.has(entity.visibility),
      ),
    };
  };
  const values = (entity: BaseEntity, field: string): string[] => {
    const data: unknown = entity.metadata[field];
    return Array.isArray(data)
      ? data.filter((item): item is string => typeof item === "string")
      : [];
  };
  return {
    queryGroupingCatalog: async (
      request,
    ): ReturnType<IEntityService["queryGroupingCatalog"]> => {
      const input = queryGroupingCatalogSchema.parse(request);
      input.signal?.throwIfAborted();
      const selected = records(
        input.grouping,
        input.entityTypes,
        input.visibilityScope ?? "public",
      );
      const counts = new Map<string, number>();
      for (const entity of selected.entities) {
        input.signal?.throwIfAborted();
        for (const value of new Set(values(entity, selected.field)))
          counts.set(value, (counts.get(value) ?? 0) + 1);
      }
      const entries = [...counts].sort(
        ([a], [b]) => binary(asciiLower(a), asciiLower(b)) || binary(a, b),
      );
      return {
        total: entries.length,
        values: entries
          .slice(input.offset, input.offset + input.limit)
          .map(([value, count]) => ({ value, count })),
      };
    },
    queryGroupingMembers: async (
      request,
    ): ReturnType<IEntityService["queryGroupingMembers"]> => {
      const input = queryGroupingMembersSchema.parse(request);
      input.signal?.throwIfAborted();
      const selected = records(
        input.grouping,
        input.entityTypes,
        input.visibilityScope ?? "public",
      );
      const matches = selected.entities.filter((entity) => {
        input.signal?.throwIfAborted();
        return (
          values(entity, selected.field).includes(input.value) &&
          (!input.q?.trim() ||
            asciiLower(store.sources.get(entity.id) ?? entity.content).includes(
              asciiLower(input.q),
            ))
        );
      });
      const field = input.sort.startsWith("created-") ? "created" : "updated";
      const direction = input.sort.endsWith("asc") ? 1 : -1;
      matches.sort(
        (a, b) =>
          direction * (Date.parse(a[field]) - Date.parse(b[field])) ||
          binary(a.entityType, b.entityType) ||
          binary(a.id, b.id),
      );
      input.signal?.throwIfAborted();
      return {
        total: matches.length,
        entities: structuredClone(
          matches.slice(input.offset, input.offset + input.limit),
        ),
      };
    },
    reprojectRegisteredGroupings: async (): Promise<void> => {
      for (const [id, entity] of store.entities) {
        if (!store.registry.isGroupingContributor(entity.entityType)) continue;
        store.entities.set(id, {
          ...entity,
          metadata: store.registry.projectStoredMetadata(
            entity.entityType,
            store.sources.get(id) ?? entity.content,
            entity.metadata,
          ),
        });
      }
    },
  };
}
