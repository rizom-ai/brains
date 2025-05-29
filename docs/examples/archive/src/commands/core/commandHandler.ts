/**
 * Main command handler
 * Coordinates all command handlers and delegates commands to the appropriate handler
 * 
 * Implements the Component Interface Standardization pattern with:
 * - getInstance(): Returns the singleton instance
 * - resetInstance(): Resets the singleton instance (mainly for testing)
 * - createFresh(): Creates a new instance without affecting the singleton
 */

import type { IBrainProtocol } from '@/protocol/types';
import { Logger } from '@/utils/logger';

import type { BaseCommandHandler } from './baseCommandHandler';
import type { CommandInfo, CommandResult } from './commandTypes';

/**
 * Main command handler that delegates to specialized handlers
 */
export class CommandHandler {
  /** The singleton instance */
  private static instance: CommandHandler | null = null;

  /** Registered command handlers */
  private handlers: BaseCommandHandler[] = [];

  /** Logger instance for this class */
  private logger = Logger.getInstance();

  /**
   * Private constructor to enforce the use of getInstance() or createFresh()
   * 
   * @param _brainProtocol - The IBrainProtocol instance (not used in this class but required for API consistency)
   */
  constructor(_brainProtocol: IBrainProtocol) {
    // BrainProtocol is not used directly in this class
  }

  /**
   * Get the singleton instance of CommandHandler
   * 
   * @param brainProtocol - The IBrainProtocol instance to use (only used when creating a new instance)
   * @returns The shared CommandHandler instance
   */
  public static getInstance(brainProtocol: IBrainProtocol): CommandHandler {
    if (!CommandHandler.instance) {
      CommandHandler.instance = new CommandHandler(brainProtocol);
    }
    return CommandHandler.instance;
  }

  /**
   * Reset the singleton instance (primarily for testing)
   * This clears the instance and any resources it holds
   */
  public static resetInstance(): void {
    CommandHandler.instance = null;
  }

  /**
   * Create a fresh instance (primarily for testing)
   * This creates a new instance without affecting the singleton
   * 
   * @param brainProtocol - The IBrainProtocol instance to use
   * @returns A new CommandHandler instance
   */
  public static createFresh(brainProtocol: IBrainProtocol): CommandHandler {
    return new CommandHandler(brainProtocol);
  }

  /**
   * Register a command handler
   * 
   * @param handler - The command handler to register
   */
  registerHandler(handler: BaseCommandHandler): void {
    this.handlers.push(handler);
    this.logger.debug(`Registered command handler: ${handler.constructor.name}`);
  }

  /**
   * Get all available commands
   */
  getCommands(): CommandInfo[] {
    return this.handlers.flatMap(handler => handler.getCommands());
  }

  /**
   * Process a command string and delegate to the appropriate handler
   * 
   * @param command - The command to process
   * @param args - The command arguments
   * @returns The command execution result
   */
  async processCommand(command: string, args: string): Promise<CommandResult> {
    try {
      // Find the appropriate handler
      const handler = this.handlers.find(h => h.canHandle(command));

      if (handler) {
        this.logger.debug(`Executing command ${command} with handler ${handler.constructor.name}`);
        return await handler.execute(command, args);
      }

      // No handler found
      this.logger.warn(`No handler found for command: ${command}`);
      return {
        type: 'error',
        message: `Unknown command: ${command}`,
      };
    } catch (error: unknown) {
      this.logger.error(`Error processing command ${command}: ${error instanceof Error ? error.stack : String(error)}`);
      return {
        type: 'error',
        message: `Error executing command: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Special method for handling save-note confirmations
   * 
   * @param conversationId - The conversation ID to save notes from
   * @param title - Optional title for the note
   * @param userEdits - Optional user edits to the note content
   * @returns The command execution result
   */
  async confirmSaveNote(conversationId: string, title?: string, userEdits?: string): Promise<CommandResult> {
    // Find the command handler that manages conversation notes
    const handler = this.handlers.find(h => h.canHandle('save-note'));

    if (!handler || !('confirmSaveNote' in handler)) {
      this.logger.warn('Save note confirmation is not supported - no handler found');
      return {
        type: 'error',
        message: 'Save note confirmation is not supported',
      };
    }

    try {
      // Call the handler's confirmSaveNote method
      // This is a special case for ConversationCommandHandler
      const conversationHandler = handler as { confirmSaveNote: (id: string, title?: string, edits?: string) => Promise<CommandResult> };
      this.logger.debug(`Confirming save note for conversation ${conversationId}`);
      return await conversationHandler.confirmSaveNote(conversationId, title, userEdits);
    } catch (error: unknown) {
      this.logger.error(`Error confirming save note: ${error instanceof Error ? error.stack : String(error)}`);
      return {
        type: 'error',
        message: `Error confirming save note: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}
