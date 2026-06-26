import { z } from "@brains/utils/zod-v4";

export const serializableEntitySchema = z.object({
  id: z.string(),
  entityType: z.string(),
  content: z.string(),
  created: z.string(),
  updated: z.string(),
});

export type SerializableEntity = z.output<typeof serializableEntitySchema>;

export type SerializableQueryResult<T> = T;
