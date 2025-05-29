/**
 * Command Rules
 * 
 * This module defines rules for routing command messages
 * to appropriate handlers based on command name patterns.
 */

import type { DataRequestMessage } from '../../messaging/messageTypes';
import { DataRequestType } from '../../messaging/messageTypes';

/**
 * Rule for matching a command message
 */
export interface CommandRule {
  /** Name of the rule for identification */
  name: string;
  /** Command name to match exactly */
  commandName: string;
  /** Priority of this rule (higher number = higher priority) */
  priority: number;
  /** Target handler/component to route to */
  target: string;
  /** Optional metadata for the rule */
  metadata?: Record<string, unknown>;
}

/**
 * Test if a command matches a rule
 * 
 * @param command Command message to test
 * @param rule Rule to test against
 * @returns Whether the command matches the rule
 */
export function matchesCommandRule(command: DataRequestMessage, rule: CommandRule): boolean {
  // Only match COMMAND_EXECUTE data requests
  if (command.dataType !== DataRequestType.COMMAND_EXECUTE) {
    return false;
  }
  
  const commandName = command.parameters && command.parameters['command'] as string;
  return commandName === rule.commandName;
}

/**
 * Command groups for categorization
 */
export enum CommandGroup {
  /** Note management commands */
  NOTES = 'notes',
  /** Profile management commands */
  PROFILE = 'profile',
  /** Conversation management commands */
  CONVERSATION = 'conversation',
  /** System management commands */
  SYSTEM = 'system',
  /** Website management commands */
  WEBSITE = 'website',
}

/**
 * Standard command rules
 */
export const StandardCommandRules: CommandRule[] = [
  // Note commands
  {
    name: 'create-note',
    commandName: 'create-note',
    priority: 100,
    target: 'note-service',
    metadata: { group: CommandGroup.NOTES },
  },
  {
    name: 'update-note',
    commandName: 'update-note',
    priority: 100,
    target: 'note-service',
    metadata: { group: CommandGroup.NOTES },
  },
  {
    name: 'delete-note',
    commandName: 'delete-note',
    priority: 100,
    target: 'note-service',
    metadata: { group: CommandGroup.NOTES },
  },
  {
    name: 'search-notes',
    commandName: 'search-notes',
    priority: 100,
    target: 'note-service',
    metadata: { group: CommandGroup.NOTES },
  },
  
  // Profile commands
  {
    name: 'update-profile',
    commandName: 'update-profile',
    priority: 100,
    target: 'profile-service',
    metadata: { group: CommandGroup.PROFILE },
  },
  {
    name: 'get-profile',
    commandName: 'get-profile',
    priority: 100,
    target: 'profile-service',
    metadata: { group: CommandGroup.PROFILE },
  },
  
  // Conversation commands
  {
    name: 'save-conversation',
    commandName: 'save-conversation',
    priority: 100,
    target: 'conversation-service',
    metadata: { group: CommandGroup.CONVERSATION },
  },
  {
    name: 'clear-conversation',
    commandName: 'clear-conversation',
    priority: 100,
    target: 'conversation-service',
    metadata: { group: CommandGroup.CONVERSATION },
  },
  
  // System commands
  {
    name: 'set-feature',
    commandName: 'set-feature',
    priority: 110, // Higher priority for system commands
    target: 'system-service',
    metadata: { group: CommandGroup.SYSTEM },
  },
  {
    name: 'get-status',
    commandName: 'get-status',
    priority: 110,
    target: 'system-service',
    metadata: { group: CommandGroup.SYSTEM },
  },
  
  // Website commands
  {
    name: 'generate-website',
    commandName: 'generate-website',
    priority: 100,
    target: 'website-service',
    metadata: { group: CommandGroup.WEBSITE },
  },
  {
    name: 'deploy-website',
    commandName: 'deploy-website',
    priority: 100,
    target: 'website-service',
    metadata: { group: CommandGroup.WEBSITE },
  },
];
