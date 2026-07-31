import { z } from "@brains/utils/zod";
import type { DbConfig } from "@brains/contracts";

/**
 * Parser for the five database blocks in shell config. The DbConfig shape
 * itself stays in @brains/contracts — entity-service, job-queue, and
 * conversation-service each re-export it under their own alias — but shell
 * config is the only place that parses one.
 */
export const dbConfigSchema: z.ZodType<DbConfig, DbConfig> = z.object({
  url: z.string(),
  authToken: z.string().optional(),
});
