import { z } from "zod";

/**
 * Regeneration mode schema
 */
export const RegenerateModeSchema = z.enum(["leave", "new", "with-current"]);

/**
 * Content environment schema
 * Note: Content generation only works with preview content.
 * Production content is created by promoting preview content.
 */
export const ContentEnvironmentSchema = z.enum(["preview"]);

/**
 * Regenerate operation options schema
 */
export const RegenerateOptionsSchema = z.object({
  pageId: z.string().describe("Required: target page"),
  sectionId: z.string().optional().describe("Optional: specific section"),
  environment: ContentEnvironmentSchema.default("preview").describe(
    "Environment: only preview content can be regenerated (production content comes from promotion)",
  ),
  mode: RegenerateModeSchema.describe("Required: regeneration mode"),
  dryRun: z
    .boolean()
    .default(false)
    .describe("Optional: preview changes without executing"),
});

/**
 * Regenerate operation result schema
 */
export const RegenerateResultSchema = z.object({
  success: z.boolean(),
  regenerated: z.array(
    z.object({
      pageId: z.string(),
      sectionId: z.string(),
      entityId: z.string(),
      mode: RegenerateModeSchema,
    }),
  ),
  skipped: z.array(
    z.object({
      pageId: z.string(),
      sectionId: z.string(),
      reason: z.string(),
    }),
  ),
  errors: z.array(z.string()).optional(),
});

/**
 * Generate operation options schema
 */
export const GenerateOptionsSchema = z.object({
  pageId: z.string().optional().describe("Optional: specific page filter"),
  sectionId: z
    .string()
    .optional()
    .describe("Optional: specific section filter"),
  dryRun: z
    .boolean()
    .default(false)
    .describe("Optional: preview changes without executing"),
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
      pageId: z.string(),
      sectionId: z.string(),
      entityId: z.string(),
      entityType: z.string(),
    }),
  ),
  skipped: z.array(
    z.object({
      pageId: z.string(),
      sectionId: z.string(),
      reason: z.string(),
    }),
  ),
  errors: z.array(z.string()).optional(),
  message: z.string().optional(),
  jobId: z.string().optional().describe("Job ID for async operations"),
});

// Export inferred types
export type RegenerateMode = z.infer<typeof RegenerateModeSchema>;
export type ContentEnvironment = z.infer<typeof ContentEnvironmentSchema>;
export type RegenerateOptions = z.infer<typeof RegenerateOptionsSchema>;
export type RegenerateResult = z.infer<typeof RegenerateResultSchema>;
export type GenerateOptions = z.infer<typeof GenerateOptionsSchema>;
export type GenerateResult = z.infer<typeof GenerateResultSchema>;