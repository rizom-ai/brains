import type {
  Plugin as OldPlugin,
  PluginTool,
  PluginResource,
} from "@brains/plugin-utils";
import type { Plugin as NewPlugin } from "@brains/plugin-base";

// During migration, support both old and new plugin interfaces
// TODO: Remove OldPlugin type once all plugins are migrated to new interface
type MigrationPlugin = OldPlugin | NewPlugin;

/**
 * Plugin Manager interface for managing plugin lifecycle
 */
export interface PluginManager {
  registerPlugin(plugin: MigrationPlugin): void;

  initializePlugins(): Promise<void>;

  getPlugin(id: string): MigrationPlugin | undefined;

  getPluginStatus(id: string): PluginStatus | undefined;

  hasPlugin(id: string): boolean;

  isPluginInitialized(id: string): boolean;

  getAllPluginIds(): string[];

  getAllPlugins(): Map<string, PluginInfo>;

  getFailedPlugins(): Array<{ id: string; error: Error }>;

  disablePlugin(id: string): Promise<void>;

  enablePlugin(id: string): Promise<void>;

  on<E extends PluginEvent>(
    event: E,
    listener: (...args: PluginManagerEventMap[E]) => void,
  ): void;

  once<E extends PluginEvent>(
    event: E,
    listener: (...args: PluginManagerEventMap[E]) => void,
  ): void;

  off<E extends PluginEvent>(
    event: E,
    listener: (...args: PluginManagerEventMap[E]) => void,
  ): void;
}

/**
 * Plugin status types
 */
export enum PluginStatus {
  REGISTERED = "registered",
  INITIALIZED = "initialized",
  ERROR = "error",
  DISABLED = "disabled",
}

/**
 * Plugin metadata with status
 */
export interface PluginInfo {
  plugin: MigrationPlugin;
  status: PluginStatus;
  error?: Error;
  dependencies: string[];
}

/**
 * Plugin lifecycle event types
 */
export enum PluginEvent {
  REGISTERED = "plugin:registered",
  BEFORE_INITIALIZE = "plugin:before_initialize",
  INITIALIZED = "plugin:initialized",
  ERROR = "plugin:error",
  DISABLED = "plugin:disabled",
  ENABLED = "plugin:enabled",
  TOOL_REGISTER = "plugin:tool:register",
  RESOURCE_REGISTER = "plugin:resource:register",
}

/**
 * Typed event map for PluginManager events
 */
export interface PluginManagerEventMap {
  [PluginEvent.REGISTERED]: [pluginId: string, plugin: MigrationPlugin];
  [PluginEvent.BEFORE_INITIALIZE]: [pluginId: string, plugin: MigrationPlugin];
  [PluginEvent.INITIALIZED]: [pluginId: string, plugin: MigrationPlugin];
  [PluginEvent.ERROR]: [pluginId: string, error: Error];
  [PluginEvent.DISABLED]: [pluginId: string];
  [PluginEvent.ENABLED]: [pluginId: string];
  [PluginEvent.TOOL_REGISTER]: [event: PluginToolRegisterEvent];
  [PluginEvent.RESOURCE_REGISTER]: [event: PluginResourceRegisterEvent];
}

/**
 * Event data for plugin tool registration
 */
export interface PluginToolRegisterEvent {
  pluginId: string;
  tool: PluginTool;
}

/**
 * Event data for plugin resource registration
 */
export interface PluginResourceRegisterEvent {
  pluginId: string;
  resource: PluginResource;
}
