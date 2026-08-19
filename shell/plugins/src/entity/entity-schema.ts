import { baseEntitySchema } from "@brains/entity-service";
import { z } from "@brains/utils/zod";
import type { EntityDefinitionShape, EntityOf } from "./entity-shape";

const entitySchemaCache = new WeakMap<
  EntityDefinitionShape,
  z.ZodType<EntityOf<EntityDefinitionShape>, unknown>
>();

/**
 * The parse schema for one entity definition.
 *
 * Erased in the metadata: `.extend()` cannot carry a generic metadata
 * schema's output through, so this returns the widened form and
 * `parseDefinitionEntity` narrows it for a caller that knows the definition.
 */
export function entitySchema(
  definition: EntityDefinitionShape,
): z.ZodType<EntityOf<EntityDefinitionShape>, unknown> {
  let schema = entitySchemaCache.get(definition);
  if (!schema) {
    schema = baseEntitySchema.extend({
      entityType: z.literal(definition.type),
      metadata: definition.metadata,
    });
    entitySchemaCache.set(definition, schema);
  }
  return schema;
}

export function parseDefinitionEntity<
  TDefinition extends EntityDefinitionShape,
>(definition: TDefinition, input: unknown): EntityOf<TDefinition> {
  return entitySchema(definition).parse(input) as EntityOf<TDefinition>;
}
