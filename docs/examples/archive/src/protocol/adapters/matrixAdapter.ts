/**
 * Matrix Adapter
 * 
 * This adapter translates between Matrix interface requests/responses
 * and internal protocol messages.
 */

import { v4 as uuidv4 } from 'uuid';

import type { DataRequestMessage, DataResponseMessage } from '../messaging/messageTypes';
import { DataRequestType } from '../messaging/messageTypes';

import type { BasicExternalRequest, BasicExternalResponse, ProtocolAdapter } from './protocolAdapter';

/**
 * Matrix-specific request interface
 */
export interface MatrixRequest extends BasicExternalRequest {
  roomId: string;
  sender: string;
  isCommand: boolean;
  commandName?: string;
  commandArgs?: Record<string, unknown>;
  eventId?: string;
}

/**
 * Matrix-specific response interface
 */
export interface MatrixResponse extends BasicExternalResponse {
  formatted?: string;
  markdown?: string;
  html?: string;
  citations?: Array<{
    noteId: string;
    noteTitle: string;
    excerpt: string;
  }>;
  externalSources?: Array<{
    title: string;
    source: string;
    url: string;
    excerpt: string;
  }>;
}

/**
 * Adapter for Matrix interface to protocol communication
 */
export class MatrixAdapter implements ProtocolAdapter<MatrixRequest, MatrixResponse> {
  private static instance: MatrixAdapter | null = null;
  
  /**
   * Get the singleton instance of MatrixAdapter
   * 
   * @returns The singleton instance
   */
  public static getInstance(): MatrixAdapter {
    if (!MatrixAdapter.instance) {
      MatrixAdapter.instance = new MatrixAdapter();
    }
    return MatrixAdapter.instance;
  }
  
  /**
   * Reset the singleton instance
   * This is primarily used for testing
   */
  public static resetInstance(): void {
    MatrixAdapter.instance = null;
  }
  
  /**
   * Create a fresh instance without affecting the singleton
   * 
   * @returns A new instance
   */
  public static createFresh(): MatrixAdapter {
    return new MatrixAdapter();
  }
  
  /**
   * Private constructor to enforce getInstance() usage
   */
  private constructor() {
    // Initialization if needed
  }
  
  /**
   * Convert a Matrix request to a protocol message
   * 
   * @param request Matrix request
   * @returns Protocol message as a DataRequestMessage
   */
  toProtocolMessage(request: MatrixRequest): DataRequestMessage {
    const now = new Date();
    const id = uuidv4();
    
    // Common message properties
    const baseMessage = {
      id,
      timestamp: now,
      type: 'data-request',
      source: 'matrix',
      sourceContext: 'matrix-interface',
      targetContext: 'protocol-core',
      category: 'request' as const,
      timeout: 30000, // Default 30 second timeout
    };
    
    if (request.isCommand && request.commandName) {
      // Create a command request message
      return {
        ...baseMessage,
        dataType: DataRequestType.COMMAND_EXECUTE,
        parameters: {
          command: request.commandName,
          args: {
            ...request.commandArgs,
            roomId: request.roomId,
            sender: request.sender,
            eventId: request.eventId,
          },
          metadata: request.metadata || {},
          userId: request.userId || request.sender,
          roomId: request.roomId,
          eventId: request.eventId,
        },
      };
    } else {
      // Create a query request message
      return {
        ...baseMessage,
        dataType: DataRequestType.QUERY_PROCESS,
        parameters: {
          query: request.text,
          userId: request.userId || request.sender,
          roomId: request.roomId,
          eventId: request.eventId,
          metadata: request.metadata || {},
        },
      };
    }
  }
  
  /**
   * Convert a protocol response message to a Matrix response
   * 
   * @param response Protocol response message
   * @returns Matrix response
   */
  fromProtocolResponse(response: DataResponseMessage): MatrixResponse {
    const matrixResponse: MatrixResponse = {
      text: '',
      metadata: response.data && response.data['metadata'] ? response.data['metadata'] as Record<string, unknown> : {},
    };
    
    // Handle error responses
    if (response.status === 'error' && response.error) {
      matrixResponse.text = `Error: ${response.error.message}`;
    } else {
      // Handle successful responses
      if (response.data && response.data['text']) {
        matrixResponse.text = response.data['text'] as string;
      } else if (response.data && response.data['answer']) {
        matrixResponse.text = response.data['answer'] as string;
      }
      
      // Add formatted outputs if available
      if (response.data && response.data['markdown']) {
        matrixResponse.markdown = response.data['markdown'] as string;
      }
      
      if (response.data && response.data['html']) {
        matrixResponse.html = response.data['html'] as string;
      }
      
      // Add citations if available
      if (response.data && response.data['citations']) {
        matrixResponse.citations = response.data['citations'] as Array<{
          noteId: string;
          noteTitle: string;
          excerpt: string;
        }>;
      }
      
      // Add external sources if available
      if (response.data && response.data['externalSources']) {
        matrixResponse.externalSources = response.data['externalSources'] as Array<{
          title: string;
          source: string;
          url: string;
          excerpt: string;
        }>;
      }
    }
    
    return matrixResponse;
  }
}