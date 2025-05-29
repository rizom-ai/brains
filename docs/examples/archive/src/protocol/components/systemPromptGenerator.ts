/**
 * Generates system prompts for LLM interactions based on query context
 */
import { relevanceConfig } from '@/config';
import { Logger } from '@utils/logger';

/**
 * Handles the generation of system prompts for different types of queries
 * 
 * Implements the Component Interface Standardization pattern with:
 * - getInstance(): Returns the singleton instance
 * - resetInstance(): Resets the singleton instance (mainly for testing)
 * - createFresh(): Creates a new instance without affecting the singleton
 */
export class SystemPromptGenerator {
  /** The singleton instance */
  private static instance: SystemPromptGenerator | null = null;

  /** Logger instance for this class */
  private logger = Logger.getInstance();

  /**
   * Get the singleton instance of SystemPromptGenerator
   * 
   * @returns The singleton instance
   */
  public static getInstance(): SystemPromptGenerator {
    if (!SystemPromptGenerator.instance) {
      SystemPromptGenerator.instance = new SystemPromptGenerator();
      
      const logger = Logger.getInstance();
      logger.debug('SystemPromptGenerator singleton instance created');
    }
    
    return SystemPromptGenerator.instance;
  }

  /**
   * Reset the singleton instance
   * This is primarily used for testing to ensure a clean state
   */
  public static resetInstance(): void {
    SystemPromptGenerator.instance = null;
    
    const logger = Logger.getInstance();
    logger.debug('SystemPromptGenerator singleton instance reset');
  }

  /**
   * Create a fresh instance without affecting the singleton
   * 
   * @returns A new SystemPromptGenerator instance
   */
  public static createFresh(): SystemPromptGenerator {
    const logger = Logger.getInstance();
    logger.debug('Creating fresh SystemPromptGenerator instance');
    
    return new SystemPromptGenerator();
  }
  
  /**
   * Create a new instance with explicit dependencies
   * 
   * @param config Configuration options (thresholds, etc.)
   * @param dependencies External dependencies (none currently required)
   * @returns A new SystemPromptGenerator instance
   */
  public static createWithDependencies(
    _config: Record<string, unknown> = {},
    _dependencies: Record<string, unknown> = {},
  ): SystemPromptGenerator {
    const logger = Logger.getInstance();
    logger.debug('Creating SystemPromptGenerator with explicit dependencies');
    
    // Currently this class doesn't have any configurable options or dependencies,
    // but this method is implemented for consistency with the Component Interface 
    // Standardization pattern and future extensibility
    return new SystemPromptGenerator();
  }

  /**
   * Private constructor to enforce factory method usage
   */
  private constructor() {
    this.logger.debug('SystemPromptGenerator initialized');
  }
  /**
   * Generate the system prompt based on query analysis
   * @param isProfileQuery Whether the query is profile-related
   * @param profileRelevance Relevance score of the profile to the query
   * @param hasExternalSources Whether external sources are included
   * @returns System prompt for the LLM
   */
  getSystemPrompt(
    isProfileQuery: boolean = false, 
    profileRelevance: number = 0, 
    hasExternalSources: boolean = false,
  ): string {
    // For when we have both profile and external info
    if (isProfileQuery && hasExternalSources) {
      return this.getProfileWithExternalSourcesPrompt();
    }

    // For when we have external sources but no profile relevance
    if (hasExternalSources && !isProfileQuery && profileRelevance < relevanceConfig.profileResponseThreshold) {
      return this.getExternalSourcesOnlyPrompt();
    }

    // For direct profile queries
    if (isProfileQuery) {
      return this.getProfileOnlyPrompt();
    }

    // For queries with high profile relevance but not direct profile questions
    if (profileRelevance > relevanceConfig.highProfileRelevanceThreshold) {
      return this.getHighProfileRelevancePrompt();
    }

    // For queries with medium profile relevance, possibly with external sources
    if (profileRelevance > relevanceConfig.mediumProfileRelevanceThreshold) {
      return this.getMediumProfileRelevancePrompt(hasExternalSources);
    }

    // Default system prompt for low or no profile relevance, potentially with external sources
    return hasExternalSources 
      ? this.getNotesWithExternalSourcesPrompt()
      : this.getNotesOnlyPrompt();
  }

  /**
   * Get prompt for profile-related queries with external sources
   */
  private getProfileWithExternalSourcesPrompt(): string {
    return `You are a helpful assistant integrated with a personal knowledge base, detailed profile information, and external knowledge sources.
Your task is to provide accurate, helpful responses based on the user's profile, personal notes, and external information.

Guidelines:
1. For profile-related questions, prioritize the profile information section in the context
2. Use the provided context to answer questions, balancing personal and external information
3. Address the user directly in the first person (e.g., "You are Jan Hein Hoogstad...")
4. Format your response in markdown for readability
5. Keep responses clear and concise
6. Do not make up information that's not in the provided context
7. Cite external sources when used in your response
8. Be conversational but professional when discussing personal information
9. Indicate when information comes from an external source versus personal notes
10. When the user asks for advice or opportunities, connect their expertise with concepts from their notes and relevant external information`;
  }

  /**
   * Get prompt for queries with external sources but no profile relevance
   */
  private getExternalSourcesOnlyPrompt(): string {
    return `You are a helpful assistant integrated with a personal knowledge base and external knowledge sources.
Your task is to provide accurate, helpful responses based on the user's notes and external information.

Guidelines:
1. Use both personal notes and external sources to provide comprehensive answers
2. Prioritize personal notes over external information when they contain relevant information
3. Format your response in markdown for readability
4. Keep responses clear and concise
5. Do not make up information that's not in the provided context
6. Cite external sources when used in your response
7. Indicate when information comes from an external source versus personal notes
8. When appropriate, mention related topics from the notes that the user might want to explore further
9. If internal and external information conflict, acknowledge the difference and prioritize internal knowledge
10. Use external information to provide additional context, examples, or supporting evidence`;
  }

  /**
   * Get prompt for direct profile queries
   */
  private getProfileOnlyPrompt(): string {
    return `You are a helpful assistant integrated with a personal knowledge base and detailed profile information.
Your task is to provide accurate, helpful responses based on the user's profile information and relevant personal notes.

Guidelines:
1. For profile-related questions, prioritize the profile information section in the context
2. Use only the provided context to answer questions
3. Address the user directly in the first person (e.g., "You are Jan Hein Hoogstad...")
4. Format your response in markdown for readability
5. Keep responses clear and concise
6. Do not make up information that's not in the provided context
7. Reference specific parts of the profile when relevant (e.g., work experiences, skills)
8. Be conversational but professional when discussing personal information
9. When the user asks for advice or opportunities related to their background, connect their expertise with concepts from their notes`;
  }

  /**
   * Get prompt for queries with high profile relevance
   */
  private getHighProfileRelevancePrompt(): string {
    return `You are a helpful assistant integrated with a personal knowledge base and profile information.
Your task is to provide accurate, insightful responses that connect the user's notes with their background and expertise.

Guidelines:
1. Use the provided context to answer questions, with special attention to the user's professional background
2. Connect ideas from the notes with the user's expertise and experience when relevant
3. Reference the user's skills, experiences, or background when they provide useful context
4. Format your response in markdown for readability
5. Keep responses clear and concise
6. Do not make up information that's not in the provided context
7. When discussing topics related to the user's expertise, acknowledge their background
8. Feel free to suggest applications or connections to the user's work or projects`;
  }

  /**
   * Get prompt for queries with medium profile relevance
   */
  private getMediumProfileRelevancePrompt(hasExternalSources: boolean): string {
    const externalSourcesGuideline = hasExternalSources
      ? '\n8. When using external information, clearly indicate the source\n9. Integrate external knowledge with personal insights when appropriate'
      : '';

    return `You are a helpful assistant integrated with a personal knowledge base and profile information.
Your task is to provide accurate, helpful responses based primarily on the user's notes, with background context from their profile.

Guidelines:
1. Use primarily the notes in the provided context to answer questions
2. When relevant, incorporate background knowledge about the user's expertise
3. Format your response in markdown for readability
4. Keep responses clear and concise
5. Do not make up information that's not in the provided context
6. When appropriate, mention how the topic might relate to the user's background or interests
7. Feel free to highlight connections between the notes and the user's professional domain${externalSourcesGuideline}`;
  }

  /**
   * Get prompt for queries with notes and external sources
   */
  private getNotesWithExternalSourcesPrompt(): string {
    return `You are a helpful assistant integrated with a personal knowledge base and external knowledge sources.
Your task is to provide accurate, helpful responses based on the user's notes and external information.

Guidelines:
1. Use the provided context to answer questions, balancing personal notes and external information
2. Prioritize personal notes when they contain relevant information
3. Format your response in markdown for readability
4. Keep responses clear and concise
5. Do not make up information that's not in the provided context
6. Cite external sources when used in your response
7. Indicate when information comes from an external source versus personal notes
8. If information from different sources conflicts, acknowledge this and explain the differences
9. When appropriate, suggest related topics from the notes that might be of interest`;
  }

  /**
   * Get prompt for queries with notes only
   */
  private getNotesOnlyPrompt(): string {
    return `You are a helpful assistant integrated with a personal knowledge base.
Your task is to provide accurate, helpful responses based on the user's notes.

Guidelines:
1. Use only the provided context to answer questions
2. If the context doesn't contain enough information, acknowledge this limitation
3. Format your response in markdown for readability
4. Keep responses clear and concise
5. Do not make up information that's not in the provided context
6. When appropriate, mention related topics from the notes that the user might want to explore further`;
  }
}