import type { Logger } from "@brains/utils";
import type { JobHandler } from "./types";

/**
 * Registry for job handlers
 * Extracted from JobQueueService for single responsibility
 */
export class HandlerRegistry {
  private handlers: Map<string, JobHandler> = new Map();
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger.child("HandlerRegistry");
  }

  /**
   * Register a job handler for a specific type
   */
  public registerHandler(
    type: string,
    handler: JobHandler,
    pluginId?: string,
  ): void {
    // Use the type exactly as provided - callers should be explicit about scope
    this.handlers.set(type, handler);
    this.logger.debug("Registered job handler", {
      type,
      pluginId,
    });
  }

  /**
   * Unregister a job handler
   */
  public unregisterHandler(type: string): void {
    this.handlers.delete(type);
    this.logger.debug("Unregistered job handler", { type });
  }

  /**
   * Unregister all handlers for a plugin
   */
  public unregisterPluginHandlers(pluginId: string): void {
    const prefix = `${pluginId}:`;
    const typesToRemove: string[] = [];

    for (const type of this.handlers.keys()) {
      if (type.startsWith(prefix)) {
        typesToRemove.push(type);
      }
    }

    for (const type of typesToRemove) {
      this.handlers.delete(type);
    }

    if (typesToRemove.length > 0) {
      this.logger.debug("Unregistered plugin handlers", {
        pluginId,
        count: typesToRemove.length,
        types: typesToRemove,
      });
    }
  }

  /**
   * Get all registered job types
   */
  public getRegisteredTypes(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Get a handler for a specific job type
   */
  public getHandler(type: string): JobHandler | undefined {
    return this.handlers.get(type);
  }

  /**
   * Check if a handler is registered for a type
   */
  public hasHandler(type: string): boolean {
    return this.handlers.has(type);
  }

  /**
   * Clear all handlers
   */
  public clear(): void {
    this.handlers.clear();
    this.logger.debug("Cleared all job handlers");
  }
}
