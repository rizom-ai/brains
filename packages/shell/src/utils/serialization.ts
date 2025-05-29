import type {
  Entity,
  SerializableEntity,
} from "../types";
import {
  serializableEntitySchema,
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
