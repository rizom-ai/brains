/**
 * Embedding service for generating vector representations of text
 * Uses the Vercel AI SDK for embedding generation
 *
 * Implements the EmbeddingModelAdapter interface for consistent integration
 * across the application.
 */

import { createOpenAI } from '@ai-sdk/openai';
import { cosineSimilarity, embed, embedMany } from 'ai';

import { aiConfig, textConfig } from '@/config';
import type { EmbeddingModelAdapter } from '@/resources/ai/interfaces';
import { getEnv, getEnvAsInt } from '@/utils/configUtils';
import { ApiError } from '@/utils/errorUtils';
import { Logger } from '@/utils/logger';
import { isDefined } from '@/utils/safeAccessUtils';
import { TextUtils } from '@/utils/textUtils';

/**
 * Configuration options for the embedding service
 */
export interface EmbeddingConfig {
  /** OpenAI API key */
  apiKey?: string;
  /** Model to use for embeddings (default: text-embedding-3-small) */
  embeddingModel?: string;
  /** Dimension of the embedding vectors */
  embeddingDimension?: number;
}

/**
 * Dependencies required by the EmbeddingService
 */
export interface EmbeddingDependencies {
  /** Logger instance */
  logger: Logger;
  /** TextUtils instance */
  textUtils: TextUtils;
}

/**
 * Service for generating and working with text embeddings
 * 
 * Implements the Component Interface Standardization pattern with:
 * - getInstance(): Returns the singleton instance with default configuration
 * - resetInstance(): Resets the singleton instance (mainly for testing)
 * - createFresh(): Creates a new instance with explicit dependencies and configuration
 * 
 * Implements the EmbeddingModelAdapter interface for consistent integration.
 * 
 * INTEGRATION WITH RESOURCE REGISTRY:
 * This service is registered in the ResourceRegistry and should be accessed through 
 * ResourceRegistry.getEmbeddingService() for proper dependency management in production code.
 * 
 * Access pattern in components:
 * 1. Production code:
 *    ```typescript
 *    const resourceRegistry = ResourceRegistry.getInstance();
 *    const embeddingService = resourceRegistry.getEmbeddingService();
 *    ```
 * 
 * 2. Direct singleton (less preferred):
 *    ```typescript
 *    const embeddingService = EmbeddingService.getInstance();
 *    ```
 * 
 * 3. Testing:
 *    ```typescript
 *    const embeddingService = EmbeddingService.createFresh(mockConfig, mockDependencies);
 *    ```
 */
export class EmbeddingService implements EmbeddingModelAdapter<EmbeddingConfig> {
  /** Singleton instance */
  private static instance: EmbeddingService | null = null;

  /** Logger instance */
  private readonly logger: Logger;
  
  /** Text utilities instance */
  private readonly textUtils: TextUtils;
  
  /** Configuration values */
  private readonly apiKey: string;
  private readonly embeddingModel: string;
  private readonly embeddingDimension: number;
  
  /** OpenAI provider instance */
  private readonly openAIProvider: ReturnType<typeof createOpenAI>;

  /**
   * Get the singleton instance of EmbeddingService
   * 
   * This method retrieves or creates the shared singleton instance using default
   * configuration values from the application config. 
   * 
   * IMPORTANT: In production code, prefer using ResourceRegistry:
   * ```typescript
   * const embeddingService = ResourceRegistry.getInstance().getEmbeddingService();
   * ```
   * 
   * Direct singleton access should be avoided in unit tests to prevent cross-test 
   * contamination. Instead, use createFresh() with mock dependencies.
   * 
   * @returns The shared EmbeddingService instance
   */
  public static getInstance(): EmbeddingService {
    if (!EmbeddingService.instance) {
      const logger = Logger.getInstance();
      logger.debug('Creating EmbeddingService singleton instance');
      
      // Get default configuration from environment/config
      const config: EmbeddingConfig = {
        apiKey: aiConfig.openAI.apiKey,
        embeddingModel: aiConfig.openAI.embeddingModel,
        embeddingDimension: aiConfig.openAI.embeddingDimension,
      };
      
      // Get default dependencies
      const dependencies: EmbeddingDependencies = {
        logger,
        textUtils: TextUtils.getInstance(),
      };
      
      // Create the instance with default configuration and dependencies
      EmbeddingService.instance = new EmbeddingService(config, dependencies);
    }
    
    return EmbeddingService.instance;
  }

  /**
   * Reset the singleton instance
   * 
   * This method clears the static instance reference and performs any necessary
   * cleanup. It is primarily used in testing to ensure a clean state between tests.
   */
  public static resetInstance(): void {
    try {
      // Clean up resources if needed
      if (EmbeddingService.instance) {
        // No specific cleanup needed for this service
      }
    } catch (error) {
      const logger = Logger.getInstance();
      logger.error('Error during EmbeddingService instance reset:', error);
    } finally {
      EmbeddingService.instance = null;
      Logger.getInstance().debug('EmbeddingService singleton instance reset');
    }
  }

  /**
   * Create a fresh service instance for testing
   * 
   * This method creates a new instance with explicit configuration and dependencies,
   * without affecting the singleton instance. It is primarily used in tests to create
   * isolated instances with controlled dependencies and configuration.
   * 
   * USAGE:
   * This method should be used ONLY in tests. In production code, access the service
   * through ResourceRegistry.getInstance().getEmbeddingService() to ensure proper
   * integration with the application's dependency management.
   * 
   * Example test usage:
   * ```typescript
   * const mockLogger = MockLogger.createFresh();
   * const mockTextUtils = MockTextUtils.createFresh();
   * 
   * const embeddingService = EmbeddingService.createFresh(
   *   { apiKey: 'test-key', embeddingModel: 'test-model' },
   *   { logger: mockLogger, textUtils: mockTextUtils }
   * );
   * ```
   * 
   * @param config Required configuration for the test instance
   * @param dependencies Required dependencies for the test instance
   * @returns A new isolated EmbeddingService instance
   */
  public static createFresh(
    config: EmbeddingConfig,
    dependencies: EmbeddingDependencies,
  ): EmbeddingService {
    dependencies.logger.debug('Creating fresh EmbeddingService instance');
    return new EmbeddingService(config, dependencies);
  }

  /**
   * Private constructor to enforce factory methods
   * 
   * The constructor is private to ensure that instances are only created through
   * the static factory methods (getInstance, createFresh), which provide proper
   * initialization and configuration.
   * 
   * @param config Configuration options
   * @param dependencies Required dependencies
   */
  private constructor(
    config: EmbeddingConfig,
    dependencies: EmbeddingDependencies,
  ) {
    // Store dependencies
    this.logger = dependencies.logger;
    this.textUtils = dependencies.textUtils;
    
    // Apply configuration with fallbacks to environment variables
    this.apiKey = config.apiKey || getEnv('OPENAI_API_KEY', '');
    this.embeddingModel = config.embeddingModel || 
                         getEnv('OPENAI_EMBEDDING_MODEL', 'text-embedding-3-small');
    this.embeddingDimension = config.embeddingDimension || 
                            getEnvAsInt('OPENAI_EMBEDDING_DIMENSION', 1536);
    
    // Verify API key is available
    if (!this.apiKey) {
      this.logger.warn('No OpenAI API key provided for embedding service');
    }
    
    // Initialize OpenAI provider with API key
    this.openAIProvider = createOpenAI({
      apiKey: this.apiKey,
    });
    
    this.logger.debug(`EmbeddingService instance created with model: ${this.embeddingModel}`);
  }

  /**
   * Generate an embedding for a single text
   * Implements EmbeddingModelAdapter.getEmbedding
   * 
   * @param text The text to embed
   * @returns A promise resolving to the embedding vector
   */
  async getEmbedding(text: string): Promise<number[]> {
    // Handle invalid input
    if (!isDefined(text)) {
      this.logger.warn('Received undefined or null text in getEmbedding');
      return Array(this.embeddingDimension).fill(0);
    }

    try {
      // Prepare the text for embedding
      const preparedText = this.textUtils.prepareText(text);
      this.logger.debug('Generating embedding via AI SDK');

      // Use the Vercel AI SDK to generate the embedding
      const response = await embed({
        model: this.openAIProvider.embedding(this.embeddingModel),
        value: preparedText,
        maxRetries: 3,
      });

      this.logger.debug(`Generated embedding with model: ${this.embeddingModel}`);

      return response.embedding;
    } catch (error) {
      // Log detailed error information
      const errorMessage = error instanceof Error
        ? error.message
        : String(error);

      this.logger.error(`Error generating embedding: ${errorMessage}`);

      // Provide additional context if it's an API error
      if (error instanceof ApiError) {
        this.logger.debug(`API Error details: ${error.toLogString()}`);
      }

      // Create zero embedding as a last resort
      return Array(this.embeddingDimension).fill(0);
    }
  }


  /**
   * Generate embeddings for multiple texts in batch
   * Implements EmbeddingModelAdapter.getBatchEmbeddings
   * 
   * @param texts An array of texts to generate embeddings for
   * @returns A promise resolving to an array of embedding vectors
   */
  async getBatchEmbeddings(texts: string[]): Promise<number[][]> {
    // Handle invalid or empty input cases
    if (!isDefined(texts)) {
      this.logger.warn('Received undefined or null texts array in getBatchEmbeddings');
      return [];
    }

    if (texts.length === 0) {
      this.logger.debug('Received empty texts array in getBatchEmbeddings');
      return [];
    }

    this.logger.info(`Generating embeddings for ${texts.length} texts using AI SDK`);

    try {
      // Prepare the texts and filter out any null/undefined/empty values
      const preparedTexts = texts
        .filter(isDefined)
        .map(text => this.textUtils.prepareText(text));

      // If all texts were invalid and we have no prepared texts, return empty result
      if (preparedTexts.length === 0) {
        this.logger.warn('No valid texts remained after filtering in getBatchEmbeddings');
        return [];
      }

      // Use the Vercel AI SDK to generate batch embeddings
      const response = await embedMany({
        model: this.openAIProvider.embedding(this.embeddingModel),
        values: preparedTexts,
        maxRetries: 3,
      });

      this.logger.debug(`Generated ${response.embeddings.length} embeddings in batch`);

      return response.embeddings;
    } catch (error) {
      // If batch processing fails, try individual processing
      this.logger.error(`Error using batch embedding API, falling back to individual processing: ${error instanceof Error ? error.message : String(error)}`);

      try {
        // Process each text individually as a fallback
        const embeddings = await Promise.all(
          texts.map(text => this.getEmbedding(text)),
        );
        return embeddings;
      } catch (processingError) {
        this.logger.error(`Individual processing also failed: ${processingError instanceof Error ? processingError.message : String(processingError)}`);

        // Return empty embeddings as a last resort
        return texts.map(() => Array(this.embeddingDimension).fill(0));
      }
    }
  }


  /**
   * Calculate similarity between two embedding vectors
   * Implements EmbeddingModelAdapter.calculateSimilarity
   * 
   * @param vec1 First vector
   * @param vec2 Second vector
   * @returns Similarity score (-1 to 1)
   */
  calculateSimilarity(vec1: number[], vec2: number[]): number {
    // Handle null/undefined vectors
    if (!isDefined(vec1) || !isDefined(vec2)) {
      this.logger.warn('Received undefined or null vector in calculateSimilarity');
      return 0;
    }

    try {
      return cosineSimilarity(vec1, vec2);
    } catch (error) {
      // Handle errors gracefully (e.g., different vector dimensions)
      this.logger.error(`Error calculating cosine similarity: ${error instanceof Error ? error.message : String(error)}`);
      return 0;
    }
  }


  /**
   * Chunk a long text into smaller pieces for embedding
   * @param text The text to chunk
   * @param chunkSize The approximate size of each chunk
   * @param overlap The number of characters to overlap between chunks
   * @returns An array of text chunks
   */
  chunkText(
    text: string,
    chunkSize = textConfig.defaultChunkSize,
    overlap = textConfig.defaultChunkOverlap,
  ): string[] {
    return this.textUtils.chunkText(text, chunkSize, overlap);
  }

  /**
   * Get embeddings for text chunks
   * @param textChunks Array of text chunks to embed
   * @returns Promise resolving to array of embedding vectors
   */
  async getChunkedEmbeddings(textChunks: string[]): Promise<number[][]> {
    return this.getBatchEmbeddings(textChunks);
  }
}