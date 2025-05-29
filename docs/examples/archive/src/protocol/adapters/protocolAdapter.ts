/**
 * Protocol Adapter Interface
 * 
 * This interface defines the contract for adapters that translate
 * between the internal protocol format and external interfaces.
 */

import type { DataRequestMessage, DataResponseMessage } from '../messaging/messageTypes';

/**
 * Protocol adapter interface for connecting external interfaces to the protocol
 */
export interface ProtocolAdapter<TExternalRequest, TExternalResponse> {
  /**
   * Convert an external request to a protocol message
   * 
   * @param request External request format
   * @returns Protocol message
   */
  toProtocolMessage(request: TExternalRequest): DataRequestMessage;
  
  /**
   * Convert a protocol response message to external response format
   * 
   * @param response Protocol response message
   * @returns External response format
   */
  fromProtocolResponse(response: DataResponseMessage): TExternalResponse;
}

/**
 * Basic external request format
 * This represents a simple text request from an external interface
 */
export interface BasicExternalRequest {
  text: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Basic external response format
 * This represents a simple text response to an external interface
 */
export interface BasicExternalResponse {
  text: string;
  metadata?: Record<string, unknown>;
}