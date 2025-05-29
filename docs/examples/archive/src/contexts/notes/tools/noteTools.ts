/**
 * Note Tools for MCP
 * 
 * This file contains the tool definitions for the NoteContext
 * following the Component Interface Standardization pattern with:
 * - getInstance(): Returns the singleton instance
 * - resetInstance(): Resets the singleton instance (mainly for testing)
 * - createFresh(): Creates a new instance without affecting the singleton
 * - createWithDependencies(): Creates a new instance with explicit dependencies
 */

import { z } from 'zod';

import type { ResourceDefinition } from '@/contexts/contextInterface';
import type { Note } from '@/models/note';
import { Logger } from '@/utils/logger';

/**
 * Schema definitions for note tools
 */
const CreateNoteSchema = z.object({
  title: z.string().optional(),
  content: z.string().min(1, 'Content must not be empty'),
  tags: z.array(z.string()).optional(),
});

// GenerateEmbeddingsSchema removed - Embeddings are now required

const SearchWithEmbeddingSchema = z.object({
  text: z.string().min(1, 'Text must not be empty'),
  limit: z.number().positive().optional(),
  tags: z.array(z.string()).optional(),
});

const SearchNotesSchema = z.object({
  query: z.string().optional(),
  tags: z.array(z.string()).optional(),
  limit: z.number().positive().optional(),
  offset: z.number().nonnegative().optional(),
  semanticSearch: z.boolean().optional(),
});

const GetNoteSchema = z.object({
  id: z.string().min(1, 'Note ID must not be empty'),
});

const UpdateNoteSchema = z.object({
  id: z.string().min(1, 'Note ID must not be empty'),
  title: z.string().optional(),
  content: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

const DeleteNoteSchema = z.object({
  id: z.string().min(1, 'Note ID must not be empty'),
});

/**
 * Interface that defines the required methods for any note context implementation.
 * This interface is implemented by MCPNoteContext and provides the contract
 * that the tool service expects from a note context.
 */
export interface NoteToolContext {
  createNote(data: Partial<Note>): Promise<string>;
  searchWithEmbedding(text: string, limit: number, tags?: string[]): Promise<Array<Note & { similarity?: number }>>;
  searchNotes(options: {
    query?: string;
    tags?: string[];
    limit?: number;
    offset?: number;
    semanticSearch?: boolean;
  }): Promise<Note[]>;
  getNoteById(id: string): Promise<Note | null>;
  updateNote(id: string, updates: Partial<Note>): Promise<boolean>;
  deleteNote(id: string): Promise<boolean>;
}

/**
 * Configuration options for NoteToolService
 */
export interface NoteToolServiceConfig {
  /** Default limit for search results */
  defaultSearchLimit?: number;
  /** Default semantic search setting */
  defaultSemanticSearch?: boolean;
}

/**
 * Dependencies for NoteToolService
 */
export interface NoteToolServiceDependencies {
  /** Logger instance */
  logger?: Logger;
}

/**
 * Service responsible for providing MCP tools for notes
 * Follows the Component Interface Standardization pattern
 */
export class NoteToolService {
  /** The singleton instance */
  private static instance: NoteToolService | null = null;
  
  /** Configuration values */
  private readonly config: NoteToolServiceConfig;
  
  /** Logger instance for this class */
  private readonly logger: Logger;
  
  /**
   * Get the singleton instance of NoteToolService
   * 
   * @param config Optional configuration
   * @returns The shared NoteToolService instance
   */
  public static getInstance(config?: NoteToolServiceConfig): NoteToolService {
    if (!NoteToolService.instance) {
      NoteToolService.instance = new NoteToolService(config);
    } else if (config) {
      // Log a warning if trying to get instance with different config
      const logger = Logger.getInstance();
      logger.warn('getInstance called with config but instance already exists. Config ignored.');
    }
    return NoteToolService.instance;
  }
  
  /**
   * Reset the singleton instance (primarily for testing)
   * This clears the instance and any resources it holds
   */
  public static resetInstance(): void {
    NoteToolService.instance = null;
  }
  
  /**
   * Create a fresh instance (primarily for testing)
   * This creates a new instance without affecting the singleton
   * 
   * @param config Optional configuration
   * @returns A new NoteToolService instance
   */
  public static createFresh(config?: NoteToolServiceConfig): NoteToolService {
    return new NoteToolService(config);
  }
  
  /**
   * Create a new instance with explicit dependencies
   * 
   * @param config Configuration options
   * @param dependencies External dependencies
   * @returns A new NoteToolService instance
   */
  public static createWithDependencies(
    config: Record<string, unknown> = {},
    dependencies: Record<string, unknown> = {},
  ): NoteToolService {
    // Convert config to typed config
    const toolServiceConfig: NoteToolServiceConfig = {
      defaultSearchLimit: config['defaultSearchLimit'] as number,
      defaultSemanticSearch: config['defaultSemanticSearch'] as boolean,
    };
    
    // Create with typed dependencies
    return new NoteToolService(
      toolServiceConfig,
      {
        logger: dependencies['logger'] as Logger,
      },
    );
  }
  
  /**
   * Private constructor to enforce factory methods
   * 
   * @param config Optional configuration
   * @param dependencies Optional dependencies
   */
  private constructor(
    config?: NoteToolServiceConfig,
    dependencies?: NoteToolServiceDependencies,
  ) {
    this.config = {
      defaultSearchLimit: config?.defaultSearchLimit ?? 10,
      defaultSemanticSearch: config?.defaultSemanticSearch ?? true,
    };
    this.logger = dependencies?.logger || Logger.getInstance();
    
    this.logger.debug('NoteToolService initialized', { context: 'NoteToolService' });
  }
  
  /**
   * Get the MCP tools for the note context
   * 
   * @param context The note context
   * @returns Array of MCP tools
   */
  getTools(context: NoteToolContext): ResourceDefinition[] {
    return [
      // create_note
      this.createNoteTool(context),
      
      // generate_embeddings tool removed - Embeddings are now required
      
      // search_with_embedding
      this.searchWithEmbeddingTool(context),
      
      // search_notes
      this.searchNotesTool(context),
      
      // get_note
      this.getNoteTool(context),
      
      // update_note
      this.updateNoteTool(context),
      
      // delete_note
      this.deleteNoteTool(context),
    ];
  }


  /**
   * Create the create_note tool
   */
  private createNoteTool(context: NoteToolContext): ResourceDefinition {
    return {
      protocol: 'notes',
      path: 'create_note',
      name: 'create_note',
      description: 'Create a new note with optional title and tags',
      inputSchema: CreateNoteSchema,
      handler: async (params: Record<string, unknown>) => {
        try {
          const { title, content, tags } = CreateNoteSchema.parse(params);
          
          const noteId = await context.createNote({
            title: title || '',
            content,
            tags: tags || [],
          });
          
          return { noteId };
        } catch (error) {
          this.logger.error('Error creating note via MCP tool', { error, context: 'NoteContext' });
          return {
            isError: true,
            error: `Failed to create note: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    };
  }

  // Generate embeddings tool removed - Embeddings are now required for all notes

  /**
   * Create the search_with_embedding tool
   */
  private searchWithEmbeddingTool(context: NoteToolContext): ResourceDefinition {
    return {
      protocol: 'notes',
      path: 'search_with_embedding',
      name: 'search_with_embedding',
      description: 'Search notes using semantic similarity with a text passage',
      inputSchema: SearchWithEmbeddingSchema,
      handler: async (params: Record<string, unknown>) => {
        try {
          const { text, limit, tags } = SearchWithEmbeddingSchema.parse(params);
          const effectiveLimit = limit || this.config.defaultSearchLimit || 10;
          
          const notes = await context.searchWithEmbedding(text, effectiveLimit, tags);
          
          return {
            count: notes.length,
            notes: notes.map(note => ({
              id: note.id,
              title: note.title || 'Untitled Note',
              preview: note.content?.substring(0, 150) || '',
              tags: note.tags,
              similarity: note.similarity,
            })),
          };
        } catch (error) {
          this.logger.error('Error searching with embeddings via MCP tool', { error, context: 'NoteContext' });
          return {
            isError: true,
            error: `Failed to search with embeddings: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    };
  }

  /**
   * Create the search_notes tool
   */
  private searchNotesTool(context: NoteToolContext): ResourceDefinition {
    return {
      protocol: 'notes',
      path: 'search_notes',
      name: 'search_notes',
      description: 'Search notes by query and/or tags',
      inputSchema: SearchNotesSchema,
      handler: async (params: Record<string, unknown>) => {
        try {
          const parsed = SearchNotesSchema.parse(params);
          const options = {
            query: parsed.query,
            tags: parsed.tags,
            limit: parsed.limit || this.config.defaultSearchLimit || 10,
            offset: parsed.offset || 0,
            semanticSearch: parsed.semanticSearch ?? this.config.defaultSemanticSearch,
          };
          
          const notes = await context.searchNotes(options);
          
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
        } catch (error) {
          this.logger.error('Error searching notes via MCP tool', { error, context: 'NoteContext' });
          return {
            isError: true,
            error: `Failed to search notes: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    };
  }

  /**
   * Create the get_note tool
   */
  private getNoteTool(context: NoteToolContext): ResourceDefinition {
    return {
      protocol: 'notes',
      path: 'get_note',
      name: 'get_note',
      description: 'Get a note by ID',
      inputSchema: GetNoteSchema,
      handler: async (params: Record<string, unknown>) => {
        try {
          const { id } = GetNoteSchema.parse(params);
          
          const note = await context.getNoteById(id);
          
          if (!note) {
            return {
              isError: true,
              error: `Note with ID ${id} not found`,
            };
          }
          
          return {
            id: note.id,
            title: note.title || 'Untitled Note',
            content: note.content || '',
            tags: note.tags,
            createdAt: note.createdAt,
            updatedAt: note.updatedAt,
          };
        } catch (error) {
          this.logger.error('Error getting note via MCP tool', { error, context: 'NoteContext' });
          return {
            isError: true,
            error: `Failed to get note: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    };
  }

  /**
   * Create the update_note tool
   */
  private updateNoteTool(context: NoteToolContext): ResourceDefinition {
    return {
      protocol: 'notes',
      path: 'update_note',
      name: 'update_note',
      description: 'Update an existing note',
      inputSchema: UpdateNoteSchema,
      handler: async (params: Record<string, unknown>) => {
        try {
          const { id, title, content, tags } = UpdateNoteSchema.parse(params);
          
          if (!title && !content && !tags) {
            throw new Error('At least one field to update is required');
          }
          
          const success = await context.updateNote(id, {
            title,
            content,
            tags,
          });
          
          if (!success) {
            return {
              isError: true,
              error: `Failed to update note with ID ${id}`,
            };
          }
          
          return { success: true, noteId: id };
        } catch (error) {
          this.logger.error('Error updating note via MCP tool', { error, context: 'NoteContext' });
          return {
            isError: true,
            error: `Failed to update note: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    };
  }

  /**
   * Create the delete_note tool
   */
  private deleteNoteTool(context: NoteToolContext): ResourceDefinition {
    return {
      protocol: 'notes',
      path: 'delete_note',
      name: 'delete_note',
      description: 'Delete a note by ID',
      inputSchema: DeleteNoteSchema,
      handler: async (params: Record<string, unknown>) => {
        try {
          const { id } = DeleteNoteSchema.parse(params);
          
          const success = await context.deleteNote(id);
          
          if (!success) {
            return {
              isError: true,
              error: `Failed to delete note with ID ${id}`,
            };
          }
          
          return { success: true, noteId: id };
        } catch (error) {
          this.logger.error('Error deleting note via MCP tool', { error, context: 'NoteContext' });
          return {
            isError: true,
            error: `Failed to delete note: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    };
  }
}