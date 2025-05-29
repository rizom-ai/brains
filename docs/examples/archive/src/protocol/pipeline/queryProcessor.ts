/**
 * Query Processor for BrainProtocol
 * 
 * Manages the pipeline for processing a natural language query, including:
 * - Analyzing profile relevance
 * - Retrieving relevant notes
 * - Getting conversation history
 * - Fetching external sources
 * - Formatting prompts
 * - Calling the model
 * - Saving conversation turns
 * 
 * Implements the Component Interface Standardization pattern with:
 * - getInstance(): Returns the singleton instance
 * - resetInstance(): Resets the singleton instance (mainly for testing)
 * - createFresh(): Creates a new instance without affecting the singleton
 */

import type { z } from 'zod';

import { relevanceConfig } from '@/config';
import type { ExternalSourceResult } from '@/contexts/externalSources/sources';
import type { Note } from '@/models/note';
import { PromptFormatter } from '@/protocol/components/promptFormatter';
import { SystemPromptGenerator } from '@/protocol/components/systemPromptGenerator';
import { ResourceRegistry } from '@/resources/resourceRegistry';
import { Logger } from '@/utils/logger';
import { isDefined, isNonEmptyString } from '@/utils/safeAccessUtils';

import type {
  ContextResult,
  IContextManager,
  IConversationManager,
  IQueryProcessor,
  ProfileAnalysisResult,
  QueryOptions,
  QueryResult,
  TurnOptions,
} from '../types';
import type {
  ExternalCitation,
} from '../types/index';

/**
 * Configuration object for QueryProcessor
 */
export interface QueryProcessorConfig {
  /** Context manager for accessing all contexts */
  contextManager: IContextManager;
  /** Conversation manager for conversation state */
  conversationManager: IConversationManager;
  /** API key for the model */
  apiKey?: string;
}

/**
 * QueryProcessor implementation
 * 
 * Manages the full query processing pipeline:
 * 1. Analyze profile relevance
 * 2. Retrieve relevant notes
 * 3. Get conversation history
 * 4. Fetch external sources
 * 5. Format prompt
 * 6. Call model
 * 7. Save turn
 * 8. Return result
 */
export class QueryProcessor implements IQueryProcessor {
  private static instance: QueryProcessor | null = null;

  // Dependencies
  private readonly contextManager: IContextManager;
  private readonly conversationManager: IConversationManager;
  private readonly promptFormatter: PromptFormatter;
  private readonly systemPromptGenerator: SystemPromptGenerator;
  private readonly resourceRegistry: ResourceRegistry;

  // Utility
  private readonly logger = Logger.getInstance();

  /**
   * Get the singleton instance of QueryProcessor
   * 
   * @param options Configuration options
   * @returns The singleton instance
   */
  public static getInstance(options: QueryProcessorConfig): QueryProcessor {
    if (!QueryProcessor.instance) {
      QueryProcessor.instance = new QueryProcessor(
        options.contextManager,
        options.conversationManager,
        options.apiKey,
      );
      
      const logger = Logger.getInstance();
      logger.debug('QueryProcessor singleton instance created');
    } else if (options) {
      // Log a warning if trying to get instance with different config
      const logger = Logger.getInstance();
      logger.warn('getInstance called with config but instance already exists. Config ignored.');
    }
    
    return QueryProcessor.instance;
  }

  /**
   * Reset the singleton instance
   * This is primarily used for testing
   */
  public static resetInstance(): void {
    QueryProcessor.instance = null;
    const logger = Logger.getInstance();
    logger.debug('QueryProcessor singleton instance reset');
  }

  /**
   * Create a fresh instance that is not the singleton
   * This method is primarily used for testing
   * 
   * @param config Configuration options
   * @returns A new QueryProcessor instance
   */
  public static createFresh(config: QueryProcessorConfig): QueryProcessor {
    const logger = Logger.getInstance();
    logger.debug('Creating fresh QueryProcessor instance');

    return new QueryProcessor(
      config.contextManager,
      config.conversationManager,
      config.apiKey,
    );
  }


  /**
   * Private constructor to enforce factory method usage
   * 
   * @param contextManager Context manager
   * @param conversationManager Conversation manager
   * @param apiKey API key for model
   */
  private constructor(
    contextManager: IContextManager,
    conversationManager: IConversationManager,
    _apiKey?: string,
  ) {
    this.contextManager = contextManager;
    this.conversationManager = conversationManager;

    // Initialize helpers using their getInstance methods
    this.promptFormatter = PromptFormatter.getInstance();
    this.systemPromptGenerator = SystemPromptGenerator.getInstance();
    this.resourceRegistry = ResourceRegistry.getInstance();

    this.logger.debug('Query processor initialized');
  }

  /**
   * Process a query through the full pipeline
   * @param query User query
   * @param options Query options with optional schema for structured responses
   * @returns Query result with optional structured object
   */
  async processQuery<T = unknown>(query: string, options?: QueryOptions<T>): Promise<QueryResult<T>> {
    // Validate input
    if (!isNonEmptyString(query)) {
      this.logger.warn('Empty query received, using default question');
      query = 'What information do you have in this brain?';
    }

    this.logger.debug(`Processing query: "${query}"`);

    // If roomId is provided, ensure we're using the right conversation
    if (options?.roomId) {
      await this.conversationManager.setCurrentRoom(options.roomId);
    }

    // Ensure we have an active conversation
    if (!this.conversationManager.hasActiveConversation()) {
      await this.conversationManager.initializeConversation();
    }

    // 1. Analyze profile relevance
    const profileAnalysis = await this.analyzeProfile(query);

    // 2. Retrieve relevant context
    const context = await this.retrieveRelevantNotes(query);

    // 3. Get conversation history
    const history = await this.getConversationHistory();

    // 4. Fetch external sources if enabled
    const externalResults = await this.fetchExternalSources(query, context.relevantNotes);

    // Convert external results to citations format if available
    const externalCitations = this.formatExternalCitations(externalResults);

    // 5. Generate prompt
    const { systemPrompt, userPrompt } = await this.formatPrompt(
      query,
      context,
      history,
      profileAnalysis,
      externalResults,
    );

    // 6. Call the model with optional schema for structured responses
    const modelResponse = await this.callModel<T>(
      systemPrompt,
      userPrompt,
      options?.schema, // Pass the schema if provided
    );

    // Extract the answer from the response
    const answer = modelResponse.object && typeof modelResponse.object === 'object' && 'answer' in modelResponse.object
      ? String(modelResponse.object.answer)
      : 'I apologize, but I wasn\'t able to generate a proper response.';

    // 7. Save the conversation turn
    await this.saveTurn(query, answer, options);

    // 8. Get related notes for the response
    const noteContext = this.contextManager.getNoteContext();
    // If we have relevant notes, get related notes for the first one
    const relatedNotes = context.relevantNotes.length > 0
      ? await noteContext.getRelatedNotes(context.relevantNotes[0].id)
      : [];

    // Note: Profile data is handled during prompt formatting
    // We no longer need to include it in the response since it's used
    // for answering profile-related queries through the model

    // 11. Return the result with the optional structured object
    return {
      answer,
      citations: context.citations,
      relatedNotes,
      externalSources: externalCitations.length > 0 ? externalCitations : undefined,
      object: modelResponse.object, // Include the structured object in the result
    };
  }

  /**
   * Analyze profile relevance for a query
   * @param query User query
   * @returns Profile analysis result
   */
  private async analyzeProfile(query: string): Promise<ProfileAnalysisResult> {
    // Use ProfileAnalyzer directly through the ResourceRegistry for now
    // This is a temporary solution until we move profile analysis to ProfileContext
    // We don't actually need to get the profile here, just detect if it's a profile query

    // Basic profile query detection pattern
    const isProfileQuery = /profile|about\s+me|who\s+am\s+i|my\s+background/i.test(query);
    const relevance = isProfileQuery ? 0.9 : 0.1;

    return { isProfileQuery, relevance };
  }

  /**
   * Retrieve relevant notes for a query
   * @param query User query
   * @returns Context result with relevant notes and citations
   */
  private async retrieveRelevantNotes(query: string): Promise<ContextResult> {
    const noteContext = this.contextManager.getNoteContext();
    const relevantNotes = await noteContext.searchNotes({ query, limit: 5 });
    const notesFound = Array.isArray(relevantNotes) ? relevantNotes.length : 0;

    this.logger.info(`Found ${notesFound} relevant notes`);

    // Safely log the top note if available
    if (notesFound > 0 && isDefined(relevantNotes[0])) {
      const topNoteTitle = relevantNotes[0].title || 'Untitled Note';
      this.logger.debug(`Top note: "${topNoteTitle}"`);
    }

    // Extract citations from notes
    const citations = relevantNotes.map(note => ({
      noteId: note.id,
      noteTitle: note.title || 'Untitled Note',
      excerpt: this.truncateContent(note.content, 150),
    }));

    return {
      relevantNotes,
      citations,
    };
  }

  /**
   * Get conversation history
   * @returns Formatted conversation history
   */
  private async getConversationHistory(): Promise<string> {
    try {
      const conversationId = this.conversationManager.getCurrentConversationId();
      if (!conversationId) {
        return '';
      }

      return await this.conversationManager.getConversationHistory(conversationId);
    } catch (error) {
      this.logger.error('Error retrieving conversation history:', error);
      return '';
    }
  }

  /**
   * Fetch external sources if enabled
   * @param query User query
   * @param relevantNotes Relevant notes
   * @returns External source results or null if disabled/error
   */
  private async fetchExternalSources(
    query: string,
    _relevantNotes: Note[],
  ): Promise<ExternalSourceResult[] | null> {
    // Check if external sources are enabled
    if (!this.contextManager.getExternalSourcesEnabled()) {
      return null;
    }

    try {
      const externalSourceContext = this.contextManager.getExternalSourceContext();
      const externalResults = await externalSourceContext.search(query);

      if (externalResults && externalResults.length > 0) {
        this.logger.info(`Found ${externalResults.length} external sources`);
      } else {
        this.logger.info('No relevant external sources found');
      }

      return externalResults;
    } catch (error) {
      this.logger.error('Error fetching external sources:', error);
      return null;
    }
  }

  /**
   * Format external sources as citations
   * @param results External source results
   * @returns External citations
   */
  private formatExternalCitations(results: ExternalSourceResult[] | null): ExternalCitation[] {
    if (!results || !Array.isArray(results)) {
      return [];
    }

    return results.map(result => ({
      title: result.title,
      source: result.source,
      url: result.url,
      excerpt: this.truncateContent(result.content, 150),
    }));
  }

  /**
   * Format prompt for the model
   * @param query User query
   * @param context Relevant note context
   * @param history Conversation history
   * @param profileAnalysis Profile analysis result
   * @param externalResults External source results
   * @returns Formatted system and user prompts
   */
  private async formatPrompt(
    query: string,
    context: ContextResult,
    history: string,
    profileAnalysis: ProfileAnalysisResult,
    externalResults: ExternalSourceResult[] | null,
  ): Promise<{ systemPrompt: string; userPrompt: string }> {
    // Get profile if relevant to the query
    let profileText: string | null = null;
    if (profileAnalysis.isProfileQuery || profileAnalysis.relevance > relevanceConfig.profileInclusionThreshold) {
      const profileContext = this.contextManager.getProfileContext();
      const profile = await profileContext.getProfile();
      
      if (profile) {
        // Get profile as a note which already has a text representation
        const profileNote = await profileContext.getProfileAsNote();
        profileText = profileNote?.content || null;
        this.logger.debug('Including profile in prompt');
      }
    }

    // Generate system prompt
    const systemPrompt = this.systemPromptGenerator.getSystemPrompt(
      Boolean(profileText), // isProfileQuery
      1.0, // profileRelevance (default high value)
      Boolean(externalResults && externalResults.length > 0), // hasExternalSources
    );

    // Format user prompt with all context
    const { formattedPrompt: userPrompt } = this.promptFormatter.formatPromptWithContext(
      query,
      context.relevantNotes,
      externalResults || [],
      Boolean(profileText),
      1.0, // default relevance
      undefined, // no profile available in context
      history,
    );

    return { systemPrompt, userPrompt };
  }

  /**
   * Call the model with the prepared prompts
   * @param systemPrompt System prompt
   * @param userPrompt User prompt with context
   * @param schema Optional schema for structured responses
   * @returns Model response
   */
  private async callModel<T = unknown>(
    systemPrompt: string,
    userPrompt: string,
    schema?: z.ZodType<T>, // Schema for structured responses
  ): Promise<{ object: T | undefined; usage?: { promptTokens: number; completionTokens: number } }> {
    try {
      const claude = this.resourceRegistry.getClaudeModel();
      
      // Call the model with the provided schema
      const response = await claude.complete({
        systemPrompt,
        userPrompt,
        schema, // Pass the schema to the claude.complete method
      });

      // The response.object already contains the structured response
      const structuredObject = response.object as T;

      // Map the usage to match the expected interface
      const usage = response.usage ? {
        promptTokens: response.usage.inputTokens || 0,
        completionTokens: response.usage.outputTokens || 0,
      } : undefined;

      return {
        object: structuredObject,
        usage,
      };
    } catch (error) {
      this.logger.error('Error calling model:', error);
      return { object: undefined };
    }
  }

  /**
   * Save a conversation turn
   * @param query User query
   * @param response Assistant response
   * @param options Turn options
   */
  private async saveTurn(
    query: string,
    response: string,
    options?: QueryOptions<unknown>,
  ): Promise<void> {
    try {
      // Create turn options from query options
      const turnOptions: TurnOptions = {
        userId: options?.userId,
        userName: options?.userName,
        metadata: {
          turnType: 'assistant',
          // Add more metadata here if needed
        },
      };

      await this.conversationManager.saveTurn(query, response, turnOptions);
    } catch (error) {
      this.logger.error('Error saving conversation turn:', error);
    }
  }

  /**
   * Truncate content to a specified length
   * @param content Content to truncate
   * @param maxLength Maximum length
   * @returns Truncated content with ellipsis if needed
   */
  private truncateContent(content: string, maxLength: number): string {
    if (!content) {
      return '';
    }

    if (content.length <= maxLength) {
      return content;
    }

    // Find the last complete sentence or word boundary before maxLength
    const truncated = content.slice(0, maxLength);
    const lastPeriod = truncated.lastIndexOf('.');
    const lastSpace = truncated.lastIndexOf(' ');

    // Prefer ending at a sentence boundary, otherwise use word boundary
    const breakPoint = lastPeriod > 0 ? lastPeriod + 1 : lastSpace;
    return breakPoint > 0 ? `${content.slice(0, breakPoint)}...` : `${truncated}...`;
  }
}