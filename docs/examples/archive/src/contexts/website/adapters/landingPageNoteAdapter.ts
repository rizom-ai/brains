/**
 * LandingPageNoteAdapter
 * 
 * Specialized adapter for converting between landing page data and note format
 * Allows the website context to store landing page data as a special kind of note
 * 
 * Implements the Component Interface Standardization pattern with:
 * - getInstance(): Returns the singleton instance
 * - resetInstance(): Resets the singleton instance (mainly for testing)
 * - createFresh(): Creates a new instance without affecting the singleton
 */

import type { NoteStorageAdapter } from '@/contexts/notes/noteStorageAdapter';
import type { LandingPageData } from '@/contexts/website/websiteStorage';
import type { Note } from '@/models/note';
import { ServiceRegistry } from '@/services/serviceRegistry';
import { Logger } from '@/utils/logger';

// Consistent ID for the landing page note
const LANDING_PAGE_NOTE_ID = 'website-landing-page';

/**
 * Configuration options for LandingPageNoteAdapter
 */
export interface LandingPageNoteAdapterConfig {
  /** Optional note ID to use (defaults to 'website-landing-page') */
  noteId?: string;
  /** Optional note title to use (defaults to 'Website Landing Page Data') */
  noteTitle?: string;
}

/**
 * Dependencies for LandingPageNoteAdapter
 */
export interface LandingPageNoteAdapterDependencies {
  /** Note storage adapter for persistence */
  noteStorageAdapter: NoteStorageAdapter;
  /** Logger instance */
  logger?: Logger;
}

/**
 * Adapter for storing landing page data as a note
 * Provides conversion between landing page data format and note format
 */
export class LandingPageNoteAdapter {
  /** The singleton instance */
  private static instance: LandingPageNoteAdapter | null = null;
  
  /** Logger instance */
  private readonly logger: Logger;
  
  /** Note storage adapter for accessing notes */
  private readonly noteStorageAdapter: NoteStorageAdapter;
  
  /** Note ID for the landing page data */
  private readonly noteId: string;
  
  /** Note title for the landing page data */
  private readonly noteTitle: string;
  
  /**
   * Create a new LandingPageNoteAdapter
   * @param noteStorageAdapter The note storage adapter to use
   * @param config Configuration options
   */
  constructor(
    noteStorageAdapter: NoteStorageAdapter,
    config: LandingPageNoteAdapterConfig = {},
  ) {
    this.noteStorageAdapter = noteStorageAdapter;
    this.logger = Logger.getInstance();
    this.noteId = config.noteId || LANDING_PAGE_NOTE_ID;
    this.noteTitle = config.noteTitle || 'Website Landing Page Data';
  }
  
  /**
   * Get the singleton instance of LandingPageNoteAdapter
   * @param config Configuration options
   * @returns The shared LandingPageNoteAdapter instance
   */
  public static getInstance(config: LandingPageNoteAdapterConfig = {}): LandingPageNoteAdapter {
    if (!LandingPageNoteAdapter.instance) {
      // Get dependencies from service registry
      const serviceRegistry = ServiceRegistry.getInstance();
      const noteStorageAdapter = serviceRegistry.resolve<NoteStorageAdapter>('noteStorageAdapter');
      
      LandingPageNoteAdapter.instance = new LandingPageNoteAdapter(noteStorageAdapter, config);
    }
    return LandingPageNoteAdapter.instance;
  }
  
  /**
   * Reset the singleton instance (primarily for testing)
   * This clears the instance and any resources it holds
   */
  public static resetInstance(): void {
    LandingPageNoteAdapter.instance = null;
  }
  
  /**
   * Create a fresh instance (primarily for testing)
   * This creates a new instance without affecting the singleton
   * @param config Configuration options
   * @param dependencies Injectable dependencies
   * @returns A new LandingPageNoteAdapter instance
   */
  public static createFresh(
    config: LandingPageNoteAdapterConfig = {},
    dependencies: LandingPageNoteAdapterDependencies,
  ): LandingPageNoteAdapter {
    if (!dependencies || !dependencies.noteStorageAdapter) {
      throw new Error('NoteStorageAdapter is required for LandingPageNoteAdapter.createFresh()');
    }
    
    return new LandingPageNoteAdapter(
      dependencies.noteStorageAdapter,
      config,
    );
  }
  
  /**
   * Get landing page data from the note store
   * @returns The landing page data or null if not found
   */
  async getLandingPageData(): Promise<LandingPageData | null> {
    try {
      // Read the note using the configured ID
      const note = await this.noteStorageAdapter.read(this.noteId);
      
      if (!note) {
        this.logger.debug('No landing page data found in notes');
        return null;
      }
      
      // Parse the JSON content
      try {
        // Convert note to landing page data format
        return this.convertNoteToLandingPageData(note);
      } catch (parseError) {
        this.logger.error('Error parsing landing page data from note content', parseError);
        return null;
      }
    } catch (error) {
      this.logger.error('Error retrieving landing page data from notes', error);
      return null;
    }
  }
  
  /**
   * Save landing page data as a note
   * @param data The landing page data to save
   * @returns True if save was successful
   */
  async saveLandingPageData(data: LandingPageData): Promise<boolean> {
    try {
      // Check if note exists first
      const existingNote = await this.noteStorageAdapter.read(this.noteId);
      
      if (existingNote) {
        // Update existing note
        this.logger.debug('Updating existing landing page note');
        const noteData = this.convertLandingPageDataToNote(data);
        const updated = await this.noteStorageAdapter.update(this.noteId, noteData);
        
        this.logger.debug('Updated landing page data in notes', { success: updated });
        return updated;
      } else {
        // Create new note
        this.logger.debug('Creating new landing page note');
        const noteData = this.convertLandingPageDataToNote(data);
        const id = await this.noteStorageAdapter.create({
          id: this.noteId,
          ...noteData,
          createdAt: new Date(),
        });
        
        this.logger.debug('Created new landing page data in notes', { id });
        return !!id;
      }
    } catch (error) {
      this.logger.error('Error saving landing page data as note', error);
      return false;
    }
  }
  
  /**
   * Convert a note to landing page data format
   * @param note The note to convert
   * @returns The landing page data
   */
  convertNoteToLandingPageData(note: Note): LandingPageData | null {
    try {
      // Parse JSON content to get landing page data
      const data = JSON.parse(note.content) as LandingPageData;
      this.logger.debug('Successfully converted note to landing page data');
      return data;
    } catch (error) {
      this.logger.error('Error converting note to landing page data', error);
      return null;
    }
  }
  
  /**
   * Convert landing page data to note format
   * @param data The landing page data
   * @returns The note data
   */
  convertLandingPageDataToNote(data: LandingPageData): Partial<Note> {
    return {
      id: this.noteId,
      title: this.noteTitle,
      content: JSON.stringify(data, null, 2),
      tags: ['website', 'landing-page'],
      source: 'landing-page', // Use our new source type
      updatedAt: new Date(),
    };
  }
}