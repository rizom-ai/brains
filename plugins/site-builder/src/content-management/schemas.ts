import { z } from "zod";
import {
  siteContentPreviewSchema,
  siteContentProductionSchema,
} from "../types";

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
 * Promote operation options schema
 */
export const PromoteOptionsSchema = z.object({
  routeId: z.string().optional().describe("Optional: specific route filter"),
  sectionId: z
    .string()
    .optional()
    .describe("Optional: specific section filter"),
  sections: z
    .array(z.string())
    .optional()
    .describe("Optional: batch promote multiple sections"),
  dryRun: z
    .boolean()
    .default(false)
    .describe("Optional: preview changes without executing"),
});

/**
 * Promote operation result schema
 */
export const PromoteResultSchema = z.object({
  success: z.boolean(),
  promoted: z.array(
    z.object({
      routeId: z.string(),
      sectionId: z.string(),
      previewId: z.string(),
      productionId: z.string(),
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
});

/**
 * Rollback operation options schema
 */
export const RollbackOptionsSchema = z.object({
  routeId: z.string().optional().describe("Optional: specific route filter"),
  sectionId: z
    .string()
    .optional()
    .describe("Optional: specific section filter"),
  sections: z
    .array(z.string())
    .optional()
    .describe("Optional: batch rollback multiple sections"),
  dryRun: z
    .boolean()
    .default(false)
    .describe("Optional: preview changes without executing"),
});

/**
 * Rollback operation result schema
 */
export const RollbackResultSchema = z.object({
  success: z.boolean(),
  rolledBack: z.array(
    z.object({
      routeId: z.string(),
      sectionId: z.string(),
      productionId: z.string(),
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
});

/**
 * Regenerate operation options schema
 */
export const RegenerateOptionsSchema = z.object({
  routeId: z.string().describe("Required: target route"),
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
      routeId: z.string(),
      sectionId: z.string(),
      entityId: z.string(),
      mode: RegenerateModeSchema,
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
});

/**
 * Content comparison result schema
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

/**
 * Content comparison result schema
 */
export const ContentComparisonSchema = z.object({
  routeId: z.string(),
  sectionId: z.string(),
  preview: siteContentPreviewSchema,
  production: siteContentProductionSchema,
  differences: z.array(
    z.object({
      field: z.string(),
      previewValue: z.unknown(),
      productionValue: z.unknown(),
    }),
  ),
  identical: z.boolean(),
});

// Export inferred types
export type RegenerateMode = z.infer<typeof RegenerateModeSchema>;
export type ContentEnvironment = z.infer<typeof ContentEnvironmentSchema>;
export type PromoteOptions = z.infer<typeof PromoteOptionsSchema>;
export type PromoteResult = z.infer<typeof PromoteResultSchema>;
export type RollbackOptions = z.infer<typeof RollbackOptionsSchema>;
export type RollbackResult = z.infer<typeof RollbackResultSchema>;
export type RegenerateOptions = z.infer<typeof RegenerateOptionsSchema>;
export type RegenerateResult = z.infer<typeof RegenerateResultSchema>;
export type GenerateOptions = z.infer<typeof GenerateOptionsSchema>;
export type GenerateResult = z.infer<typeof GenerateResultSchema>;
export type ContentComparison = z.infer<typeof ContentComparisonSchema>;
