import { baseEntitySchema } from "@brains/entity-service";
import { z } from "@brains/utils/zod";
import { parseWithSchema } from "@brains/utils/parse-schema";
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
      // A declared migration runs before the schema, so a record written
      // under an older shape parses rather than being rejected on read.
      metadata: definition.metadataFrom
        ? z.preprocess(definition.metadataFrom, definition.metadata)
        : definition.metadata,
    });
    entitySchemaCache.set(definition, schema);
  }
  return schema;
}

/**
 * The schema a package hands to a read of its own entity type.
 *
 * `entitySchema` erases the metadata, so it cannot stand in for the
 * definition's own shape at a call site. This carries the definition's type
 * through by parsing with `parseDefinitionEntity`, which proves both
 * definition-typed fields — so the result is typed without an assertion, and
 * validated rather than merely declared.
 */
export function definitionEntitySchema<
  TDefinition extends EntityDefinitionShape,
>(definition: TDefinition): z.ZodType<EntityOf<TDefinition>, unknown> {
  return z
    .unknown()
    .transform((input) => parseDefinitionEntity(definition, input));
}

export function parseDefinitionEntity<
  TDefinition extends EntityDefinitionShape,
>(definition: TDefinition, input: unknown): EntityOf<TDefinition> {
  // The erased schema proves the base shape; the definition's own pieces
  // prove the two definition-typed fields, so no assertion is needed.
  const parsed = entitySchema(definition).parse(input);
  return {
    ...parsed,
    entityType: definition.type,
    metadata: parseWithSchema<TDefinition["metadata"]>(
      definition.metadata,
      parsed.metadata,
    ),
  };
}
