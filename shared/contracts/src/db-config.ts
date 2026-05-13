import { z } from "zod";

/**
 * Shared database configuration — used by all services (entity, embedding,
 * job queue, conversation).
 */
export const dbConfigSchema = z.object({
  url: z.string(),
  authToken: z.string().optional(),
});

export type DbConfig = z.infer<typeof dbConfigSchema>;
