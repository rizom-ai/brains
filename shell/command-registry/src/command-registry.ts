import type { Logger } from "@brains/utils";
import type { Command } from "@brains/message-interface";
import type { EventEmitter } from "events";
import type { ICommandRegistry } from "./types";

/**
 * Plugin command registration event
 */
export interface PluginCommandRegisterEvent {
  pluginId: string;
  command: Command;
}

/**
 * Command registry events
 */
export enum CommandRegistryEvent {
  COMMAND_REGISTER = "plugin:command:register",
}

/**
 * Central registry for commands from all plugins
 * Follows the Component Interface Standardization pattern
 */
export class CommandRegistry implements ICommandRegistry {
  private static instance: CommandRegistry | null = null;

  private commands: Map<string, { command: Command; pluginId: string }> =
    new Map();
  private logger: Logger;

  /**
   * Get the singleton instance of CommandRegistry
   */
  public static getInstance(
    logger: Logger,
    events: EventEmitter,
  ): CommandRegistry {
    CommandRegistry.instance ??= new CommandRegistry(logger, events);
    return CommandRegistry.instance;
  }

  /**
   * Reset the singleton instance (primarily for testing)
   */
  public static resetInstance(): void {
    CommandRegistry.instance = null;
  }

  /**
   * Create a fresh instance without affecting the singleton
   */
  public static createFresh(
    logger: Logger,
    events: EventEmitter,
  ): CommandRegistry {
    return new CommandRegistry(logger, events);
  }

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor(logger: Logger, events: EventEmitter) {
    this.logger = logger.child("CommandRegistry");

    // Subscribe to command registration events
    events.on(
      CommandRegistryEvent.COMMAND_REGISTER,
      (event: PluginCommandRegisterEvent) => {
        this.registerCommand(event.pluginId, event.command);
      },
    );

    this.logger.debug("CommandRegistry initialized");
  }

  /**
   * Register a command from a plugin
   */
  public registerCommand(pluginId: string, command: Command): void {
    const commandKey = `${pluginId}:${command.name}`;

    this.commands.set(commandKey, {
      command,
      pluginId,
    });

    this.logger.debug(
      `Registered command /${command.name} from plugin ${pluginId}`,
    );
  }

  /**
   * Get all registered commands
   */
  public getAllCommands(): Command[] {
    return Array.from(this.commands.values()).map((entry) => entry.command);
  }

  /**
   * Find a command by name (returns first match)
   */
  public findCommand(commandName: string): Command | undefined {
    for (const entry of this.commands.values()) {
      if (entry.command.name === commandName) {
        return entry.command;
      }
    }
    return undefined;
  }

  /**
   * Get commands from a specific plugin
   */
  public getCommandsFromPlugin(pluginId: string): Command[] {
    return Array.from(this.commands.values())
      .filter((entry) => entry.pluginId === pluginId)
      .map((entry) => entry.command);
  }

  /**
   * Get registration statistics
   */
  public getStats(): {
    totalCommands: number;
    commandsByPlugin: Record<string, number>;
  } {
    const commandsByPlugin: Record<string, number> = {};

    for (const entry of this.commands.values()) {
      commandsByPlugin[entry.pluginId] =
        (commandsByPlugin[entry.pluginId] ?? 0) + 1;
    }

    return {
      totalCommands: this.commands.size,
      commandsByPlugin,
    };
  }
}
