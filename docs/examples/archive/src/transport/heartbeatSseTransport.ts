/**
 * Custom SSE transport with heartbeat functionality
 * 
 * Extends the standard SSEServerTransport to add heartbeat support
 * and better connection management for Express applications.
 * 
 * Implements the Component Interface Standardization pattern with:
 * - getInstance(): Returns the singleton instance
 * - resetInstance(): Resets the singleton instance (mainly for testing)
 * - createFresh(): Creates a new instance without affecting the singleton
 */

import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import type { Response } from 'express';

import { Logger } from '@utils/logger';

// Interface for ExpressResponse to make TypeScript happy with our cast
interface ExpressResponse extends Response {
  flush?: () => void;
  writableEnded: boolean;
}

/**
 * Configuration options for HeartbeatSSETransport
 */
export interface HeartbeatSSETransportConfig {
  /** The endpoint where messages should be POSTed */
  messagesEndpoint: string;
  /** The Express response object */
  res: Response;
  /** The interval between heartbeats in milliseconds (default: 30000) */
  heartbeatIntervalMs?: number;
}

/**
 * Extends the standard SSEServerTransport to add heartbeat support
 * and better connection management for Express
 */
export class HeartbeatSSETransport extends SSEServerTransport {
  /**
   * Singleton instance of HeartbeatSSETransport
   * This property should be accessed only by getInstance(), resetInstance(), and createFresh()
   */
  private static instance: HeartbeatSSETransport | null = null;
  
  /**
   * Logger instance for this class
   */
  private logger = Logger.getInstance();
  
  /**
   * Interval ID for the heartbeat timer
   */
  private heartbeatInterval: ReturnType<typeof globalThis.setInterval> | null = null;

  /**
   * Get the singleton instance of HeartbeatSSETransport
   * 
   * Part of the Component Interface Standardization pattern.
   * 
   * @param config Configuration options (only used when creating a new instance)
   * @returns The singleton instance
   */
  public static getInstance(config: HeartbeatSSETransportConfig): HeartbeatSSETransport {
    if (!HeartbeatSSETransport.instance) {
      HeartbeatSSETransport.instance = new HeartbeatSSETransport(
        config.messagesEndpoint,
        config.res,
        config.heartbeatIntervalMs,
      );
      
      const logger = Logger.getInstance();
      logger.debug('HeartbeatSSETransport singleton instance created');
    } else if (config) {
      // Log a warning if trying to get instance with different config
      const logger = Logger.getInstance();
      logger.warn('getInstance called with config but instance already exists. Config ignored');
    }
    
    return HeartbeatSSETransport.instance;
  }

  /**
   * Reset the singleton instance
   * 
   * Part of the Component Interface Standardization pattern.
   * Primarily used for testing to ensure a clean state.
   */
  public static resetInstance(): void {
    const logger = Logger.getInstance();
    
    try {
      // Clean up resources if needed
      if (HeartbeatSSETransport.instance) {
        // Ensure we clean up any interval
        HeartbeatSSETransport.instance.close().catch(err => {
          logger.error('Error closing HeartbeatSSETransport instance during reset:', err);
        });
      }
    } catch (error) {
      logger.error('Error during HeartbeatSSETransport instance reset:', error);
    } finally {
      HeartbeatSSETransport.instance = null;
      logger.debug('HeartbeatSSETransport singleton instance reset');
    }
  }

  /**
   * Create a fresh instance without affecting the singleton
   * 
   * Part of the Component Interface Standardization pattern.
   * Primarily used for testing to create isolated instances.
   * 
   * @param config Configuration options
   * @returns A new HeartbeatSSETransport instance
   */
  public static createFresh(config: HeartbeatSSETransportConfig): HeartbeatSSETransport {
    const logger = Logger.getInstance();
    logger.debug('Creating fresh HeartbeatSSETransport instance');
    
    return new HeartbeatSSETransport(
      config.messagesEndpoint,
      config.res,
      config.heartbeatIntervalMs,
    );
  }

  /**
   * Private constructor to enforce factory method usage
   * 
   * Part of the Component Interface Standardization pattern.
   * Users should call getInstance() or createFresh() instead.
   * 
   * @param messagesEndpoint - The endpoint where messages should be POSTed
   * @param res - The Express response object
   * @param heartbeatIntervalMs - The interval between heartbeats in milliseconds (default: 30000)
   */
  private constructor(
    messagesEndpoint: string, 
    res: Response, 
    heartbeatIntervalMs: number = 30000,
  ) {
    super(messagesEndpoint, res);

    // Setup heartbeat interval
    this.heartbeatInterval = globalThis.setInterval(
      () => this.sendHeartbeat(), 
      heartbeatIntervalMs,
    );

    // Ensure proper cleanup on connection close
    res.on('close', () => {
      if (this.heartbeatInterval) {
        globalThis.clearInterval(this.heartbeatInterval);
      }
    });
  }

  /**
   * Send a heartbeat to keep the connection alive
   */
  sendHeartbeat(): void {
    // Generate a timestamp
    const timestamp = new Date().toISOString();
    
    this.logger.debug(`Sending heartbeat at ${timestamp}`);
    
    // Access the protected res property via private method
    this.sendCustomEvent('message', {
      type: 'heartbeat',
      transportType: 'sse',
      sessionId: this.getSessionId(),
      timestamp,
    });
  }
  
  /**
   * Helper method to access the protected sessionId property
   * This is used for testing and internal use
   */
  getSessionId(): string {
    return this['sessionId'] as string;
  }

  /**
   * Send a custom event with the specified event name and data
   * 
   * @param eventName - The SSE event name
   * @param data - The data to send
   */
  sendCustomEvent(eventName: string, data: unknown): void {
    const expressRes = this['res'] as ExpressResponse;
    if (!expressRes || expressRes.writableEnded) {
      this.logger.debug(`Cannot send event: response is ${!expressRes ? 'undefined' : 'ended'}`);
      return;
    }

    // Use the same format as standard transport but allow custom event name
    expressRes.write(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`);
    
    // Flush the response if possible
    if (typeof expressRes.flush === 'function') {
      expressRes.flush();
    }
    
    this.logger.debug(`Sent ${eventName} event`);
  }

  /**
   * Override close to clean up resources and match the expected return type
   */
  override async close(): Promise<void> {
    this.logger.debug('Closing transport connection and cleaning up resources');
    
    if (this.heartbeatInterval) {
      globalThis.clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    
    await super.close();
  }
}