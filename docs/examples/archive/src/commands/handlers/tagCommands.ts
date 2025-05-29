/**
 * Tag commands handler
 * Handles tag-related commands
 */

import type { MCPNoteContext } from '@/contexts';
import type { IBrainProtocol } from '@/protocol/types';

import { BaseCommandHandler } from '../core/baseCommandHandler';
import type { CommandInfo, CommandResult } from '../core/commandTypes';

/**
 * Handler for tag-related commands
 */
export class TagCommandHandler extends BaseCommandHandler {
  private noteContext: MCPNoteContext;

  constructor(brainProtocol: IBrainProtocol) {
    super(brainProtocol);
    this.noteContext = brainProtocol.getContextManager().getNoteContext();
  }

  /**
   * Get supported commands
   */
  getCommands(): CommandInfo[] {
    return [
      {
        command: 'tags',
        description: 'List all tags in the system',
        usage: 'tags',
      },
    ];
  }

  /**
   * Check if this handler can process the command
   */
  canHandle(command: string): boolean {
    return command === 'tags';
  }

  /**
   * Execute a command
   */
  async execute(command: string): Promise<CommandResult> {
    if (command === 'tags') {
      return await this.handleTags();
    }
    return this.formatError(`Unknown command: ${command}`);
  }

  /**
   * Handle tags command
   */
  private async handleTags(): Promise<CommandResult> {
    // Get all notes
    const allNotes = await this.noteContext.searchNotes({ limit: 1000 });

    // Extract and count all tags
    const tagCounts: { [tag: string]: number } = {};

    allNotes.forEach(note => {
      if (note.tags && Array.isArray(note.tags)) {
        note.tags.forEach(tag => {
          if (typeof tag === 'string') {
            tagCounts[tag] = (tagCounts[tag] || 0) + 1;
          }
        });
      }
    });

    // Sort tags by count
    const sortedTags = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([tag, count]) => ({ tag, count }));

    if (sortedTags.length === 0) {
      return this.formatError('No tags found in the system');
    }

    return { type: 'tags', tags: sortedTags };
  }
}