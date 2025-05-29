/**
 * Note commands handler
 * Handles note-related commands
 * 
 * Implements the Component Interface Standardization pattern with:
 * - getInstance(): Returns the singleton instance
 * - resetInstance(): Resets the singleton instance (mainly for testing)
 * - createFresh(): Creates a new instance without affecting the singleton
 */

import type { MCPNoteContext } from '@/contexts';
import type { IBrainProtocol } from '@/protocol/types';

import { BaseCommandHandler } from '../core/baseCommandHandler';
import type { CommandInfo, CommandResult } from '../core/commandTypes';

/**
 * Handler for note-related commands
 */
export class NoteCommandHandler extends BaseCommandHandler {
  /** The singleton instance */
  private static instance: NoteCommandHandler | null = null;
  
  /** Note context for accessing note-related functionality */
  private noteContext: MCPNoteContext;

  /**
   * Private constructor to enforce the use of getInstance() or createFresh()
   * 
   * @param brainProtocol - The BrainProtocol instance
   */
  constructor(brainProtocol: IBrainProtocol) {
    super(brainProtocol);
    this.noteContext = brainProtocol.getContextManager().getNoteContext();
  }
  
  /**
   * Get the singleton instance of NoteCommandHandler
   * 
   * @param brainProtocol - The BrainProtocol instance to use (only used when creating a new instance)
   * @returns The shared NoteCommandHandler instance
   */
  public static getInstance(brainProtocol: IBrainProtocol): NoteCommandHandler {
    if (!NoteCommandHandler.instance) {
      NoteCommandHandler.instance = new NoteCommandHandler(brainProtocol);
    }
    return NoteCommandHandler.instance;
  }
  
  /**
   * Reset the singleton instance (primarily for testing)
   * This clears the instance and any resources it holds
   */
  public static resetInstance(): void {
    NoteCommandHandler.instance = null;
  }
  
  /**
   * Create a fresh instance (primarily for testing)
   * This creates a new instance without affecting the singleton
   * 
   * @param brainProtocol - The BrainProtocol instance to use
   * @returns A new NoteCommandHandler instance
   */
  public static createFresh(brainProtocol: IBrainProtocol): NoteCommandHandler {
    return new NoteCommandHandler(brainProtocol);
  }

  /**
   * Get supported commands
   */
  getCommands(): CommandInfo[] {
    return [
      {
        command: 'note',
        description: 'Show a specific note by ID',
        usage: 'note <id>',
        examples: ['note abc123'],
      },
      {
        command: 'list',
        description: 'List all notes or notes with a specific tag',
        usage: 'list [tag]',
        examples: ['list', 'list ecosystem'],
      },
      {
        command: 'search',
        description: 'Search for notes',
        usage: 'search <query>',
        examples: ['search ecosystem', 'search "personal knowledge"'],
      },
    ];
  }

  /**
   * Check if this handler can process the command
   */
  canHandle(command: string): boolean {
    return ['note', 'list', 'search'].includes(command);
  }

  /**
   * Execute a command
   */
  async execute(command: string, args: string): Promise<CommandResult> {
    switch (command) {
    case 'note':
      return await this.handleNote(args);
    case 'list':
      return await this.handleList(args);
    case 'search':
      return await this.handleSearch(args);
    default:
      return this.formatError(`Unknown command: ${command}`);
    }
  }

  /**
   * Handle note command
   */
  private async handleNote(noteId: string): Promise<CommandResult> {
    if (!noteId) {
      return this.formatError('Please provide a note ID');
    }

    const note = await this.noteContext.getNoteById(noteId);

    if (!note) {
      return this.formatError(`Note with ID ${noteId} not found`);
    }

    return { type: 'note', note };
  }

  /**
   * Handle list command
   */
  private async handleList(tagFilter?: string): Promise<CommandResult> {
    let notes;
    let title;

    if (tagFilter) {
      notes = await this.noteContext.searchNotes({ tags: [tagFilter], limit: 10 });
      title = `Notes with tag: ${tagFilter}`;

      if (notes.length === 0) {
        return this.formatError(`No notes found with tag: ${tagFilter}`);
      }
    } else {
      notes = await this.noteContext.searchNotes({ limit: 10 });
      title = 'Recent Notes';

      if (notes.length === 0) {
        return this.formatError('No notes found in the system');
      }
    }

    return { type: 'notes', notes, title };
  }

  /**
   * Handle search command
   */
  private async handleSearch(query: string): Promise<CommandResult> {
    if (!query) {
      return this.formatError('Please provide a search query');
    }

    this.logger.info(`Searching for notes with query: ${query}`);
    const notes = await this.noteContext.searchNotes({ query, limit: 10 });
    return { type: 'search', query, notes };
  }
}