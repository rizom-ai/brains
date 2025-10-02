import { z } from "@brains/utils";
import { appInfoSchema, identityBodySchema } from "@brains/plugins";

/**
 * Configuration schema for the system plugin
 */
export const systemConfigSchema = z.object({
  searchLimit: z
    .number()
    .min(1)
    .max(100)
    .describe("Default number of search results to return")
    .default(10),
  debug: z.boolean().describe("Enable debug logging").default(false),
});

export type SystemConfig = z.infer<typeof systemConfigSchema>;

/**
 * Search options schema
 */
export const searchOptionsSchema = z.object({
  limit: z.number().min(1).max(100).optional(),
  types: z.array(z.string()).optional(),
  sortBy: z.enum(["relevance", "created", "updated"]).optional(),
});

export type SearchOptions = z.infer<typeof searchOptionsSchema>;

/**
 * About info schema - combines app info and identity
 */
export const aboutInfoSchema = identityBodySchema.merge(appInfoSchema);

export type AboutInfo = z.infer<typeof aboutInfoSchema>;
