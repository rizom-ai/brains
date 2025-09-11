import type { Logger } from "@brains/utils";
import type { EventEmitter } from "events";
import { PluginEvent } from "./types";
import type {
  PluginToolRegisterEvent,
  PluginResourceRegisterEvent,
} from "./types";
import type { PluginTool, PluginResource } from "../interfaces";
import type { Command } from "@brains/command-registry";
import type { ServiceRegistry } from "@brains/service-registry";
import type { IShell } from "../interfaces";

/**
 * Handler for plugin capability registration (tools, resources)
 * Extracted from PluginManager to improve separation of concerns
 */
export class PluginRegistrationHandler {
  private static instance: PluginRegistrationHandler | null = null;

  private logger: Logger;
  private events: EventEmitter;
  private serviceRegistry: ServiceRegistry;

  /**
   * Get the singleton instance of PluginRegistrationHandler
   */
  public static getInstance(
    logger: Logger,
    events: EventEmitter,
    serviceRegistry: ServiceRegistry,
  ): PluginRegistrationHandler {
    PluginRegistrationHandler.instance ??= new PluginRegistrationHandler(
      logger,
      events,
      serviceRegistry,
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
    serviceRegistry: ServiceRegistry,
  ): PluginRegistrationHandler {
    return new PluginRegistrationHandler(logger, events, serviceRegistry);
  }

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor(
    logger: Logger,
    events: EventEmitter,
    serviceRegistry: ServiceRegistry,
  ) {
    this.logger = logger.child("PluginRegistrationHandler");
    this.events = events;
    this.serviceRegistry = serviceRegistry;
  }

  /**
   * Register plugin tools and emit events for Shell to handle
   */
  public async registerPluginTools(
    pluginId: string,
    tools: PluginTool[],
  ): Promise<void> {
    this.logger.debug(
      `Registering ${tools.length} tools for plugin ${pluginId}`,
    );

    // Get the message bus from shell
    const shell = this.serviceRegistry.resolve<IShell>("shell");
    const messageBus = shell.getMessageBus();

    for (const tool of tools) {
      this.logger.debug(`Registering MCP tool: ${tool.name}`);

      // Emit event for Shell to handle (existing behavior)
      const toolEvent: PluginToolRegisterEvent = { pluginId, tool };
      this.events.emit(PluginEvent.TOOL_REGISTER, toolEvent);

      // Also publish to MessageBus for plugin consumption
      await messageBus.send(
        "system:tool:register",
        {
          pluginId,
          tool,
          timestamp: Date.now(),
        },
        "PluginRegistrationHandler",
      );
    }

    this.logger.info(
      `Successfully registered ${tools.length} tools for plugin ${pluginId}`,
    );
  }

  /**
   * Register plugin resources and emit events for Shell to handle
   */
  public async registerPluginResources(
    pluginId: string,
    resources: PluginResource[],
  ): Promise<void> {
    this.logger.debug(
      `Registering ${resources.length} resources for plugin ${pluginId}`,
    );

    // Get the message bus from shell
    const shell = this.serviceRegistry.resolve<IShell>("shell");
    const messageBus = shell.getMessageBus();

    for (const resource of resources) {
      this.logger.debug(`Registering MCP resource: ${resource.uri}`);

      // Emit event for Shell to handle (existing behavior)
      const resourceEvent: PluginResourceRegisterEvent = {
        pluginId,
        resource,
      };
      this.events.emit(PluginEvent.RESOURCE_REGISTER, resourceEvent);

      // Also publish to MessageBus for plugin consumption
      await messageBus.send(
        "system:resource:register",
        {
          pluginId,
          resource,
          timestamp: Date.now(),
        },
        "PluginRegistrationHandler",
      );
    }

    this.logger.info(
      `Successfully registered ${resources.length} resources for plugin ${pluginId}`,
    );
  }

  /**
   * Register plugin commands
   */
  public async registerPluginCommands(
    pluginId: string,
    commands: Command[],
  ): Promise<void> {
    this.logger.debug(
      `Registering ${commands.length} commands for plugin ${pluginId}`,
    );

    // Get the message bus from shell
    const shell = this.serviceRegistry.resolve<IShell>("shell");
    const messageBus = shell.getMessageBus();

    for (const command of commands) {
      this.logger.debug(`Registering command: /${command.name}`);

      // Publish to MessageBus for CommandRegistry to handle
      await messageBus.send(
        "system:command:register",
        {
          pluginId,
          command,
          timestamp: Date.now(),
        },
        "PluginRegistrationHandler",
      );
    }

    this.logger.info(
      `Successfully registered ${commands.length} commands for plugin ${pluginId}`,
    );
  }

  /**
   * Register all plugin capabilities (tools and resources)
   */
  public async registerPluginCapabilities(
    pluginId: string,
    capabilities: {
      tools: PluginTool[];
      resources: PluginResource[];
      commands: Command[];
    },
  ): Promise<void> {
    this.logger.debug(
      `Registering capabilities for plugin ${pluginId}: ${capabilities.tools.length} tools, ${capabilities.resources.length} resources, ${capabilities.commands.length} commands`,
    );

    // Register tools
    await this.registerPluginTools(pluginId, capabilities.tools);

    // Register resources
    await this.registerPluginResources(pluginId, capabilities.resources);

    // Register commands
    await this.registerPluginCommands(pluginId, capabilities.commands);

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
