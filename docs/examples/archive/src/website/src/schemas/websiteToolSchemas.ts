import { z } from 'zod';

/**
 * Schema definitions for website tools
 */

// Import existing quality thresholds schema
import { QualityThresholdsSchema } from './sectionQualitySchema';

/**
 * Schema for landing page generation tool (no options needed)
 */
export const LandingPageGenerationToolSchema = z.object({});

export type LandingPageGenerationToolOptions = z.infer<typeof LandingPageGenerationToolSchema>;

/**
 * Schema for landing page quality assessment tool
 */
export const LandingPageQualityAssessmentToolSchema = z.object({
  qualityThresholds: QualityThresholdsSchema.optional()
    .describe('Custom thresholds for section quality assessment'),
  applyRecommendations: z.boolean().optional()
    .describe('Whether to apply quality recommendations (enable/disable sections)'),
});

export type LandingPageQualityAssessmentToolOptions = z.infer<typeof LandingPageQualityAssessmentToolSchema>;

/**
 * Schema for website build tool
 */
export const WebsiteBuildToolSchema = z.object({
  environment: z.enum(['preview', 'production']).optional()
    .describe('Environment to build for (default: preview)'),
  generateBeforeBuild: z.boolean().optional()
    .describe('Whether to generate landing page before building (default: true)'),
});

export type WebsiteBuildToolOptions = z.infer<typeof WebsiteBuildToolSchema>;

/**
 * Schema for website promotion tool
 */
export const WebsitePromoteToolSchema = z.object({
  skipConfirmation: z.boolean().optional()
    .describe('Whether to skip confirmation prompt'),
});

export type WebsitePromoteToolOptions = z.infer<typeof WebsitePromoteToolSchema>;

/**
 * Schema for website status tool
 */
export const WebsiteStatusToolSchema = z.object({
  environment: z.enum(['preview', 'production']).optional()
    .describe('Environment to check status for (default: preview)'),
});

export type WebsiteStatusToolOptions = z.infer<typeof WebsiteStatusToolSchema>;