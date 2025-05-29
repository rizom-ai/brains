/**
 * MCPNoteContext - Note Context using the simplified MCP design
 * 
 * This implementation uses the new composition-based MCPContext pattern
 * instead of the previous inheritance-based BaseContext approach.
 * 
 * Implements the Component Interface Standardization pattern with:
 * - getInstance(): Returns the singleton instance 
 * - resetInstance(): Resets the singleton instance (mainly for testing)
 * - createFresh(): Creates a new instance without affecting the singleton
 * 
 * Also implements NoteToolContext for compatibility with NoteToolService during migration
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { textConfig } from '@/config';
import { createContextFunctionality, type MCPContext, type MCPFormatterInterface, type MCPStorageInterface } from '@/contexts/MCPContext';
import type { Note } from '@/models/note';
import type { NoteEmbeddingService, NoteRepository, NoteSearchService } from '@/services/notes';
import type { NoteSearchOptions } from '@/services/notes/noteSearchService';
import { ServiceRegistry } from '@/services/serviceRegistry';
import { Logger } from '@/utils/logger';
import { isNonEmptyString } from '@/utils/safeAccessUtils';

import { NoteFormatter } from './formatters';
import { NoteStorageAdapter } from './noteStorageAdapter';
import { type NoteToolContext, NoteToolService } from './tools';

/**
 * Configuration for the MCPNoteContext
 */
export interface MCPNoteContextConfig extends Record<string, unknown> {
  /**
   * API key for embedding service
   */
  apiKey?: string;

  /**
   * Name for the context (defaults to 'NoteBrain')
   */
  name?: string;

  /**
   * Version for the context (defaults to '1.0.0')
   */
  version?: string;
}

/**
 * Dependencies for MCPNoteContext
 */
export interface MCPNoteContextDependencies {
  /** Note repository instance */
  repository?: NoteRepository;
  /** Note embedding service instance */
  embeddingService?: NoteEmbeddingService;
  /** Note search service instance */
  searchService?: NoteSearchService;
  /** Storage adapter instance */
  storageAdapter?: NoteStorageAdapter;
  /** Formatter instance */
  formatter?: NoteFormatter;
  /** Logger instance */
  logger?: Logger;
}

/**
 * Context for working with notes using the new MCP Pattern
 * 
 * Acts as a facade for note-related operations, coordinating between
 * services, repositories, and MCP components.
 * 
 * Uses composition instead of inheritance by delegating to the context
 * functionality created by createContextFunctionality.
 */
export class MCPNoteContext implements MCPContext, NoteToolContext {
  /** Logger instance */
  private logger: Logger;

  /** Configuration values */
  private config: MCPNoteContextConfig;

  // Dependencies
  private repository: NoteRepository;
  private embeddingService: NoteEmbeddingService;
  private searchService: NoteSearchService;
  private storage: NoteStorageAdapter;
  private formatter: NoteFormatter;

  // Context functionality from the utility function
  private contextImpl: ReturnType<typeof createContextFunctionality>;

  // Singleton instance
  private static instance: MCPNoteContext | null = null;

  /**
   * Get singleton instance of MCPNoteContext
   * 
   * @param options Configuration options (only used when creating a new instance)
   * @returns The singleton instance
   */
  static getInstance(options?: MCPNoteContextConfig): MCPNoteContext {
    if (!MCPNoteContext.instance) {
      // Prepare config with defaults
      const config = options || {};

      MCPNoteContext.instance = MCPNoteContext.createFresh(config);

      const logger = Logger.getInstance();
      logger.debug('MCPNoteContext singleton instance created');
    } else if (options) {
      // Log at debug level if trying to get instance with different config
      const logger = Logger.getInstance();
      logger.debug('getInstance called with config but instance already exists. Config ignored.');
    }

    return MCPNoteContext.instance;
  }

  /**
   * Reset the singleton instance (primarily for testing)
   * This clears the instance and any resources it holds
   */
  static resetInstance(): void {
    if (MCPNoteContext.instance) {
      // Any cleanup needed before destroying the instance
      const logger = Logger.getInstance();
      logger.debug('MCPNoteContext singleton instance reset');

      MCPNoteContext.instance = null;
    }
  }

  /**
   * Create a fresh instance (primarily for testing)
   * This creates a new instance without affecting the singleton
   * 
   * @param config Configuration options
   * @param dependencies Optional dependencies
   * @returns A new MCPNoteContext instance
   */
  static createFresh(
    config: MCPNoteContextConfig = {},
    dependencies?: MCPNoteContextDependencies,
  ): MCPNoteContext {
    const logger = dependencies?.logger || Logger.getInstance();
    logger.debug('Creating fresh MCPNoteContext instance');

    const serviceRegistry = ServiceRegistry.getInstance({
      apiKey: config.apiKey,
    });

    if (dependencies) {
      // If dependencies are explicitly provided, use them with fallbacks
      return new MCPNoteContext(
        config,
        dependencies.repository || serviceRegistry.getNoteRepository(),
        dependencies.embeddingService || serviceRegistry.getNoteEmbeddingService(),
        dependencies.searchService || serviceRegistry.getNoteSearchService(),
        dependencies.storageAdapter,
        dependencies.formatter,
        dependencies.logger,
      );
    }

    // Otherwise use services from registry
    return new MCPNoteContext(
      config,
      serviceRegistry.getNoteRepository(),
      serviceRegistry.getNoteEmbeddingService(),
      serviceRegistry.getNoteSearchService(),
    );
  }

  /**
   * Constructor for MCPNoteContext with explicit dependency injection
   * 
   * @param config Configuration for the context
   * @param repository Note repository instance
   * @param embeddingService Note embedding service instance
   * @param searchService Note search service instance
   * @param storageAdapter Optional storage adapter instance (created from repository if not provided)
   * @param formatter Optional formatter instance
   * @param logger Optional logger instance
   */
  constructor(
    config: MCPNoteContextConfig,
    repository: NoteRepository,
    embeddingService: NoteEmbeddingService,
    searchService: NoteSearchService,
    storageAdapter?: NoteStorageAdapter,
    formatter?: NoteFormatter,
    logger?: Logger,
  ) {
    this.config = config;
    this.logger = logger || Logger.getInstance();
    
    // Store repository and services
    this.repository = repository;
    this.embeddingService = embeddingService;
    this.searchService = searchService;

    // Initialize storage adapter - explicitly use the provided adapter or create one
    this.storage = storageAdapter || new NoteStorageAdapter(this.repository);

    // Initialize formatter
    this.formatter = formatter || NoteFormatter.getInstance();

    // Create the context implementation using the utility function
    this.contextImpl = createContextFunctionality({
      name: (this.config.name as string) || 'NoteBrain',
      version: (this.config.version as string) || '1.0.0',
      logger: this.logger,
    });

    // Initialize MCP resources and tools
    this.initializeMcpComponents();

    this.logger.debug('MCPNoteContext initialized with dependency injection', { context: 'MCPNoteContext' });
  }

  /**
   * Initialize MCP components (resources and tools)
   */
  private initializeMcpComponents(): void {
    // Register note resources
    this.contextImpl.resources.push(
      {
        protocol: 'note',
        path: ':id',
        handler: async (params) => {
          const id = params['id'] as string;
          if (!id) {
            throw new Error('No note ID provided');
          }

          const note = await this.getNoteById(id);

          if (!note) {
            throw new Error(`Note with ID ${id} not found`);
          }

          return {
            id: note.id,
            title: note.title || 'Untitled Note',
            content: note.content || '',
            tags: note.tags,
            createdAt: note.createdAt,
            updatedAt: note.updatedAt,
          };
        },
        name: 'Get Note',
        description: 'Retrieve a note by ID',
      },

      {
        protocol: 'notes',
        path: 'search',
        handler: async (_params, query) => {
          const options: NoteSearchOptions = {
            query: query ? query['query'] as string : undefined,
            tags: query && query['tags'] ? String(query['tags']).split(',') : undefined,
            limit: query && query['limit'] ? Number(query['limit']) : 10,
            offset: query && query['offset'] ? Number(query['offset']) : 0,
            semanticSearch: query && query['semantic'] ? String(query['semantic']) === 'true' : true,
          };

          const notes = await this.searchNotes(options);

          return {
            count: notes.length,
            notes: notes.map(note => ({
              id: note.id,
              title: note.title || 'Untitled Note',
              preview: note.content?.substring(0, 150) || '',
              tags: note.tags,
              createdAt: note.createdAt,
            })),
          };
        },
        name: 'Search Notes',
        description: 'Search notes by query or tags',
      },

      {
        protocol: 'notes',
        path: 'recent',
        handler: async (_params, query) => {
          const limit = query && query['limit'] ? Number(query['limit']) : 5;
          const notes = await this.getRecentNotes(limit);

          return {
            count: notes.length,
            notes: notes.map(note => ({
              id: note.id,
              title: note.title || 'Untitled Note',
              preview: note.content?.substring(0, 150) || '',
              tags: note.tags,
              createdAt: note.createdAt,
            })),
          };
        },
        name: 'Recent Notes',
        description: 'Get recent notes',
      },

      {
        protocol: 'notes',
        path: 'related/:id',
        handler: async (params, query) => {
          const id = params['id'] as string;
          const limit = query && query['limit'] ? Number(query['limit']) : 5;

          if (!id) {
            throw new Error('No note ID provided');
          }

          const notes = await this.getRelatedNotes(id, limit);

          return {
            sourceId: id,
            count: notes.length,
            notes: notes.map(note => ({
              id: note.id,
              title: note.title || 'Untitled Note',
              preview: note.content?.substring(0, 150) || '',
              tags: note.tags,
              createdAt: note.createdAt,
            })),
          };
        },
        name: 'Related Notes',
        description: 'Get notes related to a specific note',
      },
    );

    // Get the tool service instance
    const toolService = NoteToolService.getInstance();

    // Register note tools using the tool service
    // The NoteToolService now uses NoteToolContext interface that works with both
    // NoteContext and MCPNoteContext during the migration phase
    const tools = toolService.getTools(this);
    
    // Store the tools in our context implementation
    this.contextImpl.tools.push(...tools);
  }

  // Public API methods that delegate to storage and services

  /**
   * Retrieve a note by its ID
   * @param id The ID of the note to retrieve
   * @returns The note object or null if not found
   */
  async getNoteById(id: string): Promise<Note | null> {
    return await this.storage.read(id);
  }

  /**
   * Create a new note with embeddings
   * @param note The note data to create
   * @returns The ID of the created note
   */
  async createNote(note: Partial<Note>): Promise<string> {
    try {
      // Generate embedding if not provided
      let embedding = note.embedding;

      if (!embedding || !Array.isArray(embedding) || embedding.length === 0) {
        try {
          const title = isNonEmptyString(note.title) ? note.title : '';
          const content = isNonEmptyString(note.content) ? note.content : '';

          if (title.length > 0 || content.length > 0) {
            // Combine title and content for embedding
            const combinedText = `${title} ${content}`.trim();
            embedding = await this.embeddingService.generateEmbedding(combinedText);
          }
        } catch (error) {
          this.logger.error(`Error generating embedding for new note: ${error instanceof Error ? error.message : String(error)}`, { error, context: 'MCPNoteContext' });
        }
      }

      // Insert the note
      const now = new Date();
      const noteData: Partial<Note> = {
        ...note,
        embedding,
        createdAt: note.createdAt || now,
        updatedAt: note.updatedAt || now,
      };

      const noteId = await this.storage.create(noteData);

      // If the note is long, also create chunks
      const content = isNonEmptyString(note.content) ? note.content : '';
      if (content.length > (textConfig.defaultChunkThreshold || 1000)) {
        try {
          await this.embeddingService.createNoteChunks(noteId, content);
        } catch (error) {
          this.logger.error(`Failed to create chunks for note ${noteId}: ${error instanceof Error ? error.message : String(error)}`, { error, context: 'MCPNoteContext' });
        }
      }

      return noteId;
    } catch (error) {
      this.logger.error(`Failed to create note: ${error instanceof Error ? error.message : String(error)}`, { error, context: 'MCPNoteContext' });
      throw error;
    }
  }

  /**
   * Search notes based on query text and/or tags with optional semantic search
   * @param options Search options including query, tags, limit, offset, and search type
   * @returns Array of matching notes
   */
  async searchNotes(options: NoteSearchOptions): Promise<Note[]> {
    return this.searchService.searchNotes(options);
  }

  /**
   * Get related notes based on vector similarity
   * @param noteId ID of the note to find related notes for
   * @param maxResults Maximum number of results to return
   * @returns Array of related notes
   */
  async getRelatedNotes(noteId: string, maxResults = 5): Promise<Note[]> {
    return this.searchService.findRelated(noteId, maxResults);
  }

  /**
   * Search notes using text instead of embedding vector
   * First generates an embedding for the text then searches similar notes
   * @param text The text to generate an embedding for
   * @param limit Maximum number of results to return
   * @param tags Optional tags to filter by
   * @returns Array of similar notes with similarity scores
   */
  async searchWithEmbedding(text: string, limit = 10, tags?: string[]): Promise<(Note & { similarity?: number })[]> {
    if (!text) {
      this.logger.error('Empty text provided to searchWithEmbedding', { context: 'MCPNoteContext' });
      return [];
    }

    try {
      // Generate embedding for the text
      const embedding = await this.embeddingService.generateEmbedding(text);

      // Search for similar notes
      const scoredNotes = await this.embeddingService.searchSimilarNotes(embedding, limit * 2); // Get more to allow for tag filtering

      // Filter by tags if needed
      let results = scoredNotes;
      if (tags && tags.length > 0) {
        results = scoredNotes.filter(note => {
          // If the note has no tags, it doesn't match
          if (!note.tags || note.tags.length === 0) {
            return false;
          }

          // Check if any of the note's tags match any of the requested tags
          return note.tags.some(tag => tags.includes(tag));
        });
      }

      // Limit results
      return results.slice(0, limit);
    } catch (error) {
      this.logger.error(`Error in searchWithEmbedding: ${error instanceof Error ? error.message : String(error)}`, { error, context: 'MCPNoteContext' });
      return [];
    }
  }

  /**
   * Get recent notes ordered by update time
   * @param limit Maximum number of notes to return
   * @returns Array of recent notes
   */
  async getRecentNotes(limit = 5): Promise<Note[]> {
    return this.storage.list({ limit });
  }


  /**
   * Get the total count of notes in the database
   * @returns The total number of notes
   */
  async getNoteCount(): Promise<number> {
    return this.storage.count();
  }

  /**
   * Update an existing note
   * @param id The ID of the note to update
   * @param updates The fields to update
   * @returns True if the update was successful
   */
  async updateNote(id: string, updates: Partial<Note>): Promise<boolean> {
    try {
      // Generate a new embedding if content or title was updated
      if (updates.content || updates.title) {
        try {
          const existingNote = await this.getNoteById(id);
          if (existingNote) {
            const title = updates.title || existingNote.title || '';
            const content = updates.content || existingNote.content || '';

            // Generate embedding for combined text
            const combinedText = `${title} ${content}`.trim();
            const embedding = await this.embeddingService.generateEmbedding(combinedText);

            // Add embedding to updates
            updates.embedding = embedding;
          }
        } catch (error) {
          this.logger.error(`Error generating embedding for updated note: ${error instanceof Error ? error.message : String(error)}`, { error, context: 'MCPNoteContext' });
        }
      }

      // Add updated timestamp
      updates.updatedAt = new Date();

      // Update the note
      return this.storage.update(id, updates);
    } catch (error) {
      this.logger.error(`Failed to update note ${id}: ${error instanceof Error ? error.message : String(error)}`, { error, context: 'MCPNoteContext' });
      return false;
    }
  }

  /**
   * Delete a note by ID
   * @param id The ID of the note to delete
   * @returns True if the deletion was successful
   */
  async deleteNote(id: string): Promise<boolean> {
    try {
      return this.storage.delete(id);
    } catch (error) {
      this.logger.error(`Failed to delete note ${id}: ${error instanceof Error ? error.message : String(error)}`, { error, context: 'MCPNoteContext' });
      return false;
    }
  }

  /**
   * Get the note repository instance
   */
  getNoteRepository(): NoteRepository {
    return this.repository;
  }

  /**
   * Get the note embedding service instance
   */
  getNoteEmbeddingService(): NoteEmbeddingService {
    return this.embeddingService;
  }

  /**
   * Get the storage adapter
   * @returns The storage interface for notes
   */
  getStorage(): MCPStorageInterface {
    return this.storage as unknown as MCPStorageInterface;
  }

  /**
   * Get the formatter
   * @returns The formatter
   */
  getFormatter(): MCPFormatterInterface {
    return this.formatter as unknown as MCPFormatterInterface;
  }

  // Standard MCPContext interface implementation - delegated to contextImpl

  /**
   * Get the context name
   */
  getContextName(): string {
    return this.contextImpl.getContextName();
  }

  /**
   * Get the context version
   */
  getContextVersion(): string {
    return this.contextImpl.getContextVersion();
  }

  /**
   * Initialize the context
   */
  async initialize(): Promise<boolean> {
    return this.contextImpl.initialize();
  }

  /**
   * Check if the context is ready
   */
  isReady(): boolean {
    return this.contextImpl.isReady();
  }

  /**
   * Get the context status
   */
  getStatus(): ReturnType<typeof this.contextImpl.getStatus> {
    return this.contextImpl.getStatus();
  }

  /**
   * Register the context on an MCP server
   */
  registerOnServer(server: McpServer): boolean {
    return this.contextImpl.registerOnServer(server);
  }

  /**
   * Get the MCP server
   */
  getMcpServer(): McpServer {
    return this.contextImpl.getMcpServer();
  }

  /**
   * Get the context capabilities
   */
  getCapabilities(): ReturnType<typeof this.contextImpl.getCapabilities> {
    return this.contextImpl.getCapabilities();
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    await this.contextImpl.cleanup();
  }
}