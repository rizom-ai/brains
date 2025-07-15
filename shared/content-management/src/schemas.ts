import { z } from "zod";

/**
 * Content environment schema
 * Note: Content generation only works with preview content.
 * Production content is created by promoting preview content.
 */
export const ContentEnvironmentSchema = z.enum(["preview"]);

/**
 * Generate operation options schema
 */
export const GenerateOptionsSchema = z.object({
  routeId: z.string().optional().describe("Optional: specific route filter"),
  sectionId: z
    .string()
    .optional()
    .describe("Optional: specific section filter"),
  dryRun: z
    .boolean()
    .default(false)
    .describe("Optional: preview changes without executing"),
  force: z
    .boolean()
    .default(false)
    .describe("Optional: regenerate existing content"),
});

/**
 * Generate operation result schema
 */
export const GenerateResultSchema = z.object({
  success: z.boolean(),
  sectionsGenerated: z.number(),
  totalSections: z.number(),
  generated: z.array(
    z.object({
      routeId: z.string(),
      sectionId: z.string(),
      entityId: z.string(),
      entityType: z.string(),
    }),
  ),
  skipped: z.array(
    z.object({
      routeId: z.string(),
      sectionId: z.string(),
      reason: z.string(),
    }),
  ),
  errors: z.array(z.string()).optional(),
  message: z.string().optional(),
  jobId: z.string().optional().describe("Job ID for async operations"),
});

// Export inferred types
export type ContentEnvironment = z.infer<typeof ContentEnvironmentSchema>;
export type GenerateOptions = z.infer<typeof GenerateOptionsSchema>;
export type GenerateResult = z.infer<typeof GenerateResultSchema>;
