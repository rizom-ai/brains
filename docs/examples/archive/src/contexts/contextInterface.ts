/**
 * Core Context Interfaces
 * 
 * This module defines the streamlined interface hierarchy for all context components,
 * with a clear separation between core functionality and MCP-specific concerns.
 * 
 * Interface simplification as part of Phase 6:
 * - Adds standardized ContextDependencies interface
 * - Adds StorageAccess interface for consistent storage operations
 * - Adds FormatterAccess interface for consistent formatting operations
 * - Adds ServiceAccess interface for consistent service operations
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { Registry } from '@/utils/registry';

import type { FormatterInterface, FormattingOptions } from './formatterInterface';
import type { StorageInterface } from './storageInterface';

/**
 * Standard context dependencies interface
 * Provides a consistent pattern for dependency injection across all contexts
 */
export interface ContextDependencies<
  TStorage extends StorageInterface<unknown, unknown>,
  TFormatter extends FormatterInterface<unknown, unknown>
> {
  /** Storage implementation */
  storage?: TStorage;
  /** Formatter implementation */
  formatter?: TFormatter;
  /** Registry for service resolution */
  registry?: Registry;
  /** Additional dependencies */
  [key: string]: unknown;
}

/**
 * Storage access interface
 * Provides consistent storage operations across contexts
 */
export interface StorageAccess<T extends StorageInterface<unknown, unknown>> {
  /**
   * Get the storage implementation
   * @returns Storage implementation
   */
  getStorage(): T;
}

/**
 * Formatter access interface
 * Provides consistent formatter operations across contexts
 * 
 * @template T - The formatter interface type
 * @template TInputData - The input data type for formatting
 * @template TOutputData - The output data type for formatting
 */
export interface FormatterAccess<
  T extends FormatterInterface<unknown, unknown>,
  TInputData = unknown,
  TOutputData = unknown
> {
  /**
   * Get the formatter implementation
   * @returns Formatter implementation
   */
  getFormatter(): T;
  
  /**
   * Format data using the context's formatter
   * @param data Data to format
   * @param options Optional formatting options
   * @returns Formatted data
   */
  format(data: TInputData, options?: FormattingOptions): TOutputData;
}

/**
 * Service access interface
 * Provides consistent service resolution across contexts
 */
export interface ServiceAccess {
  /**
   * Get a service by type
   * @param serviceType Type of service to retrieve
   * @returns Service instance
   */
  getService<T>(serviceType: new () => T): T;
}

/**
 * Status object for context components
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
 * Resource definition for MCP resources and tools
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
 * Capabilities provided by a context
 */
export interface ContextCapabilities {
  /** Available API resources */
  resources: ResourceDefinition[];
  /** Available tools */
  tools: ResourceDefinition[];
  /** Supported feature identifiers */
  features: string[];
}

// Removed ExtendedContextInterface since we're now using createFresh with config and dependencies

/**
 * Core context interface - fundamental functionality for all contexts
 */
export interface CoreContextInterface {
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
   * Clean up resources when context is no longer needed
   * @returns Promise that resolves when cleanup is complete
   */
  cleanup(): Promise<void>;
}

/**
 * MCP-specific interface - extends core with MCP functionality
 */
export interface McpContextInterface extends CoreContextInterface {
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
}

/**
 * Complete context interface combining all standardized interfaces
 * This provides a comprehensive standard for context implementation
 * 
 * @template TStorage - The specific StorageInterface implementation
 * @template TFormatter - The specific FormatterInterface implementation
 * @template TInputData - The input data type for formatting
 * @template TOutputData - The output data type for formatting
 */
export interface ContextInterface<
  TStorage extends StorageInterface<unknown, unknown>,
  TFormatter extends FormatterInterface<unknown, unknown>,
  TInputData = unknown,
  TOutputData = unknown
> extends 
  CoreContextInterface, 
  StorageAccess<TStorage>,
  FormatterAccess<TFormatter, TInputData, TOutputData>,
  ServiceAccess
{
  // No additional methods required
  // getInstance and resetInstance should be implemented as static methods on the class
}

// We've simplified the interface hierarchy by removing the redundant McpContextInterface<T,F,I,O>
// Now the hierarchy is:
// - CoreContextInterface: Basic context functionality
// - McpContextInterface: MCP-specific extensions to CoreContextInterface
// - ContextInterface<T,F,I,O>: Complete interface with all functionality