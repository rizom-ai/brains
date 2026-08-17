import { baseEntitySchema } from "@brains/entity-service";
import { z } from "@brains/utils/zod";
import type {
  AnyEntityDefinition,
  EntityOf,
} from "./entity-definition-contract";

const entitySchemaCache = new WeakMap<
  AnyEntityDefinition,
  z.ZodType<EntityOf<AnyEntityDefinition>, unknown>
>();

export function entitySchema(
  definition: AnyEntityDefinition,
): z.ZodType<EntityOf<AnyEntityDefinition>, unknown> {
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

export function parseDefinitionEntity<TDefinition extends AnyEntityDefinition>(
  definition: TDefinition,
  input: unknown,
): EntityOf<TDefinition> {
  return entitySchema(definition).parse(input) as EntityOf<TDefinition>;
}
