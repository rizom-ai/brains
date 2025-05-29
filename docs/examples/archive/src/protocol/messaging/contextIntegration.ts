/**
 * Context Integration Module
 * 
 * This module provides helper functions and utilities for integrating
 * contexts with the messaging system. It includes functions for context
 * communication, common message patterns, and integration with existing code.
 */

import { Logger } from '@/utils/logger';

import { ContextId } from '../core/contextOrchestrator';

import type { ContextMediator } from './contextMediator';
import { MessageFactory } from './messageFactory';
import { DataRequestType } from './messageTypes';

/**
 * Make a data request to a context
 * 
 * @param mediator Context mediator instance
 * @param sourceContext Source context identifier
 * @param targetContext Target context identifier (use ContextId enum)
 * @param dataType Type of data to request (use DataRequestType enum)
 * @param parameters Additional parameters for the request
 * @param timeout Optional timeout in milliseconds
 * @returns Response data or null if request failed
 */
export async function requestContextData<T = Record<string, unknown>>(
  mediator: ContextMediator,
  sourceContext: string,
  targetContext: ContextId,
  dataType: DataRequestType,
  parameters?: Record<string, unknown>,
  timeout?: number,
): Promise<T | null> {
  const logger = Logger.getInstance();
  
  try {
    // Create request message
    const request = MessageFactory.createDataRequest(
      sourceContext,
      targetContext,
      dataType,
      parameters,
      timeout,
    );
    
    logger.debug(`Sending ${dataType} request to ${targetContext}`);
    
    // Send request and wait for response
    const response = await mediator.sendRequest(request);
    
    // Check response status
    if (response.status === 'success' && response.data) {
      return response.data as T;
    } else {
      logger.warn(`Request to ${targetContext} failed: ${response.error?.message || 'Unknown error'}`);
      return null;
    }
  } catch (error) {
    logger.error(`Error requesting data from ${targetContext}:`, error);
    return null;
  }
}

/**
 * Request notes from the Notes context
 * 
 * @param mediator Context mediator instance
 * @param sourceContext Source context identifier
 * @param query Search query string
 * @param limit Maximum number of results to return
 * @returns Array of notes or null if request failed
 */
export async function requestNotes(
  mediator: ContextMediator,
  sourceContext: string,
  query: string,
  limit?: number,
): Promise<Array<{ id: string; title: string; content: string }> | null> {
  const result = await requestContextData<{ notes: Array<{ id: string; title: string; content: string }> }>(
    mediator,
    sourceContext,
    ContextId.NOTES,
    DataRequestType.NOTES_SEARCH,
    { query, limit },
  );
  
  return result?.notes || null;
}

/**
 * Request a specific note by ID
 * 
 * @param mediator Context mediator instance
 * @param sourceContext Source context identifier
 * @param noteId Note ID to fetch
 * @returns Note object or null if not found
 */
export async function requestNoteById(
  mediator: ContextMediator,
  sourceContext: string,
  noteId: string,
): Promise<{ id: string; title: string; content: string } | null> {
  const result = await requestContextData<{ note: { id: string; title: string; content: string } }>(
    mediator,
    sourceContext,
    ContextId.NOTES,
    DataRequestType.NOTE_BY_ID,
    { id: noteId },
  );
  
  return result?.note || null;
}

/**
 * Request profile data
 * 
 * @param mediator Context mediator instance
 * @param sourceContext Source context identifier
 * @returns Profile object or null if not found
 */
export async function requestProfile(
  mediator: ContextMediator,
  sourceContext: string,
): Promise<Record<string, unknown> | null> {
  const result = await requestContextData<{ profile: Record<string, unknown> }>(
    mediator,
    sourceContext,
    ContextId.PROFILE,
    DataRequestType.PROFILE_DATA,
  );
  
  return result?.profile || null;
}

/**
 * Request conversation history
 * 
 * @param mediator Context mediator instance
 * @param sourceContext Source context identifier
 * @param conversationId Optional conversation ID (uses current if not provided)
 * @returns Conversation history text or null if not found
 */
export async function requestConversationHistory(
  mediator: ContextMediator,
  sourceContext: string,
  conversationId?: string,
): Promise<string | null> {
  const result = await requestContextData<{ history: string }>(
    mediator,
    sourceContext,
    ContextId.CONVERSATION,
    DataRequestType.CONVERSATION_HISTORY,
    { conversationId },
  );
  
  return result?.history || null;
}

/**
 * Request external sources data
 * 
 * @param mediator Context mediator instance
 * @param sourceContext Source context identifier
 * @param query Search query string
 * @returns External sources results or null if not found
 */
export async function requestExternalSources(
  mediator: ContextMediator,
  sourceContext: string,
  query: string,
): Promise<Array<{ title: string; source: string; url: string; content: string }> | null> {
  const result = await requestContextData<{ results: Array<{ title: string; source: string; url: string; content: string }> }>(
    mediator,
    sourceContext,
    ContextId.EXTERNAL_SOURCES,
    DataRequestType.EXTERNAL_SOURCES,
    { query },
  );
  
  return result?.results || null;
}

/**
 * Request website deployment status
 * 
 * @param mediator Context mediator instance
 * @param sourceContext Source context identifier
 * @returns Website status object or null if not found
 */
export async function requestWebsiteStatus(
  mediator: ContextMediator,
  sourceContext: string,
): Promise<Record<string, unknown> | null> {
  const result = await requestContextData<{ status: Record<string, unknown> }>(
    mediator,
    sourceContext,
    ContextId.WEBSITE,
    DataRequestType.WEBSITE_STATUS,
  );
  
  return result?.status || null;
}