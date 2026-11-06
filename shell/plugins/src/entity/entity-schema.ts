import { baseEntitySchema } from "@brains/entity-service";
import { parseWithSchema } from "@brains/utils/parse-schema";
import { z } from "@brains/utils/zod";
import type {
  AnyEntityDefinition,
  EntityOf,
} from "./entity-definition-contract";

const entitySchemaCache = new WeakMap<
  AnyEntityDefinition,
  z.ZodType<EntityOf<AnyEntityDefinition>, unknown>
>();

/** Stored metadata in its current shape, migrated when the type says how. */
export function currentMetadata(
  definition: AnyEntityDefinition,
  stored: unknown,
): unknown {
  return definition.metadataFrom ? definition.metadataFrom(stored) : stored;
}

/** A singleton's only record id is its entity type. */
function recordIdSchema(definition: AnyEntityDefinition): z.ZodString {
  return definition.singleton === true
    ? z.string().refine((id) => id === definition.type, {
        message: `A ${definition.type} singleton's id is "${definition.type}"`,
      })
    : baseEntitySchema.shape.id;
}

export function entitySchema(
  definition: AnyEntityDefinition,
): z.ZodType<EntityOf<AnyEntityDefinition>, unknown> {
  let schema = entitySchemaCache.get(definition);
  if (!schema) {
    schema = baseEntitySchema.extend({
      id: recordIdSchema(definition),
      entityType: z.literal(definition.type),
      metadata: definition.metadataFrom
        ? z.preprocess(definition.metadataFrom, definition.metadata)
        : definition.metadata,
    });
    entitySchemaCache.set(definition, schema);
  }
  return schema;
}

const entityEnvelopeSchema = baseEntitySchema.extend({ metadata: z.unknown() });

export function parseDefinitionEntity<TDefinition extends AnyEntityDefinition>(
  definition: TDefinition,
  input: unknown,
): EntityOf<TDefinition> {
  // The envelope and identity are checked apart from the metadata, so the
  // metadata is migrated and validated exactly once, by the definition's own
  // schema — which is also what proves its definition-typed output.
  const parsed = entityEnvelopeSchema
    .extend({
      id: recordIdSchema(definition),
      entityType: z.literal(definition.type),
    })
    .parse(input);
  return {
    ...parsed,
    entityType: definition.type,
    metadata: parseWithSchema<TDefinition["metadata"]>(
      definition.metadata,
      currentMetadata(definition, parsed.metadata),
    ),
  };
}
