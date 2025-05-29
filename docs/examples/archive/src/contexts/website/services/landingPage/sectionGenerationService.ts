import type { z } from 'zod';

import { BrainProtocol } from '@/protocol/brainProtocol';
import { Logger } from '@/utils/logger';
import { TemplateEngine } from '@/utils/templateEngine';
import type { LandingPageData } from '@website/schemas';

import type { WebsiteIdentityData } from '../../schemas/websiteIdentitySchema';
import type { 
  SectionGenerationOptions,
  SectionGenerationResult,
} from '../../types/landingPageTypes';
import { SectionGenerationStatus } from '../../types/landingPageTypes';

import { FallbackContentGenerator } from './fallbackContentGenerator';

/**
 * Service for generating individual landing page sections
 * Handles section generation, error handling, retries, and fallbacks
 * Implements the Component Interface Standardization pattern
 */
export class SectionGenerationService {
  private static instance: SectionGenerationService | null = null;
  private brainProtocol: BrainProtocol | null = null;
  private logger: Logger;
  private templateEngine: TemplateEngine;
  private fallbackContentGenerator: FallbackContentGenerator;
  
  /**
   * Private constructor initializes dependencies
   */
  private constructor() {
    this.logger = Logger.getInstance();
    this.templateEngine = TemplateEngine.getInstance();
    this.fallbackContentGenerator = FallbackContentGenerator.getInstance();
  }
  
  /**
   * Get singleton instance of SectionGenerationService
   */
  static getInstance(): SectionGenerationService {
    if (!SectionGenerationService.instance) {
      SectionGenerationService.instance = new SectionGenerationService();
    }
    return SectionGenerationService.instance;
  }
  
  /**
   * Reset the singleton instance (primarily for testing)
   */
  static resetInstance(): void {
    SectionGenerationService.instance = null;
  }
  
  /**
   * Create a fresh instance (primarily for testing)
   */
  static createFresh(): SectionGenerationService {
    return new SectionGenerationService();
  }
  
  /**
   * Generate content for a specific section with error handling
   * @param landingPage - Landing page to update
   * @param sectionType - Type of section to generate
   * @param promptTemplate - The prompt template to use
   * @param schema - The schema to validate the generated content
   * @param identity - Website identity data to use
   * @param options - Optional generation options
   * @returns Result of the generation attempt
   */
  public async generateSection(
    landingPage: LandingPageData,
    sectionType: string,
    promptTemplate: string,
    schema: z.ZodSchema,
    identity: WebsiteIdentityData,
    options?: SectionGenerationOptions,
  ): Promise<SectionGenerationResult<unknown>> {
    this.logger.debug(`Generating content for section: ${sectionType}`, {
      context: 'SectionGenerationService',
      usingIdentity: !!identity,
      isRetry: options?.isRetry,
    });
    
    // Initialize result with starting status
    const result: SectionGenerationResult<unknown> = {
      status: SectionGenerationStatus.InProgress,
      retryCount: options?.isRetry ? 1 : 0,
    };
    
    const startTime = Date.now();
    
    try {
      // Prepare template data
      const templateData: Record<string, unknown> = {
        ...landingPage,
        sectionType,
        isRetry: options?.isRetry || false,
        identity: identity || undefined,
        // Include brand guidelines as a field that can be included conditionally
        brandGuidelines: identity ? this.createBrandGuidelinesFromIdentity(identity) : undefined,
        // Add retry message if this is a retry attempt
        retryMessage: options?.isRetry 
          ? 'IMPORTANT: Previous generation attempt failed. Please ensure the response follows the required schema structure exactly.'
          : undefined,
      };
      
      // Use template engine to render the prompt
      const prompt = this.templateEngine.renderWithConditionals(promptTemplate, templateData);
      
      // Generate content for this section using the schema
      const generationResult = await this.getBrainProtocol().processQuery(prompt, {
        userId: 'system',
        userName: 'System',
        schema: schema,
      });
      
      if (!generationResult.object) {
        throw new Error(`Failed to generate structured content for section: ${sectionType}`);
      }
      
      // Get the current section
      const sectionKey = sectionType as keyof LandingPageData;
      const currentSection = landingPage[sectionKey];
      
      if (!currentSection) {
        throw new Error(`Section ${sectionType} not found in landing page`);
      }
      
      // Parse the generated content with the section schema
      // Convert to objects before spreading to satisfy TypeScript
      const currentSectionObj = typeof currentSection === 'object' && currentSection !== null ? currentSection : {};
      const resultObj = typeof generationResult.object === 'object' && generationResult.object !== null ? generationResult.object : {};
      
      const validatedContent = schema.parse({
        ...currentSectionObj,
        ...resultObj,
      });
      
      // Update the landing page with the validated content
      (landingPage as Partial<LandingPageData>)[sectionKey] = validatedContent;
      
      // Update generation result
      const endTime = Date.now();
      result.status = SectionGenerationStatus.Completed;
      result.data = validatedContent;
      result.duration = endTime - startTime;
      
      this.logger.debug(`Successfully generated content for section: ${sectionType}`, {
        context: 'SectionGenerationService',
        isRetry: options?.isRetry,
        duration: endTime - startTime,
      });
      
      return result;
    } catch (error) {
      // Update generation result with error
      const endTime = Date.now();
      result.status = SectionGenerationStatus.Failed;
      result.error = error instanceof Error ? error.message : String(error);
      result.duration = endTime - startTime;
      
      this.logger.error(`Error generating content for section: ${sectionType}`, {
        error: result.error,
        context: 'SectionGenerationService',
        isRetry: options?.isRetry,
      });
      
      throw error; // Re-throw to allow caller to handle
    }
  }
  
  /**
   * Apply fallback content for a section that failed to generate
   * @param landingPage - Landing page to update
   * @param sectionType - Type of section that failed
   * @returns The fallback content that was applied
   */
  public applyFallbackContent(
    landingPage: LandingPageData,
    sectionType: string,
  ): unknown {
    this.logger.debug(`Applying fallback content for section: ${sectionType}`, {
      context: 'SectionGenerationService',
    });
    
    // Get fallback content for this section
    const fallbackContent = this.fallbackContentGenerator.getFallbackContent(sectionType);
    
    // Apply fallback content to the landing page
    // Use type assertion since we know the structure but TypeScript doesn't
    const sectionKey = sectionType as keyof LandingPageData;
    (landingPage as Record<string, unknown>)[sectionKey] = fallbackContent;
    
    return fallbackContent;
  }
  
  /**
   * Create brand guidelines text from identity
   * @param identity The website identity data
   * @returns Text with brand guidelines for AI prompts
   */
  private createBrandGuidelinesFromIdentity(identity: WebsiteIdentityData): string {
    // Format tone information
    const toneDescription = `Tone: ${identity.formality} and ${identity.emotion}. Personality traits: ${identity.personality.join(', ')}.`;
    
    // Format content style information
    const styleDescription = `Style: ${identity.writingStyle}. Use ${identity.sentenceLength} sentences and ${identity.vocabLevel} vocabulary.` +
      (identity.useJargon ? ' Include industry-specific terminology.' : ' Avoid jargon.') +
      (identity.useHumor ? ' Include appropriate humor.' : ' Maintain serious tone.') +
      (identity.useStories ? ' Use storytelling elements.' : ' Focus on facts.');
    
    // Format values information
    const valuesDescription = `Core values: ${identity.coreValues.join(', ')}. ` +
      `Target audience: ${identity.targetAudience.join(', ')}. ` +
      `Pain points to address: ${identity.painPoints.join(', ')}. ` +
      `Desired action: ${identity.desiredAction}.`;
    
    // Combine into guidelines block
    return `
BRAND IDENTITY GUIDELINES:

${toneDescription}

${styleDescription}

${valuesDescription}

NAME: ${identity.name}
TAGLINE: ${identity.tagline}
UNIQUE VALUE: ${identity.uniqueValue || 'Not specified'}

Please ensure all content follows these brand guidelines consistently.
`;
  }
  
  /**
   * Get the Brain Protocol instance used for AI operations
   */
  private getBrainProtocol(): BrainProtocol {
    if (!this.brainProtocol) {
      // If not explicitly set, use the singleton instance
      this.brainProtocol = BrainProtocol.getInstance();
    }
    return this.brainProtocol;
  }
  
  /**
   * Set the Brain Protocol instance
   * @param protocol The brain protocol instance to use
   */
  public setBrainProtocol(protocol: BrainProtocol): void {
    this.brainProtocol = protocol;
  }
}

export default SectionGenerationService;