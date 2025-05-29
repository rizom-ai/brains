/**
 * Profile commands handler
 * Handles profile-related commands
 */

import type { MCPProfileContext } from '@/contexts';
import type { IBrainProtocol } from '@/protocol/types';

import { BaseCommandHandler } from '../core/baseCommandHandler';
import type { CommandInfo, CommandResult } from '../core/commandTypes';

/**
 * Handler for profile-related commands
 */
export class ProfileCommandHandler extends BaseCommandHandler {
  private profileContext: MCPProfileContext;

  constructor(brainProtocol: IBrainProtocol) {
    super(brainProtocol);
    // Get the ProfileContext from the brain protocol
    this.profileContext = brainProtocol.getContextManager().getProfileContext();
  }

  /**
   * Get supported commands
   */
  getCommands(): CommandInfo[] {
    return [
      {
        command: 'profile',
        description: 'View your profile information',
        usage: 'profile',
        examples: ['profile'],
      },
    ];
  }

  /**
   * Check if this handler can process the command
   */
  canHandle(command: string): boolean {
    return command === 'profile';
  }

  /**
   * Execute a command
   */
  async execute(command: string, args: string): Promise<CommandResult> {
    if (command === 'profile') {
      return await this.handleProfile(args);
    }
    return this.formatError(`Unknown command: ${command}`);
  }

  /**
   * Handle profile command
   */
  private async handleProfile(_args: string): Promise<CommandResult> {
    const profile = await this.profileContext.getProfile();

    if (!profile) {
      return this.formatError('No profile found. Use "bun run src/import.ts profile <path/to/profile.yaml>" to import a profile.');
    }

    // Simply return the profile information
    return {
      type: 'profile',
      profile,
    };
  }

  // convertToNote method removed - no longer needed with simplified profile commands
}