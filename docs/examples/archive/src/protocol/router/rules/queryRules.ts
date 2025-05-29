/**
 * Query Rules
 * 
 * This module defines rules for routing query messages
 * to appropriate handlers based on content patterns.
 */

import type { DataRequestMessage } from '../../messaging/messageTypes';
import { DataRequestType } from '../../messaging/messageTypes';

/**
 * Rule for matching a query message
 */
export interface QueryRule {
  /** Name of the rule for identification */
  name: string;
  /** Regular expression pattern to match against query content */
  pattern: RegExp;
  /** Priority of this rule (higher number = higher priority) */
  priority: number;
  /** Target handler/component to route to */
  target: string;
  /** Optional metadata for the rule */
  metadata?: Record<string, unknown>;
}

/**
 * Test if a query matches a rule
 * 
 * @param query Query message to test
 * @param rule Rule to test against
 * @returns Whether the query matches the rule
 */
export function matchesQueryRule(query: DataRequestMessage, rule: QueryRule): boolean {
  // Only match QUERY_PROCESS data requests
  if (query.dataType !== DataRequestType.QUERY_PROCESS) {
    return false;
  }
  
  const queryText = query.parameters && query.parameters['query'] as string;
  return queryText ? rule.pattern.test(queryText) : false;
}

/**
 * Common query patterns
 */
export const CommonQueryPatterns = {
  // Profile-related queries
  PROFILE: /\b(my|profile|my profile|about me|who am I|personal info)\b/i,
  
  // Note-related queries
  NOTES: /\b(notes?|find notes?|search notes?|my notes?)\b/i,
  
  // Conversation-related queries
  CONVERSATION: /\b(conversation|chat|current conversation|chat history)\b/i,
  
  // Help queries
  HELP: /\b(help|how to|how do I|what can you do|instructions)\b/i,
  
  // Website-related queries
  WEBSITE: /\b(website|my website|generate website|deploy website)\b/i,
};

/**
 * Standard query rules
 */
export const StandardQueryRules: QueryRule[] = [
  {
    name: 'profile-query',
    pattern: CommonQueryPatterns.PROFILE,
    priority: 100,
    target: 'profile-service',
  },
  {
    name: 'notes-query',
    pattern: CommonQueryPatterns.NOTES,
    priority: 90,
    target: 'note-service',
  },
  {
    name: 'conversation-query',
    pattern: CommonQueryPatterns.CONVERSATION,
    priority: 80,
    target: 'conversation-service',
  },
  {
    name: 'help-query',
    pattern: CommonQueryPatterns.HELP,
    priority: 110, // Higher priority for help
    target: 'help-service',
  },
  {
    name: 'website-query',
    pattern: CommonQueryPatterns.WEBSITE,
    priority: 95,
    target: 'website-service',
  },
];
