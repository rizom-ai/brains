import type { z } from "zod";
import type {
  Entity,
  QueryResult,
  SerializableEntity,
  SerializableQueryResult,
} from "../types";
import {
  serializableEntitySchema,
  serializableQueryResultSchema,
} from "../types";

/**
 * Convert an Entity to its serializable form, removing methods and non-serializable properties
 */
export function toSerializableEntity(entity: Entity): SerializableEntity {
  return serializableEntitySchema.parse({
    id: entity.id,
    entityType: entity.entityType,
    title: entity.title,
    content: entity.content,
    created: entity.created,
    updated: entity.updated,
    tags: entity.tags,
  });
}

/**
 * Convert a QueryResult to its serializable form
 */
export function toSerializableQueryResult<T = unknown>(
  result: QueryResult<T>,
): SerializableQueryResult<T> {
  return {
    answer: result.answer,
    citations: result.citations,
    relatedEntities: result.relatedEntities.map(toSerializableEntity),
    object: result.object,
  };
}

/**
 * Validate and serialize a QueryResult using Zod schema
 */
export function validateAndSerializeQueryResult<T>(
  result: QueryResult<T>,
  objectSchema: z.ZodType<T>,
): SerializableQueryResult<T> {
  const schema = serializableQueryResultSchema(objectSchema);
  const serializable = toSerializableQueryResult(result);
  return schema.parse(serializable) as SerializableQueryResult<T>;
}
