/**
 * Target Resolver
 * 
 * Resolves routing targets to actual handler functions.
 * This provides a layer of indirection between routing rules
 * and the actual handlers, allowing for dynamic reconfiguration.
 */

import { Logger } from '@/utils/logger';

import type { MessageHandler } from '../router';

/**
 * Target resolver for mapping target identifiers to handlers
 */
export class TargetResolver {
  private static instance: TargetResolver | null = null;
  
  /** Map of target identifiers to handlers */
  private handlers: Map<string, MessageHandler> = new Map();
  
  /** Logger instance */
  private logger = Logger.getInstance();
  
  /**
   * Get the singleton instance of TargetResolver
   * 
   * @returns The singleton instance
   */
  public static getInstance(): TargetResolver {
    if (!TargetResolver.instance) {
      TargetResolver.instance = new TargetResolver();
      
      const logger = Logger.getInstance();
      logger.debug('TargetResolver singleton instance created');
    }
    
    return TargetResolver.instance;
  }
  
  /**
   * Reset the singleton instance
   * This is primarily used for testing to ensure a clean state between tests
   */
  public static resetInstance(): void {
    TargetResolver.instance = null;
    
    const logger = Logger.getInstance();
    logger.debug('TargetResolver singleton instance reset');
  }
  
  /**
   * Create a fresh instance without affecting the singleton
   * 
   * @returns A new instance
   */
  public static createFresh(): TargetResolver {
    const logger = Logger.getInstance();
    logger.debug('Creating fresh TargetResolver instance');
    
    return new TargetResolver();
  }
  
  /**
   * Create a new instance with explicit dependencies
   * 
   * @param config Configuration options
   * @param dependencies External dependencies
   * @returns A new TargetResolver instance
   */
  public static createWithDependencies(
    _config: Record<string, unknown> = {},
    dependencies: Record<string, unknown> = {},
  ): TargetResolver {
    const logger = Logger.getInstance();
    logger.debug('Creating TargetResolver with explicit dependencies');
    
    // Create a new instance
    const resolver = new TargetResolver();
    
    // If there are pre-registered handlers in dependencies, register them
    if (dependencies['handlers'] && Array.isArray(dependencies['handlers'])) {
      const handlers = dependencies['handlers'] as Array<{target: string, handler: MessageHandler}>;
      
      for (const { target, handler } of handlers) {
        resolver.registerHandler(target, handler);
      }
    }
    
    return resolver;
  }
  
  /**
   * Private constructor to enforce getInstance() usage
   */
  private constructor() {
    // Initialization if needed
  }
  
  /**
   * Register a handler for a target
   * 
   * @param target Target identifier
   * @param handler Handler function
   */
  registerHandler(target: string, handler: MessageHandler): void {
    this.handlers.set(target, handler);
    this.logger.debug(`Registered handler for target: ${target}`);
  }
  
  /**
   * Unregister a handler for a target
   * 
   * @param target Target identifier
   * @returns Whether a handler was removed
   */
  unregisterHandler(target: string): boolean {
    const removed = this.handlers.delete(target);
    
    if (removed) {
      this.logger.debug(`Unregistered handler for target: ${target}`);
    }
    
    return removed;
  }
  
  /**
   * Get a handler for a target
   * 
   * @param target Target identifier
   * @returns Handler function or undefined if not found
   */
  getHandler(target: string): MessageHandler | undefined {
    return this.handlers.get(target);
  }
  
  /**
   * Check if a handler exists for a target
   * 
   * @param target Target identifier
   * @returns Whether a handler exists
   */
  hasHandler(target: string): boolean {
    return this.handlers.has(target);
  }
  
  /**
   * Get all registered targets
   * 
   * @returns Array of target identifiers
   */
  getTargets(): string[] {
    return Array.from(this.handlers.keys());
  }
}
