import { Logger } from "@brains/utils";
import type { EvalHandler, IEvalHandlerRegistry } from "./types";

/**
 * Registry for plugin eval handlers
 * Plugins register handlers here to enable direct (non-chat) testing
 */
export class EvalHandlerRegistry implements IEvalHandlerRegistry {
  private static instance: EvalHandlerRegistry | null = null;
  private handlers: Map<string, EvalHandler> = new Map();
  private logger: Logger;

  /**
   * Get the singleton instance
   */
  public static getInstance(): EvalHandlerRegistry {
    EvalHandlerRegistry.instance ??= new EvalHandlerRegistry();
    return EvalHandlerRegistry.instance;
  }

  /**
   * Reset the singleton instance (for testing)
   */
  public static resetInstance(): void {
    EvalHandlerRegistry.instance = null;
  }

  /**
   * Create a fresh instance without affecting the singleton
   */
  public static createFresh(): EvalHandlerRegistry {
    return new EvalHandlerRegistry();
  }

  private constructor() {
    this.logger = Logger.getInstance().child("EvalHandlerRegistry");
  }

  /**
   * Create a composite key from plugin and handler IDs
   */
  private makeKey(pluginId: string, handlerId: string): string {
    return `${pluginId}:${handlerId}`;
  }

  /**
   * Parse a composite key back to plugin and handler IDs
   */
  private parseKey(key: string): { pluginId: string; handlerId: string } {
    const [pluginId = "", ...rest] = key.split(":");
    return { pluginId, handlerId: rest.join(":") };
  }

  /**
   * Register an eval handler for a plugin
   */
  public register(
    pluginId: string,
    handlerId: string,
    handler: EvalHandler,
  ): void {
    const key = this.makeKey(pluginId, handlerId);

    if (this.handlers.has(key)) {
      this.logger.warn(`Overwriting existing handler: ${key}`);
    }

    this.handlers.set(key, handler);
    this.logger.debug(`Registered eval handler: ${key}`);
  }

  /**
   * Get an eval handler by plugin and handler ID
   */
  public get(pluginId: string, handlerId: string): EvalHandler | undefined {
    const key = this.makeKey(pluginId, handlerId);
    return this.handlers.get(key);
  }

  /**
   * List all registered handlers
   */
  public list(): Array<{ pluginId: string; handlerId: string }> {
    return Array.from(this.handlers.keys()).map((key) => this.parseKey(key));
  }

  /**
   * Check if a handler exists
   */
  public has(pluginId: string, handlerId: string): boolean {
    const key = this.makeKey(pluginId, handlerId);
    return this.handlers.has(key);
  }

  /**
   * Remove a handler
   */
  public unregister(pluginId: string, handlerId: string): boolean {
    const key = this.makeKey(pluginId, handlerId);
    const existed = this.handlers.has(key);

    if (existed) {
      this.handlers.delete(key);
      this.logger.debug(`Unregistered eval handler: ${key}`);
    }

    return existed;
  }

  /**
   * Get the number of registered handlers
   */
  public get size(): number {
    return this.handlers.size;
  }

  /**
   * Clear all handlers
   */
  public clear(): void {
    this.handlers.clear();
    this.logger.debug("Cleared all eval handlers");
  }
}
