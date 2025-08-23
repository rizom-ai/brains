import { z } from "zod";

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
    .default(false)
    .describe("Optional: preview changes without executing"),
  force: z
    .boolean()
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
export type GenerateOptions = z.infer<typeof GenerateOptionsSchema>;
export type GenerateResult = z.infer<typeof GenerateResultSchema>;

/**
 * Promote operation options
 */
export const PromoteOptionsSchema = z.object({
  routeId: z
    .string()
    .optional()
    .describe("Optional: specific route to promote"),
  sectionId: z
    .string()
    .optional()
    .describe("Optional: specific section to promote"),
  sections: z
    .array(z.string())
    .optional()
    .describe("Optional: array of section IDs to promote"),
  dryRun: z
    .boolean()
    .default(false)
    .describe("Preview changes without executing"),
});

export type PromoteOptions = z.infer<typeof PromoteOptionsSchema>;

/**
 * Rollback operation options
 */
export const RollbackOptionsSchema = z.object({
  routeId: z
    .string()
    .optional()
    .describe("Optional: specific route to rollback"),
  sectionId: z
    .string()
    .optional()
    .describe("Optional: specific section to rollback"),
  sections: z
    .array(z.string())
    .optional()
    .describe("Optional: array of section IDs to rollback"),
  dryRun: z
    .boolean()
    .default(false)
    .describe("Preview changes without executing"),
});

export type RollbackOptions = z.infer<typeof RollbackOptionsSchema>;
