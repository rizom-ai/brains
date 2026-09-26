import type { EntityServiceClient } from "@brains/entity-service";
import type { EntityEvalFixtures } from "./entity-definition-contract";

/**
 * Fixture control for a declaring unit — one entity type, or the set a
 * service package declares.
 *
 * Reset covers the declared types plus everything seeded through `seed`,
 * because an extraction eval plants sources it does not own and has to be
 * able to take them back out. Nothing else is touched: a fixture reset is
 * not a way to empty the brain.
 */
export function createEvalFixtures(
  entityService: EntityServiceClient,
  ownedTypes: readonly string[],
): EntityEvalFixtures {
  const seeded = new Map<string, string>();
  return {
    async seed(entity): Promise<void> {
      await entityService.createEntity({
        entity: {
          id: entity.id,
          entityType: entity.entityType,
          content: entity.content,
          visibility: "public",
          metadata: entity.metadata ?? {},
        },
      });
      seeded.set(`${entity.entityType}:${entity.id}`, entity.entityType);
    },
    async reset(): Promise<void> {
      const stored = await Promise.all(
        ownedTypes.map((entityType) =>
          entityService.listEntities({ entityType }),
        ),
      );
      const targets = new Map<string, { entityType: string; id: string }>();
      for (const entity of stored.flat()) {
        targets.set(`${entity.entityType}:${entity.id}`, {
          entityType: entity.entityType,
          id: entity.id,
        });
      }
      for (const [key, entityType] of seeded) {
        targets.set(key, { entityType, id: key.slice(entityType.length + 1) });
      }
      await Promise.all(
        [...targets.values()].map(({ entityType, id }) =>
          entityService.deleteEntity({ entityType, id }),
        ),
      );
      seeded.clear();
    },
  };
}
