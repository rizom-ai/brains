/**
 * System commands handler
 * Handles system-related commands like help, status, and external sources
 * 
 * Implements the Component Interface Standardization pattern with:
 * - getInstance(): Returns the singleton instance
 * - resetInstance(): Resets the singleton instance (mainly for testing)
 * - createFresh(): Creates a new instance without affecting the singleton
 */

import type { MCPExternalSourceContext, MCPNoteContext } from '@/contexts';
import type { IBrainProtocol } from '@/protocol/types';

import { BaseCommandHandler } from '../core/baseCommandHandler';
import type { CommandInfo, CommandResult } from '../core/commandTypes';

/**
 * Handler for system-related commands
 */
export class SystemCommandHandler extends BaseCommandHandler {
  /** The singleton instance */
  private static instance: SystemCommandHandler | null = null;
  
  /** Note context for accessing note-related functionality */
  private noteContext: MCPNoteContext;
  
  /** External source context for accessing external data sources */
  private externalContext: MCPExternalSourceContext;

  /**
   * Private constructor to enforce the use of getInstance() or createFresh()
   * 
   * @param brainProtocol - The BrainProtocol instance
   */
  constructor(brainProtocol: IBrainProtocol) {
    super(brainProtocol);
    this.noteContext = brainProtocol.getContextManager().getNoteContext();
    this.externalContext = brainProtocol.getContextManager().getExternalSourceContext();
  }
  
  /**
   * Get the singleton instance of SystemCommandHandler
   * 
   * @param brainProtocol - The BrainProtocol instance to use (only used when creating a new instance)
   * @returns The shared SystemCommandHandler instance
   */
  public static getInstance(brainProtocol: IBrainProtocol): SystemCommandHandler {
    if (!SystemCommandHandler.instance) {
      SystemCommandHandler.instance = new SystemCommandHandler(brainProtocol);
    }
    return SystemCommandHandler.instance;
  }
  
  /**
   * Reset the singleton instance (primarily for testing)
   * This clears the instance and any resources it holds
   */
  public static resetInstance(): void {
    SystemCommandHandler.instance = null;
  }
  
  /**
   * Create a fresh instance (primarily for testing)
   * This creates a new instance without affecting the singleton
   * 
   * @param brainProtocol - The BrainProtocol instance to use
   * @returns A new SystemCommandHandler instance
   */
  public static createFresh(brainProtocol: IBrainProtocol): SystemCommandHandler {
    return new SystemCommandHandler(brainProtocol);
  }

  /**
   * Get supported commands
   */
  getCommands(): CommandInfo[] {
    return [
      {
        command: 'help',
        description: 'Show available commands',
        usage: 'help',
      },
      {
        command: 'external',
        description: 'Enable or disable external knowledge sources',
        usage: 'external <on|off>',
        examples: ['external on', 'external off'],
      },
      {
        command: 'status',
        description: 'Check system status including external sources',
        usage: 'status',
        examples: ['status'],
      },
    ];
  }

  /**
   * Check if this handler can process the command
   */
  canHandle(command: string): boolean {
    return ['help', 'external', 'status'].includes(command);
  }

  /**
   * Execute a command
   */
  async execute(command: string, args: string): Promise<CommandResult> {
    switch (command) {
    case 'help':
      // The help command is typically handled at a higher level
      // by displaying all registered commands
      return { type: 'error', message: 'Help command should be handled by the main command handler' };
    case 'external':
      return await this.handleExternal(args);
    case 'status':
      return await this.handleStatus();
    default:
      return this.formatError(`Unknown command: ${command}`);
    }
  }

  /**
   * Handle external command - toggle external sources
   */
  private async handleExternal(args: string): Promise<CommandResult> {
    const arg = args.trim().toLowerCase();

    if (arg === 'on' || arg === 'enable') {
      this.brainProtocol.getFeatureCoordinator().setExternalSourcesEnabled(true);
      return {
        type: 'external',
        enabled: true,
        message: 'External knowledge sources have been enabled.',
      };
    } else if (arg === 'off' || arg === 'disable') {
      this.brainProtocol.getFeatureCoordinator().setExternalSourcesEnabled(false);
      return {
        type: 'external',
        enabled: false,
        message: 'External knowledge sources have been disabled.',
      };
    } else {
      return {
        type: 'error',
        message: 'Usage: external <on|off> - Enable or disable external knowledge sources',
      };
    }
  }

  /**
   * Handle status command - check system status
   */
  private async handleStatus(): Promise<CommandResult> {
    // Check API connection using ConfigManager methods
    const configManager = this.brainProtocol.getConfigManager();
    const apiConnected = configManager.hasAnthropicApiKey() || configManager.hasOpenAIApiKey();

    // Check database connection with a single operation
    let dbConnected = false;
    let noteCount = 0;

    try {
      // Get recent notes - this operation will tell us both if DB is connected
      // and how many notes exist (length of returned array)
      const notes = await this.noteContext.searchNotes({ limit: 1 });
      dbConnected = true;

      // If we were able to get notes, we can also get the total count
      try {
        noteCount = await this.noteContext.getNoteCount();
      } catch (countError) {
        // If count fails but we got notes, use the notes array length as fallback
        noteCount = notes.length;
        this.logger.error(`Error getting note count, using fallback: ${countError}`);
      }
    } catch (error) {
      this.logger.error(`Error checking database connection: ${error}`);
      dbConnected = false;
    }

    // Check external sources with error handling
    let externalSources = {};
    try {
      externalSources = await this.externalContext.checkSourcesAvailability();
    } catch (error) {
      this.logger.error(`Error checking external sources: ${error}`);
      // Failed to check external sources, continue with empty object
    }

    const externalSourcesEnabled = this.brainProtocol.getFeatureCoordinator().areExternalSourcesEnabled();

    return {
      type: 'status',
      status: {
        apiConnected,
        dbConnected,
        noteCount,
        externalSources,
        externalSourcesEnabled,
      },
    };
  }
}