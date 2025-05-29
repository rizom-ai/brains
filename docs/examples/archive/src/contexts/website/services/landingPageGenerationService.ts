import type { z } from 'zod';

import { BrainProtocol } from '@/protocol/brainProtocol';
import { Logger } from '@/utils/logger';
import { 
  AboutSectionSchema,
  CaseStudiesSectionSchema,
  CtaSectionSchema,
  ExpertiseSectionSchema,
  FaqSectionSchema,
  FooterSectionSchema,
  HeroSectionSchema, 
  LandingPageSchema, 
  PricingSectionSchema,
  ProblemStatementSectionSchema,
  ProcessSectionSchema,
  ServicesSectionSchema,
} from '@website/schemas';
import type { LandingPageData } from '@website/schemas';
import type { AssessedSection } from '@website/schemas/sectionQualitySchema';
import { REQUIRED_SECTION_TYPES } from '@website/schemas/sectionQualitySchema';

import type { WebsiteIdentityData } from '../schemas/websiteIdentitySchema';
import type { 
  LandingPageGenerationOptions,
  LandingPageGenerationResult,
  LandingPageGenerationStatus,
  SectionGenerationOptions,
} from '../types/landingPageTypes';
import { SectionGenerationStatus } from '../types/landingPageTypes';

import { SectionGenerationService } from './landingPage/sectionGenerationService';
import { SectionQualityService } from './landingPage/sectionQualityService';
// We're now using section-by-section approach instead of holistic content review
import sectionContentReviewPrompt from './prompts/section-content-review.txt';
import aboutPrompt from './prompts/sections/about.txt';
import caseStudiesPrompt from './prompts/sections/case-studies.txt';
import ctaPrompt from './prompts/sections/cta.txt';
import expertisePrompt from './prompts/sections/expertise.txt';
import faqPrompt from './prompts/sections/faq.txt';
import footerPrompt from './prompts/sections/footer.txt';
import heroSectionPrompt from './prompts/sections/hero-section.txt';
import pricingPrompt from './prompts/sections/pricing.txt';
import problemStatementPrompt from './prompts/sections/problem-statement.txt';
import processPrompt from './prompts/sections/process.txt';
import servicesPrompt from './prompts/sections/services.txt';

/**
 * Options for landing page quality assessment
 */
export interface LandingPageQualityAssessmentOptions {
  /** Custom thresholds for section quality assessment */
  qualityThresholds?: {
    minCombinedScore?: number;
    minQualityScore?: number;
    minConfidenceScore?: number;
  };
  /** 
   * Whether to apply the enablement recommendations immediately
   * If false, only returns the recommendations without modifying the landing page
   */
  applyRecommendations?: boolean;
}

/**
 * Service for generating landing page content
 * Implements the Component Interface Standardization pattern
 */
export class LandingPageGenerationService {
  private static instance: LandingPageGenerationService | null = null;
  private brainProtocol: BrainProtocol | null = null;
  private logger = Logger.getInstance();
  private sectionQualityService: SectionQualityService;
  private sectionGenerationService: SectionGenerationService;
  
  // Record to store section quality assessments
  private assessedSections: Record<string, AssessedSection<unknown>> = {};
  
  // Record to track section generation status
  private generationStatus: LandingPageGenerationStatus = {};
  
  // Section schemas keyed by section type
  private sectionSchemas: Record<string, z.ZodSchema> = {
    hero: HeroSectionSchema,
    problemStatement: ProblemStatementSectionSchema,
    services: ServicesSectionSchema,
    process: ProcessSectionSchema,
    caseStudies: CaseStudiesSectionSchema,
    expertise: ExpertiseSectionSchema,
    about: AboutSectionSchema,
    pricing: PricingSectionSchema,
    faq: FaqSectionSchema,
    cta: CtaSectionSchema,
    footer: FooterSectionSchema,
  };
  
  // Map of section types to their corresponding prompts
  private sectionPrompts: Record<string, string> = {
    hero: heroSectionPrompt,
    problemStatement: problemStatementPrompt,
    services: servicesPrompt,
    process: processPrompt,
    caseStudies: caseStudiesPrompt,
    expertise: expertisePrompt,
    about: aboutPrompt,
    pricing: pricingPrompt,
    faq: faqPrompt,
    cta: ctaPrompt,
    footer: footerPrompt,
  };

  /**
   * Private constructor initializes dependencies
   */
  private constructor() {
    this.sectionQualityService = SectionQualityService.getInstance();
    this.sectionGenerationService = SectionGenerationService.getInstance();
  }

  /**
   * Get singleton instance of LandingPageGenerationService
   */
  static getInstance(): LandingPageGenerationService {
    if (!LandingPageGenerationService.instance) {
      LandingPageGenerationService.instance = new LandingPageGenerationService();
    }
    return LandingPageGenerationService.instance;
  }

  /**
   * Reset the singleton instance (primarily for testing)
   */
  static resetInstance(): void {
    LandingPageGenerationService.instance = null;
  }

  /**
   * Create a fresh instance (primarily for testing)
   */
  static createFresh(): LandingPageGenerationService {
    return new LandingPageGenerationService();
  }

  /**
   * Generate a complete landing page without holistic editing
   * The editing phase has been separated for better reliability
   * 
   * @param identity Website identity data to use for generation
   * @param onProgress Optional callback for progress tracking
   * @param options Optional configuration for generation behavior
   * @returns A landing page data structure with content and generation status
   */
  async generateLandingPageData(
    identity: WebsiteIdentityData,
    onProgress?: (step: string, index: number) => void,
    options?: LandingPageGenerationOptions,
  ): Promise<LandingPageGenerationResult> {
    this.logger.info('Starting landing page generation', {
      context: 'LandingPageGenerationService',
      usingIdentity: !!identity,
      options,
    });
    
    // Set defaults for options
    const maxRetries = options?.maxRetries ?? 1;
    const continueOnError = options?.continueOnError ?? true;
    
    // Clear any previous assessment data and generation status
    this.assessedSections = {};
    this.generationStatus = {};
    
    try {
      // Create the basic structure for the landing page
      let landingPage = this.createBasicLandingPage();
      
      // Apply identity data if available
      if (identity) {
        this.applyIdentityToLandingPage(landingPage, identity);
      }
      
      // Generate content for each section individually with error handling
      landingPage = await this.generateAllSections(
        landingPage, 
        identity, 
        onProgress,
        { maxRetries, continueOnError },
      );
      
      this.logger.info('Completed landing page generation', {
        context: 'LandingPageGenerationService',
        statusSummary: this.summarizeGenerationStatus(),
      });
      
      return {
        landingPage,
        generationStatus: { ...this.generationStatus },
      };
    } catch (error) {
      this.logger.error('Error generating landing page', {
        error: error instanceof Error ? error.message : String(error),
        context: 'LandingPageGenerationService',
      });
      
      // Return what we have with error status
      // This will only happen if continueOnError is false and a section fails
      throw error;
    }
  }
  
  /**
   * Helper method to summarize generation status for logging
   * @returns Summary of generation status (success count, failure count, etc.)
   */
  private summarizeGenerationStatus(): Record<string, number> {
    const summary = {
      total: 0,
      completed: 0,
      failed: 0,
      pending: 0,
    };
    
    Object.values(this.generationStatus).forEach(status => {
      summary.total++;
      if (status.status === SectionGenerationStatus.Completed) {
        summary.completed++;
      } else if (status.status === SectionGenerationStatus.Failed) {
        summary.failed++;
      } else if (status.status === SectionGenerationStatus.Pending) {
        summary.pending++;
      }
    });
    
    return summary;
  }

  /**
   * Get the quality assessment results for all sections
   * @returns Record of section assessments
   */
  getSectionQualityAssessments(): Record<string, AssessedSection<unknown>> {
    return { ...this.assessedSections };
  }
  
  /**
   * Assess the quality of a landing page and return recommendations
   * This is a separate step from generation that can be run on demand
   * 
   * @param landingPage - The landing page to assess
   * @param options - Options for quality assessment
   * @returns The assessed landing page with quality data and optional enablement applied
   */
  async assessLandingPageQuality(
    landingPage: LandingPageData,
    identity: WebsiteIdentityData,
    options: LandingPageQualityAssessmentOptions = {},
  ): Promise<{ 
    landingPage: LandingPageData; 
    assessments: Record<string, AssessedSection<unknown>>;
  }> {
    this.logger.info('Starting landing page quality assessment', {
      context: 'LandingPageGenerationService',
    });
    
    // Clear any previous assessment data
    this.assessedSections = {};
    
    // Set custom quality thresholds if provided
    if (options.qualityThresholds) {
      this.sectionQualityService.setQualityThresholds(options.qualityThresholds);
    }
    
    try {
      // Create a copy of the landing page to avoid modifying the original
      let assessedLandingPage = { ...landingPage };
      
      // Process sections with quality assessment
      assessedLandingPage = await this.assessAndImproveSections(assessedLandingPage, identity);
      
      // If requested, apply the enablement recommendations
      if (options.applyRecommendations) {
        // Update section order based on enabled sections
        assessedLandingPage.sectionOrder = this.buildSectionOrderFromEnabledSections(assessedLandingPage);
      }
      
      this.logger.info('Completed landing page quality assessment', {
        context: 'LandingPageGenerationService',
      });
      
      return {
        landingPage: assessedLandingPage,
        assessments: { ...this.assessedSections },
      };
    } catch (error) {
      this.logger.error('Error during landing page quality assessment', {
        error: error instanceof Error ? error.message : String(error),
        context: 'LandingPageGenerationService',
      });
      throw error;
    }
  }

  /**
   * Apply identity data to a landing page
   * @param landingPage The landing page to update
   * @param identity The identity data to apply
   */
  private applyIdentityToLandingPage(landingPage: LandingPageData, identity: WebsiteIdentityData): void {
    // Apply identity data
    landingPage.name = identity.name;
    landingPage.title = identity.title;
    landingPage.description = identity.description;
    landingPage.tagline = identity.tagline;
    
    this.logger.debug('Applied identity data to landing page', {
      context: 'LandingPageGenerationService',
    });
  }
  
  /**
   * Create the basic structure for a landing page
   */
  private createBasicLandingPage(): LandingPageData {
    // Basic landing page with empty sections
    const currentYear = new Date().getFullYear();
    
    const baseLandingPage = {
      title: 'Professional Services',
      description: 'Professional expertise and services',
      name: 'Professional Expert',
      tagline: 'Expert services for your needs',
      
      // Default section order
      sectionOrder: [
        'hero',
        'problemStatement',
        'services',
        'process',
        'caseStudies',
        'expertise',
        'about',
        'pricing',
        'faq',
        'cta',
        'footer',
      ],
      
      // Initialize sections with minimal required content
      hero: {
        headline: 'Professional Services',
        subheading: 'Expert solutions for your needs',
        ctaText: 'Get in Touch',
        ctaLink: '#contact',
      },
      problemStatement: {
        title: 'Challenges We Solve',
        description: 'Addressing common problems in the industry',
        enabled: true,
      },
      services: {
        title: 'Services',
        items: [{ title: 'Professional Service', description: 'High-quality professional service' }],
      },
      process: {
        title: 'How I Work',
        steps: [{ step: 1, title: 'Initial Consultation', description: 'Understanding your needs' }],
        enabled: true,
      },
      caseStudies: {
        title: 'Selected Projects',
        items: [],
        enabled: true,
      },
      expertise: {
        title: 'Expertise',
        items: [
          { title: 'Professional Expertise', description: 'Years of industry experience' },
          { title: 'Strategic Planning', description: 'Developing effective strategies for success' },
          { title: 'Project Management', description: 'Delivering projects on time and within budget' },
        ],
        enabled: true,
      },
      about: {
        title: 'About Me',
        content: 'Professional with expertise in the field.',
        enabled: true,
      },
      pricing: {
        title: 'Packages & Pricing',
        tiers: [],
        enabled: false, // Disabled by default
      },
      faq: {
        title: 'Frequently Asked Questions',
        items: [
          { question: 'What services do you offer?', answer: 'Professional services tailored to your needs.' },
          { question: 'How long does a typical project take?', answer: 'Project timelines vary based on scope and complexity, but we provide detailed estimates during consultation.' },
          { question: 'What is your approach to client collaboration?', answer: 'We believe in transparent, regular communication throughout the project lifecycle.' },
        ],
        enabled: true,
      },
      cta: {
        title: 'Ready to Get Started?',
        buttonText: 'Contact Me',
        buttonLink: '#contact',
        enabled: true,
      },
      footer: {
        copyrightText: `© ${currentYear} Professional Expert`,
        contactDetails: {
          email: 'contact@example.com',
          phone: '+1 (123) 456-7890',
          social: [
            {
              platform: 'twitter',
              url: 'https://twitter.com/example',
            },
            {
              platform: 'linkedin',
              url: 'https://linkedin.com/in/example',
            },
          ],
        },
        links: [
          {
            text: 'Home',
            url: '/',
          },
          {
            text: 'Services',
            url: '#services',
          },
          {
            text: 'About',
            url: '#about',
          },
          {
            text: 'Contact',
            url: '#contact',
          },
        ],
        enabled: true,
      },
    };
    
    // Validate and parse using the schema to ensure correct structure with defaults
    return LandingPageSchema.parse(baseLandingPage);
  }

  /**
   * Generate content for all sections with error handling for each section
   * @param landingPage - Basic landing page structure
   * @param identity - Website identity data to use for generation
   * @param onProgress - Optional callback for progress updates
   * @param options - Optional configuration for generation behavior
   */
  private async generateAllSections(
    landingPage: LandingPageData,
    identity: WebsiteIdentityData,
    onProgress?: (step: string, index: number) => void,
    options?: LandingPageGenerationOptions,
  ): Promise<LandingPageData> {
    this.logger.info('Generating content for each section', {
      context: 'LandingPageGenerationService',
      usingIdentity: !!identity,
    });
    
    const updatedLandingPage = { ...landingPage };
    const maxRetries = options?.maxRetries ?? 1;
    const continueOnError = options?.continueOnError ?? true;
    
    // Progress tracking for sections - map to steps in CLI
    const sectionToStepMap: Record<string, { step: string, index: number }> = {
      'hero': { step: 'Generating hero section', index: 2 },
      'problemStatement': { step: 'Creating problem statement', index: 3 },
      'services': { step: 'Developing services content', index: 4 },
      'process': { step: 'Building process description', index: 5 },
      'expertise': { step: 'Adding expertise highlights', index: 6 },
      'caseStudies': { step: 'Creating case studies', index: 7 },
      'pricing': { step: 'Adding pricing information', index: 8 },
      'faq': { step: 'Building FAQ section', index: 9 },
      // Map other sections to appropriate steps
      'about': { step: 'Adding about section', index: 6 },
      'cta': { step: 'Adding call to action', index: 10 },
      'footer': { step: 'Creating footer', index: 10 },
    };
    
    // Generate each section one by one with error handling
    for (const sectionType of updatedLandingPage.sectionOrder) {
      if (this.sectionSchemas[sectionType as keyof typeof this.sectionSchemas]) {
        // Initialize status for this section to pending
        this.generationStatus[sectionType] = {
          status: SectionGenerationStatus.Pending,
          retryCount: 0,
        };
        
        // Report progress if we have a mapping for this section type
        if (onProgress && sectionToStepMap[sectionType]) {
          const { step, index } = sectionToStepMap[sectionType];
          onProgress(step, index);
        }
        
        try {
          // Update status to in progress
          this.generationStatus[sectionType] = {
            status: SectionGenerationStatus.InProgress,
            retryCount: 0,
          };
          
          const startTime = Date.now();
          
          // Generate the section content
          await this.generateSectionContent(updatedLandingPage, sectionType, identity);
          
          const endTime = Date.now();
          
          // Update status to completed
          this.generationStatus[sectionType] = {
            status: SectionGenerationStatus.Completed,
            data: (updatedLandingPage as Record<string, unknown>)[sectionType],
            duration: endTime - startTime,
          };
        } catch (error) {
          this.logger.error(`Error generating ${sectionType} section`, {
            error: error instanceof Error ? error.message : String(error),
            context: 'LandingPageGenerationService',
          });
          
          // Try to retry the section generation
          let retried = false;
          
          if (maxRetries > 0) {
            this.generationStatus[sectionType] = {
              status: SectionGenerationStatus.Retrying,
              error: error instanceof Error ? error.message : String(error),
              retryCount: 1,
            };
            
            try {
              this.logger.info(`Retrying ${sectionType} section generation with simplified prompt`);
              const startTime = Date.now();
              
              // Generate with simplified options during retry
              await this.generateSectionContent(
                updatedLandingPage, 
                sectionType, 
                identity, 
                { isRetry: true, simplifyPrompt: true },
              );
              
              const endTime = Date.now();
              
              // Update status to completed after successful retry
              this.generationStatus[sectionType] = {
                status: SectionGenerationStatus.Completed,
                data: (updatedLandingPage as Record<string, unknown>)[sectionType],
                retryCount: 1,
                duration: endTime - startTime,
              };
              
              retried = true;
            } catch (retryError) {
              this.logger.error(`Retry failed for ${sectionType} section`, { 
                error: retryError instanceof Error ? retryError.message : String(retryError),
                context: 'LandingPageGenerationService', 
              });
              // Fall through to error handling
            }
          }
          
          if (!retried) {
            // If retry failed or not attempted, mark as failed
            this.generationStatus[sectionType] = {
              status: SectionGenerationStatus.Failed,
              error: error instanceof Error ? error.message : String(error),
              retryCount: this.generationStatus[sectionType].retryCount,
            };
            
            // Apply fallback content using the SectionGenerationService
            const fallbackContent = this.sectionGenerationService.applyFallbackContent(
              updatedLandingPage, 
              sectionType,
            );
            
            // Store fallback content in status
            this.generationStatus[sectionType].data = fallbackContent;
            
            // Throw if not configured to continue on error
            if (!continueOnError) {
              throw new Error(`Failed to generate ${sectionType} section: ${error}`);
            }
          }
        }
      }
    }
    
    // Final step
    onProgress?.('Finalizing content', 10);
    
    return updatedLandingPage;
  }


  /**
   * Create brand guidelines text from identity
   * @param identity The website identity data
   * @returns Text with brand guidelines for AI prompts
   */
  private createBrandGuidelinesFromIdentity(identity: WebsiteIdentityData): string {
    // Extract brand identity information
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
   * Generate content for a specific section
   * @param landingPage - Landing page to update
   * @param sectionType - Type of section to generate
   * @param identity - Website identity data to use for generation
   * @param options - Optional generation options
   */
  private async generateSectionContent(
    landingPage: LandingPageData, 
    sectionType: string,
    identity: WebsiteIdentityData,
    options?: SectionGenerationOptions,
  ): Promise<void> {
    this.logger.debug(`Generating content for section: ${sectionType}`, {
      context: 'LandingPageGenerationService',
      usingIdentity: !!identity,
      isRetry: options?.isRetry,
    });
    
    // Skip if no prompt template exists for this section
    if (!this.sectionPrompts[sectionType]) {
      this.logger.warn(`No prompt template found for section: ${sectionType}`, {
        context: 'LandingPageGenerationService',
      });
      throw new Error(`No prompt template found for section: ${sectionType}`);
    }
    
    // Get the schema for this section
    const schema = this.sectionSchemas[sectionType as keyof typeof this.sectionSchemas];
    if (!schema) {
      this.logger.warn(`No schema found for section: ${sectionType}`, {
        context: 'LandingPageGenerationService',
      });
      throw new Error(`No schema found for section: ${sectionType}`);
    }
    
    // Get the prompt template for this section
    const promptTemplate = this.sectionPrompts[sectionType];
    
    // Generate the section content using the SectionGenerationService
    try {
      await this.sectionGenerationService.generateSection(
        landingPage,
        sectionType,
        promptTemplate,
        schema,
        identity,
        options,
      );
    } catch (error) {
      // Log the error at this level too for coordination purposes
      this.logger.error(`Error in LandingPageGenerationService when generating ${sectionType} section`, {
        error: error instanceof Error ? error.message : String(error),
        context: 'LandingPageGenerationService',
      });
      
      // Re-throw the error to be handled by the caller
      throw error;
    }
  }

  // The performHolisticEditing method has been replaced by public editLandingPage method

  /**
   * Assess and improve all sections of the landing page
   * @param landingPage - Generated landing page data
   * @param identity - Website identity data to use for assessment
   */
  private async assessAndImproveSections(
    landingPage: LandingPageData,
    identity: WebsiteIdentityData,
  ): Promise<LandingPageData> {
    this.logger.debug('Starting section quality assessment', {
      context: 'LandingPageGenerationService',
    });
    
    const assessedLandingPage = { ...landingPage };
    
    // Process each section with quality assessment
    for (const sectionType of Object.keys(landingPage)) {
      // Skip non-section properties
      if (['title', 'description', 'name', 'tagline', 'sectionOrder'].includes(sectionType)) {
        continue;
      }
      
      // Get the section content
      const sectionKey = sectionType as keyof LandingPageData;
      const section = landingPage[sectionKey];
      
      // Skip if section doesn't exist
      if (!section) {
        continue;
      }
      
      const schema = this.sectionSchemas[sectionType as keyof typeof this.sectionSchemas];
      if (!schema) {
        continue;
      }
      
      this.logger.debug(`Processing section with quality assessment: ${sectionType}`, {
        context: 'LandingPageGenerationService',
      });
      
      try {
        // Process the section with quality assessment
        const assessedSection = await this.sectionQualityService.processSectionWithQualityAssessment(
          sectionType,
          section,
          identity,
        );
        
        // Store the assessed section for later use
        this.assessedSections[sectionType] = assessedSection;
        
        if (assessedSection.content) {
          // Validate the improved content with the section schema
          const validatedContent = schema.parse(assessedSection.content);
          
          // Update the landing page with the validated content
          // Use a type assertion to treat the validated content as part of the landing page
          (assessedLandingPage as Partial<LandingPageData>)[sectionKey] = validatedContent;
          
          // Update the enabled status based on the assessment
          if (assessedSection.assessment && 'enabled' in validatedContent) {
            (validatedContent as unknown as { enabled: boolean }).enabled = assessedSection.assessment.enabled;
          }
        }
      } catch (error) {
        this.logger.error(`Error assessing section: ${sectionType}`, {
          error: error instanceof Error ? error.message : String(error),
          context: 'LandingPageGenerationService',
        });
        // Continue with other sections even if one fails
      }
    }
    
    return assessedLandingPage;
  }

  /**
   * Build section order based on enabled sections
   * @param landingPage - Assessed landing page data
   */
  private buildSectionOrderFromEnabledSections(landingPage: LandingPageData): string[] {
    // Start with the original section order
    const newSectionOrder: string[] = [];
    
    // Include only sections that are enabled or required
    for (const sectionType of landingPage.sectionOrder) {
      const sectionKey = sectionType as keyof LandingPageData;
      const section = landingPage[sectionKey];
      
      if (!section) {
        continue;
      }
      
      const isRequired = REQUIRED_SECTION_TYPES.includes(sectionType);
      // Check if section is an object and has enabled property
      const sectionEnabled = (typeof section === 'object' && section !== null && 'enabled' in section) 
        ? (section as unknown as { enabled: boolean }).enabled === true 
        : true;
      
      if (isRequired || sectionEnabled) {
        newSectionOrder.push(sectionType);
      }
    }
    
    return newSectionOrder;
  }

  /**
   * Edit a landing page for consistency across sections
   * This is a separate operation that can be run after generation
   * Uses a section-by-section approach to avoid schema validation issues
   * 
   * @param landingPage - The landing page to edit
   * @param identity - Optional website identity data to use for editing
   * @returns The edited landing page with improved consistency
   */
  async editLandingPage(
    landingPage: LandingPageData, 
    identity?: WebsiteIdentityData | null,
  ): Promise<LandingPageData> {
    this.logger.info('Performing holistic content review and editing', {
      context: 'LandingPageGenerationService',
      usingIdentity: !!identity,
    });
    
    try {
      // Create a working copy of the landing page
      const editedLandingPage = { ...landingPage };
      
      // Apply identity data if available (to ensure consistency)
      if (identity) {
        this.applyIdentityToLandingPage(editedLandingPage, identity);
      }
      
      // Edit basic information (title, description, name, tagline)
      // Only if we're not using identity, otherwise keep identity values
      if (!identity) {
        await this.editBasicInfo(editedLandingPage);
      }
      
      // Process individual sections that need content review
      for (const sectionType of editedLandingPage.sectionOrder) {
        await this.editSectionContent(editedLandingPage, sectionType, identity);
      }
      
      this.logger.info('Successfully edited landing page for consistency', {
        context: 'LandingPageGenerationService',
      });
      
      return editedLandingPage;
    } catch (error) {
      this.logger.error('Error during holistic content review', {
        error: error instanceof Error ? error.message : String(error),
        context: 'LandingPageGenerationService',
      });
      
      // Return the original if there's an error
      return landingPage;
    }
  }
  
  /**
   * Edit basic information fields (title, description, name, tagline)
   * @param landingPage - Landing page to update
   */
  private async editBasicInfo(landingPage: LandingPageData): Promise<void> {
    this.logger.debug('Editing basic information', {
      context: 'LandingPageGenerationService',
    });
    
    const basicInfoPrompt = `Review and improve the following basic information for a professional landing page:

Title: ${landingPage.title}
Description: ${landingPage.description}
Name: ${landingPage.name}
Tagline: ${landingPage.tagline}

Focus on clarity, professionalism, and persuasiveness. Make the description more SEO-friendly.
Keep the tone consistent across all items. Return only these four fields in JSON format.`;
    
    try {
      const result = await this.getBrainProtocol().processQuery(basicInfoPrompt, {
        userId: 'system',
        userName: 'System',
      });
      
      if (result.object) {
        const identityInfo = result.object as Partial<LandingPageData>;
        
        // Update fields with type checking
        if (typeof identityInfo.title === 'string') landingPage.title = identityInfo.title;
        if (typeof identityInfo.description === 'string') landingPage.description = identityInfo.description;
        if (typeof identityInfo.name === 'string') landingPage.name = identityInfo.name;
        if (typeof identityInfo.tagline === 'string') landingPage.tagline = identityInfo.tagline;
        
        this.logger.debug('Edited basic information', {
          context: 'LandingPageGenerationService',
        });
      }
    } catch (error) {
      this.logger.error('Error editing basic information', {
        error: error instanceof Error ? error.message : String(error),
        context: 'LandingPageGenerationService',
      });
      // Continue with other edits if this fails
    }
  }
  
  /**
   * Edit content for a specific section
   * @param landingPage - Landing page to update
   * @param sectionType - Type of section to edit
   * @param identity - Optional website identity data to use for editing
   */
  private async editSectionContent(
    landingPage: LandingPageData, 
    sectionType: string,
    identity?: WebsiteIdentityData | null,
  ): Promise<void> {
    this.logger.debug(`Editing content for section: ${sectionType}`, {
      context: 'LandingPageGenerationService',
      usingIdentity: !!identity,
    });
    
    // Skip non-section properties
    if (['title', 'description', 'name', 'tagline', 'sectionOrder'].includes(sectionType)) {
      return;
    }
    
    // Skip if section schema doesn't exist
    const schema = this.sectionSchemas[sectionType as keyof typeof this.sectionSchemas];
    if (!schema) {
      this.logger.warn(`No schema found for section: ${sectionType}`, {
        context: 'LandingPageGenerationService',
      });
      return;
    }
    
    // Get the current section
    const sectionKey = sectionType as keyof LandingPageData;
    const section = landingPage[sectionKey];
    if (!section) {
      return;
    }
    
    const sectionContent = JSON.stringify(section, null, 2);
    
    // Base prompt using the section content review template
    let sectionPrompt = sectionContentReviewPrompt.replace(
      '{{SECTION_TYPE}}', 
      sectionType,
    ).replace(
      '{{SECTION_CONTENT}}', 
      sectionContent,
    );
    
    // Add identity information if available
    if (identity) {
      // Add brand identity guidelines to the prompt
      const brandGuidelines = this.createBrandGuidelinesFromIdentity(identity);
      sectionPrompt = sectionPrompt.replace(
        '{{ADDITIONAL_GUIDELINES}}',
        brandGuidelines,
      );
    } else {
      // No additional guidelines
      sectionPrompt = sectionPrompt.replace(
        '{{ADDITIONAL_GUIDELINES}}',
        '',
      );
    }
    
    try {
      // Process the review with the section-specific schema
      const result = await this.getBrainProtocol().processQuery(sectionPrompt, {
        userId: 'system',
        userName: 'System',
        schema,
      });
      
      // Update the section if successful
      if (result.object) {
        // Validate with the section schema
        const validatedContent = schema.parse(result.object);
        
        // Update the landing page with the validated content
        (landingPage as Partial<LandingPageData>)[sectionKey] = validatedContent;
        
        this.logger.debug(`Edited content for section: ${sectionType}`, {
          context: 'LandingPageGenerationService',
        });
      }
    } catch (error) {
      this.logger.error(`Error editing section: ${sectionType}`, {
        error: error instanceof Error ? error.message : String(error),
        context: 'LandingPageGenerationService',
      });
      // Continue with other sections even if one fails
    }
  }

  /**
   * Get the Brain Protocol instance used for AI operations
   */
  public getBrainProtocol(): BrainProtocol {
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
    this.sectionGenerationService.setBrainProtocol(protocol);
  }
  
  /**
   * Regenerate a specific section of the landing page
   * @param landingPage - The landing page data to update
   * @param sectionType - The type of section to regenerate
   * @param identity - Website identity data to use for generation
   * @returns The status of the regeneration attempt
   */
  async regenerateSection(
    landingPage: LandingPageData,
    sectionType: string,
    identity: WebsiteIdentityData,
  ): Promise<{success: boolean; message: string}> {
    try {
      this.logger.info(`Regenerating section: ${sectionType}`, {
        context: 'LandingPageGenerationService',
      });
      
      // Validate the section exists
      if (!landingPage.sectionOrder.includes(sectionType)) {
        return {
          success: false,
          message: `Section "${sectionType}" not found in landing page`,
        };
      }
      
      // Get the schema and prompt for this section
      const schema = this.sectionSchemas[sectionType as keyof typeof this.sectionSchemas];
      const promptTemplate = this.sectionPrompts[sectionType];
      
      if (!schema || !promptTemplate) {
        return {
          success: false,
          message: `Invalid section type: ${sectionType}`,
        };
      }
      
      // Mark section as in progress
      this.generationStatus[sectionType] = {
        status: SectionGenerationStatus.InProgress,
        retryCount: (this.generationStatus[sectionType]?.retryCount || 0) + 1,
      };
      
      // Generate section content
      await this.generateSectionContent(landingPage, sectionType, identity, { isRetry: true });
      
      // Mark section as enabled
      const sectionKey = sectionType as keyof LandingPageData;
      const section = landingPage[sectionKey];
      if (section && typeof section === 'object' && 'enabled' in section) {
        (section as { enabled: boolean }).enabled = true;
      }
      
      // Update status to completed
      this.generationStatus[sectionType] = {
        status: SectionGenerationStatus.Completed,
        data: landingPage[sectionKey],
      };
      
      return {
        success: true,
        message: `Successfully regenerated ${sectionType} section`,
      };
    } catch (error) {
      // Update status to failed
      this.generationStatus[sectionType] = {
        status: SectionGenerationStatus.Failed,
        error: error instanceof Error ? error.message : String(error),
      };
      
      return {
        success: false,
        message: `Failed to regenerate ${sectionType} section: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
  
  /**
   * Get the current generation status for all sections
   * @returns A record of section generation status
   */
  getGenerationStatus(): LandingPageGenerationStatus {
    return { ...this.generationStatus };
  }

  /**
   * Regenerate all sections that previously failed
   * @param landingPage - The landing page data to update 
   * @param identity - Website identity data to use for generation
   * @returns Summary of regeneration attempts with success/failure counts
   */
  async regenerateFailedSections(
    landingPage: LandingPageData,
    identity: WebsiteIdentityData,
  ): Promise<{ 
    success: boolean; 
    message: string;
    results: {
      attempted: number;
      succeeded: number;
      failed: number;
      sections: Record<string, { success: boolean; message: string }>;
    }
  }> {
    this.logger.info('Regenerating all failed sections', {
      context: 'LandingPageGenerationService',
    });
    
    // Get sections with Failed status
    const failedSections = Object.entries(this.generationStatus)
      .filter(([_, status]) => status.status === SectionGenerationStatus.Failed)
      .map(([sectionType]) => sectionType);
    
    if (failedSections.length === 0) {
      return {
        success: true,
        message: 'No failed sections found to regenerate',
        results: {
          attempted: 0,
          succeeded: 0,
          failed: 0,
          sections: {},
        },
      };
    }
    
    // Track results for each section
    const results: Record<string, { success: boolean; message: string }> = {};
    let succeeded = 0;
    let failed = 0;
    
    // Attempt to regenerate each failed section
    for (const sectionType of failedSections) {
      try {
        this.logger.info(`Attempting to regenerate section: ${sectionType}`, {
          context: 'LandingPageGenerationService',
        });
        
        // Regenerate the section
        const result = await this.regenerateSection(landingPage, sectionType, identity);
        
        // Track results
        results[sectionType] = result;
        
        if (result.success) {
          succeeded++;
        } else {
          failed++;
        }
      } catch (error) {
        this.logger.error(`Error regenerating section: ${sectionType}`, {
          error: error instanceof Error ? error.message : String(error),
          context: 'LandingPageGenerationService',
        });
        
        results[sectionType] = {
          success: false,
          message: `Error: ${error instanceof Error ? error.message : String(error)}`,
        };
        
        failed++;
      }
    }
    
    // Generate summary message
    const totalAttempted = failedSections.length;
    const message = `Attempted to regenerate ${totalAttempted} sections: ${succeeded} succeeded, ${failed} failed`;
    
    return {
      success: failed === 0,
      message,
      results: {
        attempted: totalAttempted,
        succeeded,
        failed,
        sections: results,
      },
    };
  }
}

export default LandingPageGenerationService;