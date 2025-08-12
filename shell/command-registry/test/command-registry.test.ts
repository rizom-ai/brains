import { describe, it, expect, beforeEach, mock } from "bun:test";
import { CommandRegistry } from "../src/command-registry";
import { createSilentLogger } from "@brains/utils";
import { MessageBus } from "@brains/messaging-service";
import type { Command } from "../src/types";

describe("CommandRegistry", () => {
  let registry: CommandRegistry;
  let messageBus: MessageBus;

  beforeEach(() => {
    CommandRegistry.resetInstance();
    const logger = createSilentLogger();
    messageBus = MessageBus.getInstance(logger);
    registry = CommandRegistry.getInstance(logger);
  });

  describe("registerCommand", () => {
    it("should register a command", () => {
      const command: Command = {
        name: "test-cmd",
        description: "Test command",
        handler: async () => "test result",
      };

      registry.registerCommand("test-plugin", command);

      const commands = registry.listCommands();
      expect(commands).toHaveLength(1);
      expect(commands[0]?.name).toBe("test-cmd");
    });

    it("should handle multiple commands from same plugin", () => {
      registry.registerCommand("plugin-a", {
        name: "cmd1",
        description: "Command 1",
        handler: async () => "1",
      });

      registry.registerCommand("plugin-a", {
        name: "cmd2",
        description: "Command 2",
        handler: async () => "2",
      });

      const pluginCommands = registry.getCommandsFromPlugin("plugin-a");
      expect(pluginCommands).toHaveLength(2);
      expect(pluginCommands.map((c) => c.name)).toContain("cmd1");
      expect(pluginCommands.map((c) => c.name)).toContain("cmd2");
    });

    it("should handle commands from different plugins", () => {
      registry.registerCommand("plugin-a", {
        name: "cmd-a",
        description: "Command from A",
        handler: async () => "A",
      });

      registry.registerCommand("plugin-b", {
        name: "cmd-b",
        description: "Command from B",
        handler: async () => "B",
      });

      const commands = registry.listCommands();
      expect(commands).toHaveLength(2);
    });

    it("should prevent duplicate commands from same plugin", () => {
      const command: Command = {
        name: "dup-cmd",
        description: "Duplicate command",
        handler: async () => "dup",
      };

      registry.registerCommand("test-plugin", command);
      registry.registerCommand("test-plugin", command);

      const commands = registry.listCommands();
      expect(commands).toHaveLength(1);
    });

    it("should allow same command name from different plugins", () => {
      const command: Command = {
        name: "shared-cmd",
        description: "Shared command",
        handler: async () => "shared",
      };

      registry.registerCommand("plugin-a", command);
      registry.registerCommand("plugin-b", command);

      const commands = registry.listCommands();
      expect(commands).toHaveLength(2);
    });
  });

  describe("getCommandsFromPlugin", () => {
    it("should return commands for a specific plugin", () => {
      registry.registerCommand("target-plugin", {
        name: "target-cmd1",
        description: "Target command 1",
        handler: async () => "1",
      });

      registry.registerCommand("target-plugin", {
        name: "target-cmd2",
        description: "Target command 2",
        handler: async () => "2",
      });

      registry.registerCommand("other-plugin", {
        name: "other-cmd",
        description: "Other command",
        handler: async () => "other",
      });

      const targetCommands = registry.getCommandsFromPlugin("target-plugin");
      expect(targetCommands).toHaveLength(2);
      expect(targetCommands.every((c) => c.name.startsWith("target"))).toBe(
        true,
      );
    });

    it("should return empty array for unknown plugin", () => {
      const commands = registry.getCommandsFromPlugin("unknown-plugin");
      expect(commands).toHaveLength(0);
    });
  });

  describe("findCommand", () => {
    it("should find command by name", () => {
      registry.registerCommand("test-plugin", {
        name: "find-me",
        description: "Find this command",
        handler: async () => "found",
      });

      const command = registry.findCommand("find-me");
      expect(command).toBeDefined();
      expect(command?.description).toBe("Find this command");
    });

    it("should return undefined for unknown command", () => {
      const command = registry.findCommand("nonexistent");
      expect(command).toBeUndefined();
    });

    it("should return first match when multiple plugins have same command name", () => {
      registry.registerCommand("plugin-a", {
        name: "duplicate",
        description: "From A",
        handler: async () => "A",
      });

      registry.registerCommand("plugin-b", {
        name: "duplicate",
        description: "From B",
        handler: async () => "B",
      });

      const command = registry.findCommand("duplicate");
      expect(command).toBeDefined();
      expect(command?.description).toBe("From A");
    });
  });

  describe("getStats", () => {
    it("should return correct statistics", () => {
      registry.registerCommand("plugin-a", {
        name: "cmd1",
        description: "Command 1",
        handler: async () => "1",
      });

      registry.registerCommand("plugin-a", {
        name: "cmd2",
        description: "Command 2",
        handler: async () => "2",
      });

      registry.registerCommand("plugin-b", {
        name: "cmd3",
        description: "Command 3",
        handler: async () => "3",
      });

      const stats = registry.getStats();
      expect(stats.totalCommands).toBe(3);
      expect(stats.commandsByPlugin["plugin-a"]).toBe(2);
      expect(stats.commandsByPlugin["plugin-b"]).toBe(1);
    });
  });

  // Message bus integration tests removed after refactoring to direct registration
  // CommandRegistry no longer uses MessageBus - plugins register directly via PluginManager
});
