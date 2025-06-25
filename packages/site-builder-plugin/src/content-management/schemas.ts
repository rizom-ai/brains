import { z } from "zod";
import { siteContentPreviewSchema, siteContentProductionSchema } from "@brains/types";

/**
 * Regeneration mode schema
 */
export const RegenerateModeSchema = z.enum(["leave", "new", "with-current"]);

/**
 * Content environment schema
 */
export const ContentEnvironmentSchema = z.enum(["preview", "production", "both"]);

/**
 * Promote operation options schema
 */
export const PromoteOptionsSchema = z.object({
  page: z.string().optional().describe("Optional: specific page filter"),
  section: z.string().optional().describe("Optional: specific section filter"),
  sections: z.array(z.string()).optional().describe("Optional: batch promote multiple sections"),
  dryRun: z.boolean().default(false).describe("Optional: preview changes without executing"),
});

/**
 * Promote operation result schema
 */
export const PromoteResultSchema = z.object({
  success: z.boolean(),
  promoted: z.array(z.object({
    page: z.string(),
    section: z.string(),
    previewId: z.string(),
    productionId: z.string(),
  })),
  skipped: z.array(z.object({
    page: z.string(),
    section: z.string(),
    reason: z.string(),
  })),
  errors: z.array(z.string()).optional(),
});

/**
 * Rollback operation options schema
 */
export const RollbackOptionsSchema = z.object({
  page: z.string().optional().describe("Optional: specific page filter"),
  section: z.string().optional().describe("Optional: specific section filter"),
  sections: z.array(z.string()).optional().describe("Optional: batch rollback multiple sections"),
  dryRun: z.boolean().default(false).describe("Optional: preview changes without executing"),
});

/**
 * Rollback operation result schema
 */
export const RollbackResultSchema = z.object({
  success: z.boolean(),
  rolledBack: z.array(z.object({
    page: z.string(),
    section: z.string(),
    productionId: z.string(),
  })),
  skipped: z.array(z.object({
    page: z.string(),
    section: z.string(),
    reason: z.string(),
  })),
  errors: z.array(z.string()).optional(),
});

/**
 * Regenerate operation options schema
 */
export const RegenerateOptionsSchema = z.object({
  page: z.string().describe("Required: target page"),
  section: z.string().optional().describe("Optional: specific section"),
  environment: ContentEnvironmentSchema.default("preview").describe("Optional: target environment (default: preview)"),
  mode: RegenerateModeSchema.describe("Required: regeneration mode"),
  dryRun: z.boolean().default(false).describe("Optional: preview changes without executing"),
});

/**
 * Regenerate operation result schema
 */
export const RegenerateResultSchema = z.object({
  success: z.boolean(),
  regenerated: z.array(z.object({
    page: z.string(),
    section: z.string(),
    entityId: z.string(),
    mode: RegenerateModeSchema,
  })),
  skipped: z.array(z.object({
    page: z.string(),
    section: z.string(),
    reason: z.string(),
  })),
  errors: z.array(z.string()).optional(),
});

/**
 * Content comparison result schema
 */
export const ContentComparisonSchema = z.object({
  page: z.string(),
  section: z.string(),
  preview: siteContentPreviewSchema,
  production: siteContentProductionSchema,
  differences: z.array(z.object({
    field: z.string(),
    previewValue: z.unknown(),
    productionValue: z.unknown(),
  })),
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
export type ContentComparison = z.infer<typeof ContentComparisonSchema>;