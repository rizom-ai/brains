/**
 * CLI Adapter
 * 
 * This adapter translates between CLI interface requests/responses
 * and internal protocol messages.
 */

import { v4 as uuidv4 } from 'uuid';

import type { DataRequestMessage, DataResponseMessage } from '../messaging/messageTypes';
import { DataRequestType } from '../messaging/messageTypes';

import type { BasicExternalRequest, BasicExternalResponse, ProtocolAdapter } from './protocolAdapter';

/**
 * CLI-specific request interface
 */
export interface CliRequest extends BasicExternalRequest {
  isCommand: boolean;
  commandName?: string;
  commandArgs?: Record<string, unknown>;
}

/**
 * CLI-specific response interface
 */
export interface CliResponse extends BasicExternalResponse {
  success: boolean;
  formattedOutput?: string;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Adapter for CLI interface to protocol communication
 */
export class CliAdapter implements ProtocolAdapter<CliRequest, CliResponse> {
  private static instance: CliAdapter | null = null;
  
  /**
   * Get the singleton instance of CliAdapter
   * 
   * @returns The singleton instance
   */
  public static getInstance(): CliAdapter {
    if (!CliAdapter.instance) {
      CliAdapter.instance = new CliAdapter();
    }
    return CliAdapter.instance;
  }
  
  /**
   * Reset the singleton instance
   * This is primarily used for testing
   */
  public static resetInstance(): void {
    CliAdapter.instance = null;
  }
  
  /**
   * Create a fresh instance without affecting the singleton
   * 
   * @returns A new instance
   */
  public static createFresh(): CliAdapter {
    return new CliAdapter();
  }
  
  /**
   * Private constructor to enforce getInstance() usage
   */
  private constructor() {
    // Initialization if needed
  }
  
  /**
   * Convert a CLI request to a protocol message
   * 
   * @param request CLI request
   * @returns Protocol message as a DataRequestMessage
   */
  toProtocolMessage(request: CliRequest): DataRequestMessage {
    const now = new Date();
    const id = uuidv4();
    
    // Common message properties
    const baseMessage = {
      id,
      timestamp: now,
      type: 'data-request',
      source: 'cli',
      sourceContext: 'cli-interface',
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
          args: request.commandArgs || {},
          metadata: request.metadata || {},
          userId: request.userId || 'cli-user',
        },
      };
    } else {
      // Create a query request message
      return {
        ...baseMessage,
        dataType: DataRequestType.QUERY_PROCESS,
        parameters: {
          query: request.text,
          userId: request.userId || 'cli-user',
          metadata: request.metadata || {},
        },
      };
    }
  }
  
  /**
   * Convert a protocol response message to a CLI response
   * 
   * @param response Protocol response message
   * @returns CLI response
   */
  fromProtocolResponse(response: DataResponseMessage): CliResponse {
    const cliResponse: CliResponse = {
      text: '',
      success: response.status === 'success',
      metadata: response.data && response.data['metadata'] ? response.data['metadata'] as Record<string, unknown> : {},
    };
    
    // Handle error responses
    if (response.status === 'error' && response.error) {
      cliResponse.error = {
        code: response.error.code,
        message: response.error.message,
      };
      cliResponse.text = `Error: ${response.error.message}`;
    } else {
      // Handle successful responses
      if (response.data && response.data['text']) {
        cliResponse.text = response.data['text'] as string;
      } else if (response.data && response.data['answer']) {
        cliResponse.text = response.data['answer'] as string;
      }
      
      // Add formatted output if available
      if (response.data && response.data['formattedOutput']) {
        cliResponse.formattedOutput = response.data['formattedOutput'] as string;
      }
    }
    
    return cliResponse;
  }
}