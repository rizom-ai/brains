import { z } from "zod";

/**
 * Shared database configuration — used by all services (entity, embedding,
 * job queue, conversation).
 */
export interface DbConfig {
  url: string;
  authToken?: string | undefined;
}

export const dbConfigSchema: z.ZodType<DbConfig> = z.object({
  url: z.string(),
  authToken: z.string().optional(),
});
