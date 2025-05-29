/**
 * Command system entry point
 * Exports the main command handler and types,
 * and initializes the command system with handlers
 */

import type { IBrainProtocol } from '@/protocol/types';
import { RendererRegistry } from '@/utils/registry/rendererRegistry';

import { CommandHandler } from './core/commandHandler';
import { ConversationCommandHandler } from './handlers/conversationCommands';
import { NoteCommandHandler } from './handlers/noteCommands';
import { ProfileCommandHandler } from './handlers/profileCommands';
import { SystemCommandHandler } from './handlers/systemCommands';
import { TagCommandHandler } from './handlers/tagCommands';
import { WebsiteCommandHandler } from './handlers/websiteCommands';

// Re-export types
export { type CommandInfo, type CommandResult } from './core/commandTypes';
// Re-export the command handler class
export { CommandHandler } from './core/commandHandler';

/**
 * Factory function to create and initialize a command handler
 */
export function createCommandHandler(brainProtocol: IBrainProtocol): CommandHandler {
  const commandHandler = new CommandHandler(brainProtocol);
  
  // Register all handlers
  commandHandler.registerHandler(new NoteCommandHandler(brainProtocol));
  commandHandler.registerHandler(new TagCommandHandler(brainProtocol));
  commandHandler.registerHandler(new ProfileCommandHandler(brainProtocol));
  commandHandler.registerHandler(new SystemCommandHandler(brainProtocol));
  commandHandler.registerHandler(new ConversationCommandHandler(brainProtocol));
  commandHandler.registerHandler(
    WebsiteCommandHandler.createFresh(brainProtocol, RendererRegistry.getInstance()),
  );
  
  return commandHandler;
}