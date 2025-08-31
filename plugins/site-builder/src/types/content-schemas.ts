import { z } from "@brains/utils";

/**
 * Content generation schemas for site-builder plugin
 */

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
    .optional()
    .default(false)
    .describe("Optional: preview changes without executing"),
  force: z
    .boolean()
    .optional()
    .default(false)
    .describe("Force regeneration even if content exists"),
});

/**
 * Generate operation result schema
 */
export const GenerateResultSchema = z.object({
  jobs: z.array(
    z.object({
      jobId: z.string(),
      routeId: z.string(),
      sectionId: z.string(),
    }),
  ),
  totalSections: z.number(),
  queuedSections: z.number(),
  skippedSections: z.number().optional(),
  batchId: z.string().optional(),
});

// Export inferred types
export type GenerateOptions = z.input<typeof GenerateOptionsSchema>;
export type GenerateResult = z.infer<typeof GenerateResultSchema>;
