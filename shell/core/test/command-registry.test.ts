import { describe, it, expect, beforeEach } from "bun:test";
import {
  CommandRegistry,
  CommandRegistryEvent,
} from "@brains/command-registry";
import { EventEmitter } from "events";
import type { Command } from "@brains/message-interface";
import { Logger, LogLevel } from "@brains/utils";

describe("CommandRegistry", () => {
  let registry: CommandRegistry;
  let eventEmitter: EventEmitter;
  let logger: Logger;

  beforeEach(() => {
    logger = Logger.createFresh({ level: LogLevel.INFO });
    eventEmitter = new EventEmitter();
    registry = CommandRegistry.createFresh(logger, eventEmitter);
  });

  describe("registerCommand", () => {
    it("should register a command", () => {
      const command: Command = {
        name: "test-command",
        description: "Test command",
        handler: async () => ({ type: "message", message: "Test" }),
      };

      registry.registerCommand("test-plugin", command);

      const commands = registry.getAllCommands();
      expect(commands).toHaveLength(1);
      expect(commands[0]?.name).toBe("test-command");
    });

    it("should handle multiple commands from same plugin", () => {
      const command1: Command = {
        name: "command1",
        description: "First command",
        handler: async () => ({ type: "message", message: "First" }),
      };

      const command2: Command = {
        name: "command2",
        description: "Second command",
        handler: async () => ({ type: "message", message: "Second" }),
      };

      registry.registerCommand("test-plugin", command1);
      registry.registerCommand("test-plugin", command2);

      const commands = registry.getAllCommands();
      expect(commands).toHaveLength(2);

      const commandNames = commands.map((cmd) => cmd.name);
      expect(commandNames).toContain("command1");
      expect(commandNames).toContain("command2");
    });

    it("should handle commands from different plugins", () => {
      const pluginACommand: Command = {
        name: "plugin-a-cmd",
        description: "Plugin A command",
        handler: async () => ({ type: "message", message: "Plugin A" }),
      };

      const pluginBCommand: Command = {
        name: "plugin-b-cmd",
        description: "Plugin B command",
        handler: async () => ({ type: "message", message: "Plugin B" }),
      };

      registry.registerCommand("plugin-a", pluginACommand);
      registry.registerCommand("plugin-b", pluginBCommand);

      const commands = registry.getAllCommands();
      expect(commands).toHaveLength(2);
    });

    it("should prevent duplicate commands from same plugin", () => {
      const command: Command = {
        name: "duplicate",
        description: "Duplicate command",
        handler: async () => ({ type: "message", message: "Duplicate" }),
      };

      registry.registerCommand("test-plugin", command);
      // Register same command again
      registry.registerCommand("test-plugin", command);

      const commands = registry.getAllCommands();
      // Should still have only one command
      expect(commands).toHaveLength(1);
    });

    it("should allow same command name from different plugins", () => {
      const commandA: Command = {
        name: "shared-name",
        description: "Plugin A version",
        handler: async () => ({ type: "message", message: "From A" }),
      };

      const commandB: Command = {
        name: "shared-name",
        description: "Plugin B version",
        handler: async () => ({ type: "message", message: "From B" }),
      };

      registry.registerCommand("plugin-a", commandA);
      registry.registerCommand("plugin-b", commandB);

      const commands = registry.getAllCommands();
      // Should have both commands
      expect(commands).toHaveLength(2);

      // Both should have the same name
      const commandNames = commands.map((cmd) => cmd.name);
      expect(
        commandNames.filter((name) => name === "shared-name"),
      ).toHaveLength(2);
    });
  });

  describe("getCommandsFromPlugin", () => {
    it("should return commands for a specific plugin", () => {
      const commandA: Command = {
        name: "plugin-a-cmd",
        description: "Plugin A command",
        handler: async () => ({ type: "message", message: "A" }),
      };

      const commandB: Command = {
        name: "plugin-b-cmd",
        description: "Plugin B command",
        handler: async () => ({ type: "message", message: "B" }),
      };

      registry.registerCommand("plugin-a", commandA);
      registry.registerCommand("plugin-b", commandB);

      const pluginACommands = registry.getCommandsFromPlugin("plugin-a");
      expect(pluginACommands).toHaveLength(1);
      expect(pluginACommands[0]?.name).toBe("plugin-a-cmd");

      const pluginBCommands = registry.getCommandsFromPlugin("plugin-b");
      expect(pluginBCommands).toHaveLength(1);
      expect(pluginBCommands[0]?.name).toBe("plugin-b-cmd");
    });

    it("should return empty array for unknown plugin", () => {
      const commands = registry.getCommandsFromPlugin("unknown-plugin");
      expect(commands).toHaveLength(0);
    });
  });

  describe("findCommand", () => {
    it("should find command by name", () => {
      const command: Command = {
        name: "find-me",
        description: "Test command",
        handler: async () => ({ type: "message", message: "Found" }),
      };

      registry.registerCommand("test-plugin", command);

      const found = registry.findCommand("find-me");
      expect(found).toBeDefined();
      expect(found?.name).toBe("find-me");
      expect(found?.description).toBe("Test command");
    });

    it("should return undefined for unknown command", () => {
      const found = registry.findCommand("unknown-command");
      expect(found).toBeUndefined();
    });

    it("should return first match when multiple plugins have same command name", () => {
      const commandA: Command = {
        name: "shared",
        description: "From plugin A",
        handler: async () => ({ type: "message", message: "A" }),
      };

      const commandB: Command = {
        name: "shared",
        description: "From plugin B",
        handler: async () => ({ type: "message", message: "B" }),
      };

      registry.registerCommand("plugin-a", commandA);
      registry.registerCommand("plugin-b", commandB);

      const found = registry.findCommand("shared");
      expect(found).toBeDefined();
      // Should return one of them (first match)
      expect(["From plugin A", "From plugin B"]).toContain(found?.description);
    });
  });

  describe("getStats", () => {
    it("should return correct statistics", () => {
      registry.registerCommand("plugin-a", {
        name: "cmd1",
        description: "Command 1",
        handler: async () => ({ type: "message", message: "1" }),
      });

      registry.registerCommand("plugin-a", {
        name: "cmd2",
        description: "Command 2",
        handler: async () => ({ type: "message", message: "2" }),
      });

      registry.registerCommand("plugin-b", {
        name: "cmd3",
        description: "Command 3",
        handler: async () => ({ type: "message", message: "3" }),
      });

      const stats = registry.getStats();
      expect(stats.totalCommands).toBe(3);
      expect(stats.commandsByPlugin["plugin-a"]).toBe(2);
      expect(stats.commandsByPlugin["plugin-b"]).toBe(1);
    });
  });

  describe("event listeners", () => {
    it("should handle plugin:command:register event", () => {
      const command: Command = {
        name: "event-cmd",
        description: "Event command",
        handler: async () => ({ type: "message", message: "Event" }),
      };

      eventEmitter.emit(CommandRegistryEvent.COMMAND_REGISTER, {
        pluginId: "event-plugin",
        command: command,
      });

      const commands = registry.getAllCommands();
      expect(commands).toHaveLength(1);
      expect(commands[0]?.name).toBe("event-cmd");
    });

    it("should handle multiple command registration events", () => {
      const command1: Command = {
        name: "cmd1",
        description: "Command 1",
        handler: async () => ({ type: "message", message: "1" }),
      };

      const command2: Command = {
        name: "cmd2",
        description: "Command 2",
        handler: async () => ({ type: "message", message: "2" }),
      };

      eventEmitter.emit(CommandRegistryEvent.COMMAND_REGISTER, {
        pluginId: "event-plugin",
        command: command1,
      });

      eventEmitter.emit(CommandRegistryEvent.COMMAND_REGISTER, {
        pluginId: "event-plugin",
        command: command2,
      });

      const commands = registry.getAllCommands();
      expect(commands).toHaveLength(2);
      expect(commands.map((c) => c.name)).toContain("cmd1");
      expect(commands.map((c) => c.name)).toContain("cmd2");
    });
  });
});
