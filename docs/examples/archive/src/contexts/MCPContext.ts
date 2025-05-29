/**
 * MCPContext - Simplified Context System
 * 
 * This module introduces a streamlined context interface structure that reduces complexity
 * by removing excessive generic parameters and combining formerly separate interfaces.
 * 
 * This implementation will exist alongside the current system during migration.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { Logger } from '@/utils/logger';

/**
 * Resource definition for MCP resources and tools
 * This is the same as in contextInterface.ts for compatibility
 */
export interface ResourceDefinition {
  /** Resource protocol */
  protocol: string;
  /** Resource path */
  path: string;
  /** Resource handler function */
  handler: (params: Record<string, unknown>, query?: Record<string, unknown>) => Promise<unknown>;
  /** Resource name */
  name?: string;
  /** Resource description */
  description?: string;
  /** Additional resource properties */
  [key: string]: unknown;
}

/**
 * Status object for context components
 * This is the same as in contextInterface.ts for compatibility
 */
export interface ContextStatus {
  /** Context identifier/name */
  name: string;
  /** Version information */
  version: string;
  /** Whether the context is ready for use */
  ready: boolean;
  /** Additional status fields */
  [key: string]: unknown;
}

/**
 * Capabilities provided by a context
 * This is the same as in contextInterface.ts for compatibility
 */
export interface ContextCapabilities {
  /** Available API resources */
  resources: ResourceDefinition[];
  /** Available tools */
  tools: ResourceDefinition[];
  /** Supported feature identifiers */
  features: string[];
}

/**
 * Storage interface for MCP Contexts
 * Simplified to focus on actual operations used by contexts
 */
export interface MCPStorageInterface {
  /**
   * Create a new item
   * @param item The item to create
   * @returns Promise that resolves to the ID of the created item
   */
  create(item: Record<string, unknown>): Promise<string>;

  /**
   * Read an item by ID
   * @param id The ID of the item to read
   * @returns Promise that resolves to the item or null if not found
   */
  read(id: string): Promise<Record<string, unknown> | null>;

  /**
   * Update an existing item
   * @param id The ID of the item to update
   * @param updates The partial item with updates to apply
   * @returns Promise that resolves to true if update was successful
   */
  update(id: string, updates: Record<string, unknown>): Promise<boolean>;

  /**
   * Delete an item by ID
   * @param id The ID of the item to delete
   * @returns Promise that resolves to true if deletion was successful
   */
  delete(id: string): Promise<boolean>;

  /**
   * Search for items matching criteria
   * @param criteria The search criteria to use
   * @returns Promise that resolves to an array of matching items
   */
  search(criteria: Record<string, unknown>): Promise<Record<string, unknown>[]>;

  /**
   * List items with pagination
   * @param options Options for listing items
   * @returns Promise that resolves to an array of items
   */
  list(options?: { limit?: number; offset?: number }): Promise<Record<string, unknown>[]>;

  /**
   * Count items matching criteria
   * @param criteria Optional search criteria to count matching items
   * @returns Promise that resolves to the count of matching items
   */
  count(criteria?: Record<string, unknown>): Promise<number>;
}

/**
 * Formatter interface for MCP Contexts
 * Simplified to focus on the core formatting operation
 */
export interface MCPFormatterInterface {
  /**
   * Format data from input type to output type
   * @param data The data to format
   * @param options Optional formatting options
   * @returns The formatted data
   */
  format(data: unknown, options?: Record<string, unknown>): unknown;
}

/**
 * Unified MCP Context interface
 * 
 * This combines the functionality from CoreContextInterface and McpContextInterface
 * without using excessive generic parameters.
 */
export interface MCPContext {
  /**
   * Get the context name
   * @returns The name of this context
   */
  getContextName(): string;

  /**
   * Get the context version
   * @returns The version of this context
   */
  getContextVersion(): string;

  /**
   * Initialize the context with any required setup
   * @returns Promise that resolves to true if initialization was successful
   */
  initialize(): Promise<boolean>;
  
  /**
   * Check if the context is ready for use
   * @returns Boolean indicating readiness state
   */
  isReady(): boolean;
  
  /**
   * Get the current status of the context
   * @returns Status object with context information
   */
  getStatus(): ContextStatus;
  
  /**
   * Get the storage interface for this context
   * @returns The storage interface
   */
  getStorage(): MCPStorageInterface;
  
  /**
   * Get the formatter interface for this context
   * @returns The formatter interface
   */
  getFormatter(): MCPFormatterInterface;
  
  /**
   * Register context resources and tools on an MCP server
   * @param server MCP server instance to register on
   * @returns Boolean indicating success of registration
   */
  registerOnServer(server: McpServer): boolean;
  
  /**
   * Get the internal MCP server instance
   * @returns Internal MCP server instance
   */
  getMcpServer(): McpServer;
  
  /**
   * Get all capabilities provided by this context
   * @returns Context capabilities object
   */
  getCapabilities(): ContextCapabilities;
  
  /**
   * Clean up resources when context is no longer needed
   * @returns Promise that resolves when cleanup is complete
   */
  cleanup(): Promise<void>;
}

/**
 * Options for createContextFunctionality
 */
export interface ContextFunctionalityOptions {
  /** Context name */
  name: string;
  /** Context version */
  version: string;
  /** Logger instance */
  logger?: Logger;
}

/**
 * Create unified context functionality
 * 
 * This single utility function creates both core context and MCP functionality,
 * since all contexts in the system are MCP contexts.
 * 
 * @param options Configuration options
 * @returns Object with context functionality
 */
export function createContextFunctionality(options: ContextFunctionalityOptions) {
  const { name, version } = options;
  const logger = options.logger || Logger.getInstance();
  
  // Create resources and tools collections
  const resources: ResourceDefinition[] = [];
  const tools: ResourceDefinition[] = [];
  
  // Create a minimal MCP server instance
  const mcpServer = {
    name,
    version,
    // Stub implementations that will be properly set by the context
    resource: () => {},
    tool: () => {},
  } as unknown as McpServer;
  
  // Track ready state
  let readyState = false;
  
  return {
    // Core context methods
    getContextName: () => name,
    getContextVersion: () => version,
    
    initialize: async (): Promise<boolean> => {
      try {
        readyState = true;
        logger.debug(`Context ${name} initialized successfully`);
        return true;
      } catch (error) {
        logger.error(`Failed to initialize context ${name}`, { error });
        readyState = false;
        return false;
      }
    },
    
    isReady: () => readyState,
    
    getStatus: () => ({
      name,
      version,
      ready: readyState,
      resourceCount: resources.length,
      toolCount: tools.length,
    } as ContextStatus),
    
    cleanup: async (): Promise<void> => {
      logger.debug(`Cleaning up context ${name}`);
      // Base implementation does nothing
    },
    
    // MCP functionality
    resources,
    tools,
    mcpServer,
    
    registerOnServer: (server: McpServer): boolean => {
      try {
        // Register resources
        for (const resource of resources) {
          try {
            const resourceName = resource.name || `${name}_${resource.path}`;
            const description = resource.description || `Resource for ${resource.path}`;
            
            // Create a wrapper function for the handler
            const handlerWrapper = (uri: URL, _extra: Record<string, unknown>) => {
              // Extract query parameters
              const queryParams: Record<string, unknown> = {};
              if (uri.search) {
                uri.searchParams.forEach((value, key) => {
                  queryParams[key] = value;
                });
              }
              
              // Call the original handler
              return resource.handler({}, queryParams).then(result => {
                return {
                  contents: [
                    {
                      text: JSON.stringify(result),
                      uri: uri.toString(),
                    },
                  ],
                };
              });
            };
            
            // Register the resource
            server.resource(
              resourceName,
              resource.path,
              { description },
              handlerWrapper,
            );
          } catch (error) {
            // Continue with other resources even if one fails
            logger.error(`Error registering resource ${resource.path} in ${name}`, { error });
          }
        }
        
        // Register tools
        for (const tool of tools) {
          try {
            const toolName = tool.name || `${name}_${tool.path}`;
            const description = tool.description || `Tool for ${tool.path}`;
            
            // Create a wrapper function for the handler
            const handlerWrapper = (extra: Record<string, unknown>) => {
              // Extract parameters
              const params = extra['params'] || {};
              const query = extra['query'] || {};
              
              // Call the original handler
              return tool.handler(params as Record<string, unknown>, query as Record<string, unknown>)
                .then(result => {
                  return {
                    content: [
                      {
                        type: 'text' as const,
                        text: typeof result === 'string' ? result : JSON.stringify(result),
                      },
                    ],
                  };
                });
            };
            
            // Register the tool
            server.tool(
              toolName,
              description,
              handlerWrapper,
            );
          } catch (error) {
            // Continue with other tools even if one fails
            logger.error(`Error registering tool ${tool.path} in ${name}`, { error });
          }
        }
        
        return true;
      } catch (error) {
        logger.error(`Error registering ${name} on server`, { error });
        return false;
      }
    },
    
    getCapabilities: () => ({
      resources: [...resources],
      tools: [...tools],
      features: [],
    }),
    
    getMcpServer: () => mcpServer,
  };
}