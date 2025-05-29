import { z } from 'zod';

import { aiConfig, textConfig } from '@/config';
import type { ClaudeModel } from '@/resources/ai/claude'; 
import { ServiceRegistry } from '@/services/serviceRegistry';
import { Logger } from '@/utils/logger';

/**
 * Configuration options for TagExtractor
 */
export interface TagExtractorConfig {
  /** Maximum number of tags to extract by default */
  defaultMaxTags?: number;
  /** Maximum length of content to analyze */
  tagContentMaxLength?: number;
  /** Model temperature for tag extraction */
  temperature?: number;
}

/**
 * Dependencies interface for TagExtractor
 */
export interface TagExtractorDependencies {
  /** Logger for tag extraction operations */
  logger: Logger;
  /** Claude model for AI-powered tag extraction */
  claudeModel: ClaudeModel;
}

/**
 * TagExtractor class - handles tag extraction from content
 * 
 * Implements the Component Interface Standardization pattern with:
 * - getInstance(): Returns the singleton instance
 * - resetInstance(): Resets the singleton instance (mainly for testing)
 * - createFresh(): Creates a new instance without affecting the singleton
 */
export class TagExtractor {
  /**
   * Singleton instance of TagExtractor
   */
  private static instance: TagExtractor | null = null;

  /**
   * Logger instance
   */
  private logger: Logger;

  /**
   * Claude model for tag extraction
   */
  private claudeModel: ClaudeModel;

  /**
   * Configuration options
   */
  private config: TagExtractorConfig;

  /**
   * Get the singleton instance
   * 
   * @param config Optional configuration options (used when creating a new instance)
   * @returns Singleton instance of TagExtractor
   */
  public static getInstance(config?: TagExtractorConfig): TagExtractor {
    if (!TagExtractor.instance) {
      const logger = Logger.getInstance();
      // Get resources through ServiceRegistry
      const serviceRegistry = ServiceRegistry.getInstance();
      const claudeModel = serviceRegistry.getResourceRegistry().getClaudeModel();
      
      TagExtractor.instance = new TagExtractor({
        logger,
        claudeModel,
      }, config);

      logger.debug('TagExtractor singleton instance created');
    }
    return TagExtractor.instance;
  }

  /**
   * Reset the singleton instance (primarily for testing)
   */
  public static resetInstance(): void {
    try {
      // Clean up resources if needed
      if (TagExtractor.instance) {
        // No specific cleanup needed for this service
      }
    } catch (error) {
      const logger = Logger.getInstance();
      logger.error('Error during TagExtractor instance reset:', error);
    } finally {
      TagExtractor.instance = null;
      Logger.getInstance().debug('TagExtractor singleton instance reset');
    }
  }

  /**
   * Create a fresh instance without affecting the singleton
   * 
   * @param config Optional configuration options
   * @param dependencies Optional dependencies object
   * @returns A new TagExtractor instance
   */
  public static createFresh(
    config?: TagExtractorConfig,
    dependencies?: TagExtractorDependencies,
  ): TagExtractor {
    const logger = Logger.getInstance();
    logger.debug('Creating fresh TagExtractor instance');

    if (dependencies) {
      // Use provided dependencies
      return new TagExtractor(dependencies, config);
    } else {
      // Use default dependencies from the ServiceRegistry
      const serviceRegistry = ServiceRegistry.getInstance();
      const claudeModel = serviceRegistry.getResourceRegistry().getClaudeModel();
      
      return new TagExtractor({
        logger,
        claudeModel,
      }, config);
    }
  }

  /**
   * Private constructor to enforce using factory methods
   * @param dependencies Required dependencies
   * @param config Optional configuration options
   */
  private constructor(
    dependencies: TagExtractorDependencies,
    config?: TagExtractorConfig,
  ) {
    // Initialize from dependencies
    this.logger = dependencies.logger;
    this.claudeModel = dependencies.claudeModel;
    
    // Apply configuration with defaults
    this.config = {
      defaultMaxTags: config?.defaultMaxTags ?? textConfig.defaultMaxTags,
      tagContentMaxLength: config?.tagContentMaxLength ?? textConfig.tagContentMaxLength,
      temperature: config?.temperature ?? aiConfig.anthropic.temperature,
    };

    this.logger.debug('TagExtractor instance created');
  }

  /**
   * Extract tags from content using Claude AI
   * @param content The text content to analyze
   * @param existingTags Optional array of existing tags to consider
   * @param maxTags Maximum number of tags to extract (defaults to config value)
   * @returns Array of extracted tags
   */
  public async extractTags(
    content: string,
    existingTags: string[] = [],
    maxTags?: number,
  ): Promise<string[]> {
    try {
      // Use provided max tags or fall back to config
      const tagsLimit = maxTags ?? this.config.defaultMaxTags;
      
      // API key is no longer needed as the Claude model already has it
      
      // Truncate content if it's too long
      const maxContentLength = this.config.tagContentMaxLength ?? textConfig.tagContentMaxLength;
      const truncatedContent = content.length > maxContentLength
        ? content.substring(0, maxContentLength) + '... [content truncated]'
        : content;

      // Build the prompt
      const prompt = `You are a precise tag extraction system. Your task is to extract the most relevant tags from the provided content.

The tags should capture the main concepts, topics, and themes in the content. The tags should be:
- Relevant to the domain and content
- Single words or short phrases (1-3 words)
- Lowercase, with hyphens for multi-word tags (e.g., "ecosystem-architecture")
- Domain-specific rather than generic
- Nouns or noun phrases preferred

Content to extract tags from:
${truncatedContent}

${existingTags.length > 0 ? 'Existing tags to consider: ' + existingTags.join(', ') : ''}

Extract up to ${tagsLimit} tags that best represent this content.

FORMAT: Respond with ONLY a comma-separated list of tags, with no additional text or explanation.`;

      // Define the schema for the response
      const maxTagCount = tagsLimit || 5; // Provide a default value in case tagsLimit is undefined
      const tagSchema = z.object({
        tags: z.array(z.string()).max(maxTagCount),
      });

      // Call Claude with schema, using the injected Claude model
      const response = await this.claudeModel.complete<z.infer<typeof tagSchema>>({
        schema: tagSchema,
        systemPrompt: 'You extract tags from content. Only respond with the tags, nothing else.',
        userPrompt: prompt,
        temperature: this.config.temperature,
      });

      // Return the tags array directly
      return response.object.tags;
    } catch (error) {
      this.logger.error(`Error extracting tags with Claude: ${error}`);
      return [];
    }
  }

}
