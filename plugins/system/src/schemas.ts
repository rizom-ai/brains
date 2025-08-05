import { z } from "zod";

/**
 * Configuration schema for the system plugin
 */
export const systemConfigSchema = z.object({
  searchLimit: z
    .number()
    .min(1)
    .max(100)
    .describe("Default number of search results to return"),
  debug: z.boolean().describe("Enable debug logging"),
});

export type SystemConfig = z.infer<typeof systemConfigSchema>;
export type SystemConfigInput = Partial<z.input<typeof systemConfigSchema>>;

export const defaultSystemConfig: SystemConfig = {
  searchLimit: 10,
  debug: false,
};

/**
 * Search options schema
 */
export const searchOptionsSchema = z.object({
  limit: z.number().min(1).max(100).optional(),
  types: z.array(z.string()).optional(),
  sortBy: z.enum(["relevance", "created", "updated"]).optional(),
});

export type SearchOptions = z.infer<typeof searchOptionsSchema>;
