import type { IEntityService } from "@brains/entity-service";

/** Detached classification only, never the registry or its mutable config. */
export function projectionSourceTypes(
  entities: Pick<IEntityService, "getEntityTypes" | "getEntityTypeConfig">,
): readonly string[] {
  return Object.freeze(
    entities
      .getEntityTypes()
      .filter(
        (type) => entities.getEntityTypeConfig(type).projectionSource !== false,
      )
      .sort(),
  );
}
