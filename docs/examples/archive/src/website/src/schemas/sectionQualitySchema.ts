import { z } from 'zod';

/**
 * Schema for section quality assessment
 * Used to evaluate the quality of individual landing page sections
 */

/**
 * Base schema for quality assessment metrics
 * Applied to individual sections during the editorial review process
 */
export const SectionQualityAssessmentSchema = z.object({
  // How good the content is (clarity, relevance, persuasiveness)
  qualityScore: z.number().min(1).max(10),
  qualityJustification: z.string(),
  
  // How confident the AI is about the content's appropriateness
  confidenceScore: z.number().min(1).max(10),
  confidenceJustification: z.string(),
  
  // Combined score (weighted average of quality and confidence)
  combinedScore: z.number().min(1).max(10),
  
  // Whether this section should be enabled based on quality assessment
  enabled: z.boolean(),
  
  // Suggested improvements (from first review phase)
  suggestedImprovements: z.string(),
  
  // Whether improvements have been applied
  improvementsApplied: z.boolean().default(false),
});

export type SectionQualityAssessment = z.infer<typeof SectionQualityAssessmentSchema>;

/**
 * Schema for a section with quality assessment metadata
 * This is a generic wrapper that can be applied to any section type
 */
export const AssessedSectionSchema = <T extends z.ZodTypeAny>(sectionSchema: T) => 
  z.object({
    // The section content
    content: sectionSchema,
    
    // Quality assessment data
    assessment: SectionQualityAssessmentSchema.optional(),
    
    // Whether this section is a core/required section that should always be enabled
    isRequired: z.boolean().default(false),
  });

export type AssessedSection<T> = {
  content: T;
  assessment?: SectionQualityAssessment;
  isRequired: boolean;
};

/**
 * Configuration for quality thresholds
 */
export const QualityThresholdsSchema = z.object({
  // Minimum combined score required for automatic enablement
  minCombinedScore: z.number().min(1).max(10).default(7),
  
  // Minimum quality score required
  minQualityScore: z.number().min(1).max(10).default(6),
  
  // Minimum confidence score required
  minConfidenceScore: z.number().min(1).max(10).default(6),
});

export type QualityThresholds = z.infer<typeof QualityThresholdsSchema>;

/**
 * List of section types that are considered "core" and should always be enabled
 */
export const REQUIRED_SECTION_TYPES = ['hero', 'services', 'cta', 'footer'];