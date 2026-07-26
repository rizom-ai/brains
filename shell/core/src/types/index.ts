import { z } from "@brains/utils/zod";

export interface SerializableEntity {
  id: string;
  entityType: string;
  content: string;
  created: string;
  updated: string;
}

export const serializableEntitySchema: z.ZodType<SerializableEntity, unknown> =
  z.object({
    id: z.string(),
    entityType: z.string(),
    content: z.string(),
    created: z.string(),
    updated: z.string(),
  });

export type SerializableQueryResult<T> = T;
