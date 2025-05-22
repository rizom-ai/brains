/**
 * Personal Brain Shell Package
 *
 * This is the core package that provides the foundational architecture
 * for the Personal Brain application.
 */

// Export database components
export * from "./db";

// Export entity components
export { EntityRegistry } from "./entity/entityRegistry";
export { EntityService } from "./entity/entityService";
export type { EntityAdapter } from "./entity/entityRegistry";

// Export registry components
export { Registry } from "./registry/registry";
export type { ComponentFactory } from "./registry/registry";

// Export plugin system components
export {
  PluginManager,
  PluginEvent,
  PluginStatus,
} from "./plugins/pluginManager";
export type {
  Plugin,
  PluginContext,
  PluginInfo,
} from "./plugins/pluginManager";

// Export types
export * from "./types";

// Export logger
export { Logger, LogLevel } from "./utils/logger";

/**
 * Says hello to the provided name
 * Just a simple function to test that the package is working
 */
export function sayHello(name: string): string {
  return `Hello, ${name}! Welcome to Personal Brain.`;
}
