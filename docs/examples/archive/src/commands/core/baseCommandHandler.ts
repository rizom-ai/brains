/**
 * Base command handler
 * Abstract class that all command handlers extend
 * 
 * Derived classes should implement the Component Interface Standardization pattern with:
 * - getInstance(): Returns the singleton instance
 * - resetInstance(): Resets the singleton instance (mainly for testing)
 * - createFresh(): Creates a new instance without affecting the singleton
 */

import type { IBrainProtocol } from '@/protocol/types';
import { Logger } from '@/utils/logger';

import type { CommandInfo, CommandResult } from './commandTypes';

/**
 * Abstract base command handler
 * Provides common functionality for all command handlers
 */
export abstract class BaseCommandHandler {
  /** The IBrainProtocol instance used for command operations */
  protected brainProtocol: IBrainProtocol;
  
  /** Logger instance for this class and its derived classes */
  protected logger = Logger.getInstance();

  /**
   * Constructor for base command handler
   * 
   * @param brainProtocol - The IBrainProtocol instance for this handler
   */
  constructor(brainProtocol: IBrainProtocol) {
    this.brainProtocol = brainProtocol;
  }

  /**
   * Get a list of commands this handler supports
   */
  abstract getCommands(): CommandInfo[];

  /**
   * Check if this handler can process the given command
   */
  abstract canHandle(command: string): boolean;

  /**
   * Execute a command with the given arguments
   */
  abstract execute(command: string, args: string): Promise<CommandResult>;

  /**
   * Format an error response
   * 
   * @param message - The error message to format
   * @returns A CommandResult with error type and message
   */
  protected formatError(message: string): CommandResult {
    this.logger.error(`Command error: ${message}`);
    return { type: 'error', message };
  }

  /**
   * Check if API key is available
   */
  protected requireApiKey(): boolean {
    const configManager = this.brainProtocol.getConfigManager();
    return configManager.hasAnthropicApiKey() || configManager.hasOpenAIApiKey();
  }

  /**
   * Check if there's an active conversation
   */
  protected hasActiveConversation(): boolean {
    return this.brainProtocol.getConversationManager().hasActiveConversation();
  }

  /**
   * Get the API key error message
   */
  protected getApiKeyErrorMessage(): string {
    return 'No Anthropic API key found. Set the ANTHROPIC_API_KEY environment variable to use this feature.';
  }
}