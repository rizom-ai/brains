import type { WebsiteIdentityData } from '@/contexts/website/schemas/websiteIdentitySchema';
import { BrainProtocol } from '@/protocol/brainProtocol';
import { Logger } from '@/utils/logger';
import { TemplateEngine } from '@/utils/templateEngine';
import type { 
  AssessedSection,
  QualityThresholds,
  SectionQualityAssessment} from '@website/schemas/sectionQualitySchema';
import {
  QualityThresholdsSchema,
  REQUIRED_SECTION_TYPES,
  SectionQualityAssessmentSchema,
} from '@website/schemas/sectionQualitySchema';

// Import prompt templates
import sectionContentImprovementWithIdentityPrompt from '../prompts/section-content-improvement-with-identity.txt';
import sectionContentImprovementPrompt from '../prompts/section-content-improvement.txt';
import sectionQualityAssessmentWithIdentityPrompt from '../prompts/section-quality-assessment-with-identity.txt';
import sectionQualityAssessmentPrompt from '../prompts/section-quality-assessment.txt';

/**
 * Service for assessing and improving the quality of landing page sections
 * Implements the Component Interface Standardization pattern
 */
/**
 * Configuration options for SectionQualityService
 */
export interface SectionQualityServiceConfig {
  /** Optional quality thresholds */
  qualityThresholds?: Partial<QualityThresholds>;
}

/**
 * Dependencies for SectionQualityService
 */
export interface SectionQualityServiceDependencies {
  /** Logger instance */
  logger?: Logger;
  /** Brain protocol instance */
  brainProtocol?: BrainProtocol;
}

export class SectionQualityService {
  private static instance: SectionQualityService | null = null;
  private brainProtocol: BrainProtocol | null = null;
  private logger: Logger;
  private templateEngine: TemplateEngine;
  private qualityThresholds: QualityThresholds;

  /**
   * Private constructor initializes dependencies
   * 
   * @param config Optional configuration
   * @param dependencies Optional service dependencies
   */
  private constructor(
    config?: SectionQualityServiceConfig,
    dependencies?: SectionQualityServiceDependencies,
  ) {
    // Set dependencies
    this.logger = dependencies?.logger || Logger.getInstance();
    this.brainProtocol = dependencies?.brainProtocol || null;
    this.templateEngine = TemplateEngine.getInstance();
    
    // Set configuration
    this.qualityThresholds = QualityThresholdsSchema.parse(config?.qualityThresholds || {});
  }

  /**
   * Get singleton instance of SectionQualityService
   * 
   * @param config Optional configuration
   * @param dependencies Optional service dependencies
   */
  static getInstance(
    config?: SectionQualityServiceConfig,
    dependencies?: SectionQualityServiceDependencies,
  ): SectionQualityService {
    if (!SectionQualityService.instance) {
      SectionQualityService.instance = new SectionQualityService(config, dependencies);
    }
    return SectionQualityService.instance;
  }

  /**
   * Reset the singleton instance (primarily for testing)
   */
  static resetInstance(): void {
    SectionQualityService.instance = null;
  }

  /**
   * Create a fresh instance (primarily for testing)
   * 
   * @param config Optional configuration
   * @param dependencies Optional service dependencies
   */
  static createFresh(
    config?: SectionQualityServiceConfig, 
    dependencies?: SectionQualityServiceDependencies,
  ): SectionQualityService {
    return new SectionQualityService(config, dependencies);
  }

  /**
   * Set quality thresholds for assessment
   * @param thresholds Custom quality thresholds
   */
  setQualityThresholds(thresholds: Partial<QualityThresholds>): void {
    this.qualityThresholds = {
      ...this.qualityThresholds,
      ...thresholds,
    };
  }

  /**
   * Get current quality thresholds
   * @returns The current quality thresholds
   */
  getQualityThresholds(): QualityThresholds {
    return { ...this.qualityThresholds };
  }

  /**
   * Assess the quality of a section
   * @param sectionType The type of section (e.g., "hero", "services")
   * @param sectionContent The content of the section to assess
   * @param identity Website identity data to use for assessment
   * @returns The quality assessment result
   */
  async assessSectionQuality<T>(
    sectionType: string,
    sectionContent: T,
    identity?: WebsiteIdentityData,
  ): Promise<SectionQualityAssessment> {
    try {
      this.logger.info(`Assessing quality for section: ${sectionType}`, {
        context: 'SectionQualityService',
      });

      // Get BrainProtocol instance
      const brainProtocol = this.getBrainProtocol();
      
      // Choose the appropriate template based on identity availability
      const templateText = identity ? sectionQualityAssessmentWithIdentityPrompt : sectionQualityAssessmentPrompt;
      
      // Prepare template data
      const templateData: Record<string, unknown> = {
        sectionType,
        sectionContent: JSON.stringify(sectionContent, null, 2),
      };
      
      // Add identity data if available
      if (identity) {
        // Map identity data to template variables
        Object.assign(templateData, this.extractIdentityDataForTemplate(identity));
      }
      
      // Render the template
      const prompt = this.templateEngine.render(templateText, templateData);

      // Process the assessment
      const result = await brainProtocol.processQuery(prompt, {
        userId: 'system',
        userName: 'System',
        schema: SectionQualityAssessmentSchema,
      });

      // Check if we received a structured object
      if (!result.object) {
        throw new Error(`Failed to generate structured quality assessment for ${sectionType}`);
      }

      // Determine if section should be enabled based on thresholds and required status
      const isRequired = REQUIRED_SECTION_TYPES.includes(sectionType);
      const meetsCombinedThreshold = 
        result.object.combinedScore >= this.qualityThresholds.minCombinedScore;
      const meetsQualityThreshold =
        result.object.qualityScore >= this.qualityThresholds.minQualityScore;
      const meetsConfidenceThreshold =
        result.object.confidenceScore >= this.qualityThresholds.minConfidenceScore;
      
      // A section is enabled if it's required OR meets all thresholds
      const enabled = isRequired || 
        (meetsCombinedThreshold && meetsQualityThreshold && meetsConfidenceThreshold);

      // Use Zod to parse and ensure correct types with defaults applied
      const assessment = SectionQualityAssessmentSchema.parse({
        ...result.object,
        enabled,
      });

      this.logger.debug(`Quality assessment complete for ${sectionType}`, {
        context: 'SectionQualityService',
        qualityScore: assessment.qualityScore,
        confidenceScore: assessment.confidenceScore,
        combinedScore: assessment.combinedScore,
        enabled: assessment.enabled,
      });

      return assessment;
    } catch (error) {
      this.logger.error(`Error assessing quality for section: ${sectionType}`, {
        error: error instanceof Error ? error.message : String(error),
        context: 'SectionQualityService',
      });
      throw error;
    }
  }

  /**
   * Improve the content of a section based on quality assessment
   * @param sectionType The type of section (e.g., "hero", "services")
   * @param sectionContent The content of the section to improve
   * @param assessment The quality assessment with improvement suggestions
   * @returns The improved section content
   */
  async improveSectionContent<T>(
    sectionType: string,
    sectionContent: T,
    assessment: SectionQualityAssessment,
    identity?: WebsiteIdentityData,
  ): Promise<T> {
    try {
      this.logger.info(`Improving content for section: ${sectionType}`, {
        context: 'SectionQualityService',
        originalQualityScore: assessment.qualityScore,
      });

      // No need to improve if score is already high
      if (assessment.qualityScore >= 9) {
        this.logger.info(`Section ${sectionType} already has high quality score, skipping improvement`, {
          context: 'SectionQualityService',
        });
        return sectionContent;
      }

      // Get BrainProtocol instance
      const brainProtocol = this.getBrainProtocol();

      // Create assessment summary
      const assessmentFeedback = `Quality Score: ${assessment.qualityScore}/10 - ${assessment.qualityJustification}
Confidence Score: ${assessment.confidenceScore}/10 - ${assessment.confidenceJustification}
Combined Score: ${assessment.combinedScore}/10

Suggested Improvements:
${assessment.suggestedImprovements}`;

      // Choose the appropriate template based on identity availability
      const templateText = identity ? sectionContentImprovementWithIdentityPrompt : sectionContentImprovementPrompt;
      
      // Prepare template data
      const templateData: Record<string, unknown> = {
        sectionType,
        sectionContent: JSON.stringify(sectionContent, null, 2),
        assessmentFeedback,
      };
      
      // Add identity data if available
      if (identity) {
        // Map identity data to template variables
        Object.assign(templateData, this.extractIdentityDataForTemplate(identity));
      }
      
      // Render the template
      const prompt = this.templateEngine.render(templateText, templateData);

      // Process the improvement
      const result = await brainProtocol.processQuery(prompt, {
        userId: 'system',
        userName: 'System',
      });

      // Check if we received a structured object
      if (!result.object) {
        this.logger.warn(`Failed to generate improved content for ${sectionType}, using original`, {
          context: 'SectionQualityService',
        });
        return sectionContent;
      }

      this.logger.debug(`Content improvement complete for ${sectionType}`, {
        context: 'SectionQualityService',
        hasImprovedContent: !!result.object,
      });

      // Return the improved content
      return result.object as T;
    } catch (error) {
      this.logger.error(`Error improving content for section: ${sectionType}`, {
        error: error instanceof Error ? error.message : String(error),
        context: 'SectionQualityService',
      });
      
      // If improvement fails, return the original content
      return sectionContent;
    }
  }

  /**
   * Process a section through both assessment and improvement phases
   * @param sectionType The type of section (e.g., "hero", "services")
   * @param sectionContent The content of the section to process
   * @param identity Website identity data to use for assessment
   * @returns The assessed section with potentially improved content
   */
  async processSectionWithQualityAssessment<T>(
    sectionType: string,
    sectionContent: T,
    identity: WebsiteIdentityData,
  ): Promise<AssessedSection<T>> {
    try {
      this.logger.info(`Processing section with quality assessment: ${sectionType}`, {
        context: 'SectionQualityService',
      });
      
      // Determine if this is a required section
      const isRequired = REQUIRED_SECTION_TYPES.includes(sectionType);
      
      // Phase 1: Assessment
      const initialAssessment = await this.assessSectionQuality(sectionType, sectionContent, identity);
      
      // Phase 2: Improvement (if needed)
      let improvedContent = sectionContent;
      let finalAssessment = initialAssessment;
      
      // Only improve if score is below 9 and there are suggestions
      if (initialAssessment.qualityScore < 9 && initialAssessment.suggestedImprovements) {
        improvedContent = await this.improveSectionContent(
          sectionType, 
          sectionContent, 
          initialAssessment,
          identity,
        );
        
        // Reassess the improved content
        if (improvedContent !== sectionContent) {
          finalAssessment = await this.assessSectionQuality(sectionType, improvedContent, identity);
          finalAssessment.improvementsApplied = true;
        }
      }
      
      // Create the assessed section
      const assessedSection: AssessedSection<T> = {
        content: improvedContent,
        assessment: finalAssessment,
        isRequired,
      };
      
      this.logger.info(`Completed quality assessment for ${sectionType}`, {
        context: 'SectionQualityService',
        initialQuality: initialAssessment.qualityScore,
        finalQuality: finalAssessment.qualityScore,
        enabled: finalAssessment.enabled,
        isRequired,
        improvementsApplied: finalAssessment.improvementsApplied,
      });
      
      return assessedSection;
    } catch (error) {
      this.logger.error(`Error processing section with quality assessment: ${sectionType}`, {
        error: error instanceof Error ? error.message : String(error),
        context: 'SectionQualityService',
      });
      
      // If assessment fails, return section as is with required status
      const isRequired = REQUIRED_SECTION_TYPES.includes(sectionType);
      return {
        content: sectionContent,
        isRequired,
      };
    }
  }

  /**
   * Get the Brain Protocol instance used for AI operations
   * @public Exposed for testing purposes
   */
  public getBrainProtocol(): BrainProtocol {
    if (!this.brainProtocol) {
      // If not explicitly set, use the singleton instance from the service registry
      this.brainProtocol = BrainProtocol.getInstance();
    }
    return this.brainProtocol;
  }

  /**
   * Set the dependencies
   * @param dependencies The dependencies to set
   */
  public setDependencies(dependencies: Partial<SectionQualityServiceDependencies>): void {
    if (dependencies.logger) {
      this.logger = dependencies.logger;
    }
    if (dependencies.brainProtocol) {
      this.brainProtocol = dependencies.brainProtocol;
    }
  }
  
  /**
   * Extract identity data for use in prompt templates
   * @param identity The website identity data
   * @returns Object with identity data mapped to template variables
   */
  private extractIdentityDataForTemplate(identity: WebsiteIdentityData): Record<string, unknown> {
    return {
      // Personal data
      name: identity.name,
      occupation: identity.occupation,
      industry: identity.industry,
      
      // Creative content
      tagline: identity.tagline,
      description: identity.description,
      uniqueValue: identity.uniqueValue 
        ? `Unique value: ${identity.uniqueValue}` 
        : '',
      
      // Brand identity - tone
      formality: identity.formality,
      personality: identity.personality.join(', '),
      emotion: identity.emotion,
      
      // Brand identity - content style
      writingStyle: identity.writingStyle,
      sentenceLength: identity.sentenceLength,
      vocabLevel: identity.vocabLevel,
      useJargon: identity.useJargon ? 'yes' : 'no',
      useHumor: identity.useHumor ? 'yes' : 'no',
      useStories: identity.useStories ? 'yes' : 'no',
      
      // Brand identity - values
      coreValues: identity.coreValues.join(', '),
      targetAudience: identity.targetAudience.join(', '),
      painPoints: identity.painPoints.join(', '),
      desiredAction: identity.desiredAction,
    };
  }
}

export default SectionQualityService;