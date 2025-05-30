import { z } from "zod";
import { baseEntitySchema as coreBaseEntitySchema } from "@brains/types";

/**
 * Schema for creating a new base entity
 * This schema makes the id optional and omits created/updated
 * which will be added automatically
 */
export const createBaseEntitySchema = coreBaseEntitySchema
  .omit({
    id: true,
    created: true,
    updated: true,
  })
  .extend({
    id: z.string().optional(),
    entityType: z.string().default("base"),
    title: z.string().default("Untitled Entity"),
    content: z.string().default(""),
    tags: z.array(z.string()).default([]),
  });

/**
 * Type for creating a new base entity
 */
export type CreateBaseEntity = z.infer<typeof createBaseEntitySchema>;
