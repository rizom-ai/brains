import type { Logger } from "@brains/utils";
import { EventEmitter } from "events";
import type {
  PluginToolRegisterEvent,
  PluginResourceRegisterEvent,
} from "../types/plugin-manager";
import { PluginEvent } from "../types/plugin-manager";
import type { PluginTool, PluginResource } from "@brains/types";

/**
 * Handler for plugin capability registration (tools, resources)
 * Extracted from PluginManager to improve separation of concerns
 */
export class PluginRegistrationHandler {
  private static instance: PluginRegistrationHandler | null = null;

  private logger: Logger;
  private events: EventEmitter;

  /**
   * Get the singleton instance of PluginRegistrationHandler
   */
  public static getInstance(
    logger: Logger,
    events: EventEmitter,
  ): PluginRegistrationHandler {
    PluginRegistrationHandler.instance ??= new PluginRegistrationHandler(
      logger,
      events,
    );
    return PluginRegistrationHandler.instance;
  }

  /**
   * Reset the singleton instance (primarily for testing)
   */
  public static resetInstance(): void {
    PluginRegistrationHandler.instance = null;
  }

  /**
   * Create a fresh instance without affecting the singleton
   */
  public static createFresh(
    logger: Logger,
    events: EventEmitter,
  ): PluginRegistrationHandler {
    return new PluginRegistrationHandler(logger, events);
  }

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor(logger: Logger, events: EventEmitter) {
    this.logger = logger.child("PluginRegistrationHandler");
    this.events = events;
  }

  /**
   * Register plugin tools and emit events for Shell to handle
   */
  public registerPluginTools(pluginId: string, tools: PluginTool[]): void {
    this.logger.debug(
      `Registering ${tools.length} tools for plugin ${pluginId}`,
    );

    for (const tool of tools) {
      this.logger.debug(`Registering MCP tool: ${tool.name}`);

      // Emit event for Shell to handle
      const toolEvent: PluginToolRegisterEvent = { pluginId, tool };
      this.events.emit(PluginEvent.TOOL_REGISTER, toolEvent);
    }

    this.logger.info(
      `Successfully registered ${tools.length} tools for plugin ${pluginId}`,
    );
  }

  /**
   * Register plugin resources and emit events for Shell to handle
   */
  public registerPluginResources(
    pluginId: string,
    resources: PluginResource[],
  ): void {
    this.logger.debug(
      `Registering ${resources.length} resources for plugin ${pluginId}`,
    );

    for (const resource of resources) {
      this.logger.debug(`Registering MCP resource: ${resource.uri}`);

      // Emit event for Shell to handle
      const resourceEvent: PluginResourceRegisterEvent = {
        pluginId,
        resource,
      };
      this.events.emit(PluginEvent.RESOURCE_REGISTER, resourceEvent);
    }

    this.logger.info(
      `Successfully registered ${resources.length} resources for plugin ${pluginId}`,
    );
  }

  /**
   * Register all plugin capabilities (tools and resources)
   */
  public registerPluginCapabilities(
    pluginId: string,
    capabilities: {
      tools: PluginTool[];
      resources: PluginResource[];
    },
  ): void {
    this.logger.debug(
      `Registering capabilities for plugin ${pluginId}: ${capabilities.tools.length} tools, ${capabilities.resources.length} resources`,
    );

    // Register tools
    this.registerPluginTools(pluginId, capabilities.tools);

    // Register resources
    this.registerPluginResources(pluginId, capabilities.resources);

    this.logger.info(
      `Successfully registered all capabilities for plugin ${pluginId}`,
    );
  }

  /**
   * Get registration statistics for monitoring
   */
  public getRegistrationStats(): {
    toolsRegistered: number;
    resourcesRegistered: number;
  } {
    // This could be enhanced to track actual counts if needed
    // For now, return placeholder values
    return {
      toolsRegistered: 0,
      resourcesRegistered: 0,
    };
  }
}
