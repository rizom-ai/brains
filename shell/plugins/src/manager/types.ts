import type { Plugin, PluginTool, PluginResource } from "../interfaces";

/**
 * Plugin Manager interface for managing plugin lifecycle
 */
export interface PluginManager {
  registerPlugin(plugin: Plugin): void;

  initializePlugins(): Promise<void>;

  getPlugin(id: string): Plugin | undefined;

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
  plugin: Plugin;
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
  [PluginEvent.REGISTERED]: [pluginId: string, plugin: Plugin];
  [PluginEvent.BEFORE_INITIALIZE]: [pluginId: string, plugin: Plugin];
  [PluginEvent.INITIALIZED]: [pluginId: string, plugin: Plugin];
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