/**
 * Analyzes the relevance of a profile to a user query
 */
import { relevanceConfig } from '@/config';
import type { EmbeddingService } from '@/resources/ai/embedding';
import { Logger } from '@utils/logger';

/**
 * Configuration options for ProfileAnalyzer
 */
export interface ProfileAnalyzerConfig {
  /** Embedding service for semantic similarity */
  embeddingService: EmbeddingService;
}

/**
 * Handles profile-related query analysis
 * 
 * Implements the Component Interface Standardization pattern with:
 * - getInstance(): Returns the singleton instance
 * - resetInstance(): Resets the singleton instance (mainly for testing)
 * - createFresh(): Creates a new instance without affecting the singleton
 */
export class ProfileAnalyzer {
  /** The singleton instance */
  private static instance: ProfileAnalyzer | null = null;

  /** Logger instance for this class */
  private logger = Logger.getInstance();
  
  private embeddingService: EmbeddingService;

  /**
   * Get the singleton instance of ProfileAnalyzer
   * 
   * @param config Configuration options
   * @returns The singleton instance
   */
  public static getInstance(config: ProfileAnalyzerConfig): ProfileAnalyzer {
    if (!ProfileAnalyzer.instance) {
      ProfileAnalyzer.instance = new ProfileAnalyzer(config.embeddingService);
      
      const logger = Logger.getInstance();
      logger.debug('ProfileAnalyzer singleton instance created');
    }
    
    return ProfileAnalyzer.instance;
  }

  /**
   * Reset the singleton instance
   * This is primarily used for testing to ensure a clean state
   */
  public static resetInstance(): void {
    ProfileAnalyzer.instance = null;
    
    const logger = Logger.getInstance();
    logger.debug('ProfileAnalyzer singleton instance reset');
  }

  /**
   * Create a fresh instance without affecting the singleton
   * 
   * @param config Configuration options
   * @returns A new ProfileAnalyzer instance
   */
  public static createFresh(config: ProfileAnalyzerConfig): ProfileAnalyzer {
    const logger = Logger.getInstance();
    logger.debug('Creating fresh ProfileAnalyzer instance');
    
    return new ProfileAnalyzer(config.embeddingService);
  }

  /**
   * Private constructor to enforce factory method usage
   * 
   * @param embeddingService The embedding service to use for semantic similarity
   */
  private constructor(embeddingService: EmbeddingService) {
    this.embeddingService = embeddingService;
    this.logger.debug('ProfileAnalyzer initialized');
  }

  /**
   * Determine if the query is explicitly profile-related based on keywords
   * @param query The user's query
   * @returns Whether the query is directly about the profile
   */
  isProfileQuery(query: string): boolean {
    const profileKeywords = [
      'profile', 'about me', 'who am i', 'my background', 'my experience',
      'my education', 'my skills', 'my work', 'my job', 'my history',
      'my information', 'tell me about myself', 'my professional', 'resume',
      'cv', 'curriculum vitae', 'career', 'expertise', 'professional identity',
    ];

    const lowercaseQuery = query.toLowerCase();

    // Check if the query contains explicit profile-related keywords
    return profileKeywords.some(keyword => lowercaseQuery.includes(keyword));
  }

  /**
   * Get profile similarity score to the query using semantic search
   * @param query The user's query
   * @param profileEmbedding Profile embedding from the note
   * @returns Semantic relevance score (0-1)
   */
  async getProfileRelevance(
    query: string, 
    profileEmbedding: number[],
  ): Promise<number> {
    try {
      // Get embedding for the query
      const queryEmbedding = await this.embeddingService.getEmbedding(query);

      // Calculate similarity score between query and profile
      const similarity = this.embeddingService.calculateSimilarity(
        queryEmbedding,
        profileEmbedding,
      );

      // Scale the similarity to be more decisive
      // (values closer to 0 or 1 rather than middle range)
      return Math.pow(similarity * relevanceConfig.fallback.similarityScaleFactor + 0.5, 2);
    } catch (error) {
      this.logger.error('Error calculating profile relevance:', { error, context: 'ProfileAnalyzer' });
      // Fall back to keyword matching
      return this.isProfileQuery(query) ? 
        relevanceConfig.fallback.highRelevance : 
        relevanceConfig.fallback.lowRelevance;
    }
  }
}