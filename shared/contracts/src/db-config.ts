import { z } from "@brains/utils/zod";

type DbConfigSchema = z.ZodObject<{
  url: z.ZodString;
  authToken: z.ZodOptional<z.ZodString>;
}>;

/**
 * Shared database configuration — used by all services (entity, embedding,
 * job queue, conversation).
 */
export const dbConfigSchema: DbConfigSchema = z.object({
  url: z.string(),
  authToken: z.string().optional(),
});

export type DbConfig = z.output<typeof dbConfigSchema>;
