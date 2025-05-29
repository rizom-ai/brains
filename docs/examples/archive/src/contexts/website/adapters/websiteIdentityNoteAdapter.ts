/**
 * WebsiteIdentityNoteAdapter
 * 
 * Specialized adapter for converting between website identity data and note format
 * Allows the website context to store identity information as a special kind of note
 * 
 * Implements the Component Interface Standardization pattern with:
 * - getInstance(): Returns the singleton instance
 * - resetInstance(): Resets the singleton instance (mainly for testing)
 * - createFresh(): Creates a new instance without affecting the singleton
 */

import type { NoteStorageAdapter } from '@/contexts/notes/noteStorageAdapter';
import type { Note } from '@/models/note';
import { ServiceRegistry } from '@/services/serviceRegistry';
import { Logger } from '@/utils/logger';

import { type WebsiteIdentityData, WebsiteIdentitySchema } from '../schemas/websiteIdentitySchema';

// Consistent ID for the identity note
const IDENTITY_NOTE_ID = 'website-identity';

/**
 * Configuration options for WebsiteIdentityNoteAdapter
 */
export interface WebsiteIdentityNoteAdapterConfig {
  /** Optional note ID to use (defaults to 'website-identity') */
  noteId?: string;
  /** Optional note title to use (defaults to 'Website Identity Information') */
  noteTitle?: string;
}

/**
 * Dependencies for WebsiteIdentityNoteAdapter
 */
export interface WebsiteIdentityNoteAdapterDependencies {
  /** Note storage adapter for persistence */
  noteStorageAdapter: NoteStorageAdapter;
  /** Logger instance */
  logger?: Logger;
}

/**
 * Adapter for storing website identity data as a note
 * Provides conversion between website identity data format and note format
 */
export class WebsiteIdentityNoteAdapter {
  /** The singleton instance */
  private static instance: WebsiteIdentityNoteAdapter | null = null;
  
  /** Logger instance */
  private readonly logger: Logger;
  
  /** Note storage adapter for accessing notes */
  private readonly noteStorageAdapter: NoteStorageAdapter;
  
  /** Note ID for the identity data */
  private readonly noteId: string;
  
  /** Note title for the identity data */
  private readonly noteTitle: string;
  
  /**
   * Create a new WebsiteIdentityNoteAdapter
   * @param noteStorageAdapter The note storage adapter to use
   * @param config Configuration options
   */
  constructor(
    noteStorageAdapter: NoteStorageAdapter,
    config: WebsiteIdentityNoteAdapterConfig = {},
  ) {
    this.noteStorageAdapter = noteStorageAdapter;
    this.logger = Logger.getInstance();
    this.noteId = config.noteId || IDENTITY_NOTE_ID;
    this.noteTitle = config.noteTitle || 'Website Identity Information';
  }
  
  /**
   * Get the singleton instance of WebsiteIdentityNoteAdapter
   * @param config Configuration options
   * @returns The shared WebsiteIdentityNoteAdapter instance
   */
  public static getInstance(config: WebsiteIdentityNoteAdapterConfig = {}): WebsiteIdentityNoteAdapter {
    if (!WebsiteIdentityNoteAdapter.instance) {
      // Get dependencies from service registry
      const serviceRegistry = ServiceRegistry.getInstance();
      const noteStorageAdapter = serviceRegistry.resolve<NoteStorageAdapter>('noteStorageAdapter');
      
      WebsiteIdentityNoteAdapter.instance = new WebsiteIdentityNoteAdapter(noteStorageAdapter, config);
    }
    return WebsiteIdentityNoteAdapter.instance;
  }
  
  /**
   * Reset the singleton instance (primarily for testing)
   * This clears the instance and any resources it holds
   */
  public static resetInstance(): void {
    WebsiteIdentityNoteAdapter.instance = null;
  }
  
  /**
   * Create a fresh instance (primarily for testing)
   * This creates a new instance without affecting the singleton
   * @param config Configuration options
   * @param dependencies Injectable dependencies
   * @returns A new WebsiteIdentityNoteAdapter instance
   */
  public static createFresh(
    config: WebsiteIdentityNoteAdapterConfig = {},
    dependencies: WebsiteIdentityNoteAdapterDependencies,
  ): WebsiteIdentityNoteAdapter {
    if (!dependencies || !dependencies.noteStorageAdapter) {
      throw new Error('NoteStorageAdapter is required for WebsiteIdentityNoteAdapter.createFresh()');
    }
    
    return new WebsiteIdentityNoteAdapter(
      dependencies.noteStorageAdapter,
      config,
    );
  }
  
  /**
   * Get identity data from the note store
   * @returns The identity data or null if not found
   */
  async getIdentityData(): Promise<WebsiteIdentityData | null> {
    try {
      // Read the note using the configured ID
      const note = await this.noteStorageAdapter.read(this.noteId);
      
      if (!note) {
        this.logger.debug('No identity data found in notes');
        return null;
      }
      
      // Parse the JSON content
      try {
        // Convert note to identity data format
        return this.convertNoteToIdentityData(note);
      } catch (parseError) {
        this.logger.error('Error parsing identity data from note content', parseError);
        return null;
      }
    } catch (error) {
      this.logger.error('Error retrieving identity data from notes', error);
      return null;
    }
  }
  
  /**
   * Save identity data as a note
   * @param data The identity data to save
   * @returns True if save was successful
   */
  async saveIdentityData(data: WebsiteIdentityData): Promise<boolean> {
    try {
      // Validate data with schema
      const validData = WebsiteIdentitySchema.parse(data);
      
      // Check if note exists first
      const existingNote = await this.noteStorageAdapter.read(this.noteId);
      
      if (existingNote) {
        // Update existing note
        this.logger.debug('Updating existing identity note');
        const noteData = this.convertIdentityDataToNote(validData);
        const updated = await this.noteStorageAdapter.update(this.noteId, noteData);
        
        this.logger.debug('Updated identity data in notes', { success: updated });
        return updated;
      } else {
        // Create new note
        this.logger.debug('Creating new identity note');
        const noteData = this.convertIdentityDataToNote(validData);
        const id = await this.noteStorageAdapter.create({
          id: this.noteId,
          ...noteData,
          createdAt: new Date(),
        });
        
        this.logger.debug('Created new identity data in notes', { id });
        return !!id;
      }
    } catch (error) {
      this.logger.error('Error saving identity data as note', error);
      return false;
    }
  }
  
  /**
   * Convert a note to identity data format
   * @param note The note to convert
   * @returns The identity data
   */
  convertNoteToIdentityData(note: Note): WebsiteIdentityData | null {
    try {
      // Parse JSON content to get identity data
      const rawData = JSON.parse(note.content) as Record<string, unknown>;
      
      // Validate parsed data with schema
      const identityData = WebsiteIdentitySchema.parse(rawData);
      
      this.logger.debug('Successfully converted note to identity data');
      return identityData;
    } catch (error) {
      this.logger.error('Error converting note to identity data', error);
      return null;
    }
  }
  
  /**
   * Convert identity data to note format
   * @param data The identity data
   * @returns The note data
   */
  convertIdentityDataToNote(data: WebsiteIdentityData): Partial<Note> {
    return {
      id: this.noteId,
      title: this.noteTitle,
      content: JSON.stringify(data, null, 2),
      tags: ['website', 'identity', 'branding'],
      source: 'user-created', // Use a valid source type
      updatedAt: new Date(),
    };
  }
}