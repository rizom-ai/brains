/**
 * Status Manager
 * 
 * Centralizes monitoring and reporting of system component status.
 * Provides a unified interface for checking if the system and its components
 * are ready to process queries and generating detailed status reports.
 * 
 * Implements the Component Interface Standardization pattern with:
 * - getInstance(): Returns the singleton instance
 * - resetInstance(): Resets the singleton instance (mainly for testing)
 * - createFresh(): Creates a new instance without affecting the singleton
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { Logger } from '@/utils/logger';

import type { ConversationManager } from '../managers/conversationManager';

import type { ContextOrchestrator } from './contextOrchestrator';

/**
 * Configuration options for StatusManager
 */
export interface StatusManagerOptions {
  /** Context orchestrator for accessing context status */
  contextOrchestrator: ContextOrchestrator;
  /** Conversation manager for checking conversation status */
  conversationManager: ConversationManager;
  /** MCP server instance for checking server status */
  mcpServer?: McpServer | null;
  /** Whether external sources are enabled */
  externalSourcesEnabled: boolean;
}

/**
 * Status information for a component
 */
export interface ComponentStatus {
  /** Whether the component is ready */
  ready: boolean;
  /** Additional status details (optional) */
  details?: Record<string, unknown>;
}

/**
 * Complete system status report
 */
export interface SystemStatus {
  /** Overall system readiness */
  ready: boolean;
  /** Component status information */
  components: {
    /** Context status */
    contextOrchestrator: ComponentStatus;
    /** Conversation status */
    conversation: ComponentStatus;
    /** MCP server status */
    mcpServer: ComponentStatus;
    /** External sources status */
    externalSources: ComponentStatus;
    /** Additional components */
    [key: string]: ComponentStatus;
  };
}

/**
 * Manages system status reporting
 */
export class StatusManager {
  private static instance: StatusManager | null = null;
  
  /** Context orchestrator instance */
  private contextOrchestrator: ContextOrchestrator;
  /** Conversation manager instance */
  private conversationManager: ConversationManager;
  /** MCP server instance */
  private mcpServer?: McpServer | null;
  /** Whether external sources are enabled */
  private externalSourcesEnabled: boolean;
  
  /** Logger instance */
  private logger = Logger.getInstance();
  
  /**
   * Get the singleton instance of StatusManager
   * 
   * @param options Configuration options
   * @returns The singleton instance
   */
  public static getInstance(options: StatusManagerOptions): StatusManager {
    if (!StatusManager.instance) {
      StatusManager.instance = new StatusManager(options);
      
      const logger = Logger.getInstance();
      logger.debug('StatusManager singleton instance created');
    }
    
    return StatusManager.instance;
  }
  
  /**
   * Reset the singleton instance
   * This is primarily used for testing to ensure a clean state between tests
   */
  public static resetInstance(): void {
    StatusManager.instance = null;
    
    const logger = Logger.getInstance();
    logger.debug('StatusManager singleton instance reset');
  }
  
  /**
   * Create a fresh instance without affecting the singleton
   * 
   * @param options Configuration options
   * @returns A new instance
   */
  public static createFresh(options: StatusManagerOptions): StatusManager {
    const logger = Logger.getInstance();
    logger.debug('Creating fresh StatusManager instance');
    
    return new StatusManager(options);
  }
  
  /**
   * Private constructor to enforce getInstance() usage
   * 
   * @param options Configuration options
   */
  private constructor(options: StatusManagerOptions) {
    this.contextOrchestrator = options.contextOrchestrator;
    this.conversationManager = options.conversationManager;
    this.mcpServer = options.mcpServer;
    this.externalSourcesEnabled = options.externalSourcesEnabled;
    
    this.logger.debug('StatusManager initialized');
  }
  
  /**
   * Update the MCP server reference
   * @param mcpServer The MCP server instance
   */
  setMcpServer(mcpServer: McpServer): void {
    this.mcpServer = mcpServer;
  }
  
  /**
   * Update external sources enabled status
   * @param enabled Whether external sources are enabled
   */
  setExternalSourcesEnabled(enabled: boolean): void {
    this.externalSourcesEnabled = enabled;
  }
  
  /**
   * Check if the system is ready to process queries
   * @returns Whether the system is ready
   */
  isReady(): boolean {
    const contextsReady = this.contextOrchestrator.areContextsReady();
    const hasActiveConversation = this.conversationManager.hasActiveConversation();
    const hasMcpServer = !!this.mcpServer;
    
    // Log the status of each component for debugging
    this.logger.debug(`System readiness check:
      - Contexts ready: ${contextsReady}
      - Has active conversation: ${hasActiveConversation}
      - Has MCP server: ${hasMcpServer}`);
    
    return contextsReady && hasActiveConversation && hasMcpServer;
  }
  
  /**
   * Get detailed status of all components
   * @returns Status information for all components
   */
  getStatus(): SystemStatus {
    const hasActiveConversation = this.conversationManager.hasActiveConversation();
    
    // Create status report
    const status: SystemStatus = {
      ready: this.isReady(),
      components: {
        contextOrchestrator: {
          ready: this.contextOrchestrator.areContextsReady(),
        },
        conversation: {
          ready: hasActiveConversation,
          details: hasActiveConversation ? {
            id: this.conversationManager.getCurrentConversationId(),
          } : undefined,
        },
        mcpServer: {
          ready: !!this.mcpServer,
        },
        externalSources: {
          ready: true, // External sources are optional
          details: {
            enabled: this.externalSourcesEnabled,
          },
        },
      },
    };
    
    return status;
  }
}