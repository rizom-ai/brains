import { baseEntitySchema } from "@brains/entity-service";
import { z } from "@brains/utils/zod";
import { parseWithSchema } from "@brains/utils/parse-schema";
import { findSchemaTransformation } from "@brains/utils/zod-introspect";
import { SdkError } from "@brains/contracts";
import type { EntityDefinitionShape, EntityOf } from "./entity-shape";

export function assertCanonicalEntityMetadata(
  definition: EntityDefinitionShape,
): void {
  const transformation = findSchemaTransformation(
    definition.metadata,
    "metadata",
  );
  if (transformation) {
    throw new SdkError("invalid_input", {
      message: `Entity "${definition.type}" ${transformation.path} uses ${transformation.kind}; metadata must describe canonical stored values. Normalize values in tool, job, or request input schemas instead. Defaults and safe coercions are supported.`,
    });
  }
}

const entityFieldsSchema = baseEntitySchema.extend({ metadata: z.unknown() });

const entitySchemaCache = new WeakMap<
  EntityDefinitionShape,
  z.ZodType<EntityOf<EntityDefinitionShape>, unknown>
>();

/**
 * The parse schema for one entity definition.
 *
 * Keep the adapter schema structural for schema introspection. Typed readers
 * validate the same fields separately to prove their metadata output type.
 */
export function entitySchema(
  definition: EntityDefinitionShape,
): z.ZodType<EntityOf<EntityDefinitionShape>, unknown> {
  assertCanonicalEntityMetadata(definition);
  let schema = entitySchemaCache.get(definition);
  if (!schema) {
    schema = baseEntitySchema.extend({
      entityType: z.literal(definition.type),
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
  assertCanonicalEntityMetadata(definition);
  // Validate the envelope separately so metadata is not parsed a second
  // time merely to prove its definition-specific output type.
  const parsed = entityFieldsSchema.parse(input);
  z.object({ entityType: z.literal(definition.type) }).parse(parsed);
  const metadata = definition.metadataFrom
    ? definition.metadataFrom(parsed.metadata)
    : parsed.metadata;
  return {
    ...parsed,
    entityType: definition.type,
    metadata: parseWithSchema<TDefinition["metadata"]>(
      definition.metadata,
      metadata,
    ),
  };
}
