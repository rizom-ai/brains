/**
 * Service for managing note embeddings and vector operations
 * 
 * Implements the Component Interface Standardization pattern with:
 * - getInstance(): Returns the singleton instance
 * - resetInstance(): Resets the singleton instance (mainly for testing)
 * - createFresh(): Creates a new instance without affecting the singleton
 */
import { textConfig } from '@/config';
import type { Note } from '@/models/note';
import { EmbeddingService } from '@/resources/ai/embedding';
import type { IEmbeddingService } from '@/services/interfaces/IEmbeddingService';
import { ApiError, tryExec, ValidationError } from '@/utils/errorUtils';
import { Logger } from '@/utils/logger';
import { assertDefined, isDefined, isNonEmptyString } from '@/utils/safeAccessUtils';

import { NoteRepository } from './noteRepository';

/**
 * Service for managing note embeddings
 */
export class NoteEmbeddingService implements IEmbeddingService {
  private repository: NoteRepository;
  private embeddingService: EmbeddingService;
  
  /**
   * Singleton instance of NoteEmbeddingService
   * This property should be accessed only by getInstance(), resetInstance(), and createFresh()
   */
  private static instance: NoteEmbeddingService | null = null;
  
  /**
   * Logger instance for this service
   */
  protected logger = Logger.getInstance();
  
  /**
   * Get the singleton instance of the service
   * 
   * Part of the Component Interface Standardization pattern.
   * 
   * @param embeddingService Optional embedding service for dependency injection
   * @returns The shared NoteEmbeddingService instance
   */
  public static getInstance(embeddingService?: EmbeddingService): NoteEmbeddingService {
    if (!NoteEmbeddingService.instance) {
      NoteEmbeddingService.instance = new NoteEmbeddingService(embeddingService);
      
      const logger = Logger.getInstance();
      logger.debug('NoteEmbeddingService singleton instance created');
    } else if (embeddingService) {
      // Log a warning if trying to get instance with different embedding service
      const logger = Logger.getInstance();
      logger.warn('getInstance called with embeddingService but instance already exists. Service ignored.');
    }
    
    return NoteEmbeddingService.instance;
  }
  
  /**
   * Reset the singleton instance
   * 
   * Part of the Component Interface Standardization pattern.
   * Primarily used for testing to ensure a clean state.
   */
  public static resetInstance(): void {
    try {
      // Clean up resources if needed
      if (NoteEmbeddingService.instance) {
        // No specific cleanup needed for this service
      }
    } catch (error) {
      const logger = Logger.getInstance();
      logger.error('Error during NoteEmbeddingService instance reset:', error);
    } finally {
      NoteEmbeddingService.instance = null;
      
      const logger = Logger.getInstance();
      logger.debug('NoteEmbeddingService singleton instance reset');
    }
  }
  
  /**
   * Create a fresh service instance
   * 
   * Part of the Component Interface Standardization pattern.
   * Creates a new instance without affecting the singleton instance.
   * Primarily used for testing.
   * 
   * @param embeddingService Optional embedding service for dependency injection
   * @param noteRepository Optional note repository for dependency injection
   * @returns A new NoteEmbeddingService instance
   */
  public static createFresh(
    embeddingService?: EmbeddingService,
    noteRepository?: NoteRepository,
  ): NoteEmbeddingService {
    const logger = Logger.getInstance();
    logger.debug('Creating fresh NoteEmbeddingService instance');
    
    return new NoteEmbeddingService(embeddingService, noteRepository);
  }

  /**
   * Create a new NoteEmbeddingService
   * 
   * While this constructor is public, it is recommended to use the factory methods
   * getInstance() or createFresh() instead to ensure consistent instance management.
   * 
   * @param embeddingService Optional embedding service for dependency injection
   * @param noteRepository Optional note repository for dependency injection
   */
  constructor(embeddingService?: EmbeddingService, noteRepository?: NoteRepository) {
    this.embeddingService = embeddingService || EmbeddingService.getInstance();
    this.repository = noteRepository || NoteRepository.getInstance();
    this.logger.debug('NoteEmbeddingService instance created');
  }

  /**
   * Generate an embedding for the given text
   * @param text The text to generate embedding for
   * @returns The embedding vector
   * @throws ValidationError if text is empty
   * @throws ApiError if embedding generation fails
   */
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      if (!isNonEmptyString(text)) {
        throw new ValidationError('Empty text provided for embedding generation');
      }

      const result = await this.embeddingService.getEmbedding(text);
      
      if (!isDefined(result) || !Array.isArray(result) || result.length === 0) {
        throw new ApiError('Failed to generate valid embedding', undefined, {
          textLength: text.length,
        });
      }
      
      return result;
    } catch (error) {
      this.logger.error(`Error generating embedding: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Calculate similarity score between two embeddings
   * @param embedding1 First embedding
   * @param embedding2 Second embedding
   * @returns Similarity score (0 to 1)
   */
  calculateSimilarity(embedding1: number[], embedding2: number[]): number {
    try {
      return this.embeddingService.calculateSimilarity(embedding1, embedding2);
    } catch (error) {
      this.logger.error(`Error calculating similarity: ${error instanceof Error ? error.message : String(error)}`);
      return 0;
    }
  }

  /**
   * Get the embedding service instance
   * @returns The embedding service instance
   */
  getEmbeddingService(): EmbeddingService {
    return this.embeddingService;
  }

  /**
   * Generate an embedding for a note
   * @param title The note title
   * @param content The note content
   * @returns The embedding vector
   */
  async generateNoteEmbedding(title: string, content: string): Promise<number[]> {
    if (!isNonEmptyString(title) && !isNonEmptyString(content)) {
      throw new ValidationError('Empty note content for embedding generation');
    }

    // Combine title and content for better embedding context
    const combinedText = `${title || ''} ${content || ''}`.trim();
    
    if (combinedText.length === 0) {
      throw new ValidationError('Empty combined text for embedding generation');
    }
    
    return this.generateEmbedding(combinedText);
  }

  /**
   * Create chunks for a note and generate embeddings for each chunk
   * @param noteId The ID of the parent note
   * @param content The content to chunk
   * @returns Array of created chunk IDs
   * @throws ValidationError If the input parameters are invalid
   */
  async createNoteChunks(noteId: string, content: string): Promise<string[]> {
    // Validate inputs
    if (!isNonEmptyString(noteId)) {
      throw new ValidationError('Invalid note ID for chunking', { noteId });
    }
    
    if (!isNonEmptyString(content)) {
      throw new ValidationError('Empty or invalid content for chunking', { noteId, contentLength: 0 });
    }
    
    return tryExec(async () => {
      // Determine chunking parameters with safe defaults
      const chunkSize = isDefined(textConfig.defaultChunkSize) 
        ? textConfig.defaultChunkSize 
        : 1000;
        
      const chunkOverlap = isDefined(textConfig.defaultChunkOverlap) 
        ? textConfig.defaultChunkOverlap 
        : 200;
      
      // Chunk the content using configured parameters
      const chunks = this.embeddingService.chunkText(
        content,
        chunkSize,
        chunkOverlap,
      );
      
      if (!Array.isArray(chunks) || chunks.length === 0) {
        this.logger.warn(`No chunks were generated for note ${noteId}`);
        return [];
      }
      
      this.logger.info(`Generated ${chunks.length} chunks for note ${noteId}`);
      
      // Generate embeddings for all chunks in batch
      const embeddingResults = await this.embeddingService.getBatchEmbeddings(chunks);
      
      if (!Array.isArray(embeddingResults) || embeddingResults.length === 0) {
        throw new ApiError('Failed to generate embeddings for chunks', undefined, {
          noteId,
          chunksCount: chunks.length,
        });
      }
      
      // Insert each chunk with its embedding
      const chunkIds: string[] = [];
      
      for (let i = 0; i < chunks.length; i++) {
        if (i >= chunks.length || i >= embeddingResults.length) {
          continue;
        }
        
        // Skip invalid chunks or embeddings
        const chunkContent = chunks[i];
        const embeddingResult = embeddingResults[i];
        
        if (
          !isNonEmptyString(chunkContent) || 
          !isDefined(embeddingResult) || 
          !Array.isArray(embeddingResult) || 
          embeddingResult.length === 0
        ) {
          this.logger.warn(`Invalid chunk or embedding at index ${i} for note ${noteId}, skipping`);
          continue;
        }
        
        // Insert the chunk using the repository
        try {
          const chunkId = await this.repository.insertNoteChunk({
            noteId,
            content: chunkContent,
            embedding: embeddingResult,
            chunkIndex: i,
          });
          
          this.logger.debug(`Inserted chunk ${i} for note ${noteId}`);
          chunkIds.push(chunkId);
        } catch (chunkError) {
          this.logger.error(`Failed to insert chunk ${i} for note ${noteId}: ${chunkError}`);
        }
      }
      
      this.logger.info(`Successfully stored ${chunkIds.length} chunks for note ${noteId}`);
      return chunkIds;
    }, `Error creating note chunks for note ${noteId}`);
  }

  // Method removed - Embeddings are now required for all notes in the schema

  /**
   * Search notes by embedding similarity
   * @param embedding The embedding vector to search with
   * @param maxResults Maximum number of results to return
   * @returns Array of similar notes with similarity scores
   */
  async searchSimilarNotes(embedding: number[], maxResults = 5): Promise<(Note & { score: number })[]> {
    if (!Array.isArray(embedding) || embedding.length === 0) {
      throw new ValidationError('Invalid embedding for similarity search', { 
        embeddingType: typeof embedding,
        isArray: Array.isArray(embedding),
        length: Array.isArray(embedding) ? embedding.length : 0,
      });
    }
    
    try {
      // Apply safe limits
      const safeMaxResults = Math.max(1, Math.min(maxResults || 5, 50));
      
      // Get all notes with embeddings
      const notesWithEmbeddings = await this.repository.search({});
      
      this.logger.debug(`Found ${notesWithEmbeddings.length} notes with embeddings for similarity search`);
      
      if (notesWithEmbeddings.length === 0) {
        return [];
      }
      
      // Calculate similarity scores
      const scoredNotes: (Note & { score: number })[] = [];
      
      for (const note of notesWithEmbeddings) {
        if (Array.isArray(note.embedding) && note.embedding.length > 0) {
          try {
            const score = this.calculateSimilarity(embedding, note.embedding);
            
            scoredNotes.push({ 
              ...note, 
              score: isNaN(score) ? 0 : score,
            });
          } catch (similarityError) {
            // Skip notes where similarity calculation fails
            this.logger.debug(`Error calculating similarity for note ${note.id}: ${similarityError}`);
          }
        }
      }
      
      this.logger.debug(`Calculated similarity scores for ${scoredNotes.length} notes`);
      
      // Sort by similarity score (highest first)
      scoredNotes.sort((a, b) => b.score - a.score);
      
      // Return top matches
      return scoredNotes.slice(0, safeMaxResults);
    } catch (error) {
      this.logger.error(`Error in similarity search: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Find related notes for a given note ID based on embedding similarity
   * @param noteId ID of the note to find related notes for
   * @param maxResults Maximum number of results to return
   * @returns Array of related notes with similarity scores
   */
  async findRelatedNotes(noteId: string, maxResults = 5): Promise<(Note & { score: number })[]> {
    // Validate input
    if (!isNonEmptyString(noteId)) {
      throw new ValidationError('Invalid note ID for finding related notes', { noteId });
    }
    
    // Apply safe limits
    const safeMaxResults = Math.max(1, Math.min(maxResults || 5, 50));
    
    try {
      // Find the source note
      const sourceNote = await this.repository.getById(noteId);
      
      if (!isDefined(sourceNote)) {
        this.logger.warn(`Source note not found: ${noteId}`);
        return [];
      }
      
      if (!Array.isArray(sourceNote.embedding) || sourceNote.embedding.length === 0) {
        this.logger.debug(`Source note has no embedding for similarity search: ${noteId}`);
        return [];
      }
      
      // Get all other notes
      const allNotes = await this.repository.search({});
      // Filter out the source note
      const otherNotes = allNotes.filter(note => note.id !== noteId);
      
      this.logger.debug(`Found ${otherNotes.length} other notes with embeddings`);
      
      if (otherNotes.length === 0) {
        return [];
      }
      
      // Calculate similarity scores
      const scoredNotes: (Note & { score: number })[] = [];
      
      for (const note of otherNotes) {
        if (Array.isArray(note.embedding) && note.embedding.length > 0) {
          try {
            const score = this.calculateSimilarity(
              assertDefined(sourceNote.embedding),
              note.embedding,
            );
            
            scoredNotes.push({ 
              ...note, 
              score: isNaN(score) ? 0 : score,
            });
          } catch (similarityError) {
            // Skip notes where similarity calculation fails
            this.logger.debug(`Error calculating similarity between notes ${noteId} and ${note.id}: ${similarityError}`);
          }
        }
      }
      
      this.logger.debug(`Calculated similarity scores for ${scoredNotes.length} notes`);
      
      // Sort by similarity score (highest first)
      scoredNotes.sort((a, b) => b.score - a.score);
      
      // Return top matches
      return scoredNotes.slice(0, safeMaxResults);
    } catch (error) {
      this.logger.error(`Error finding related notes: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
}