import { describe, it, expect, beforeEach, mock } from "bun:test";
import { CommandRegistry } from "../src/command-registry";
import { createSilentLogger } from "@brains/utils";
import { MessageBus } from "@brains/messaging-service";
import { PermissionService } from "@brains/permission-service";
import type { Command } from "../src/types";

describe("CommandRegistry", () => {
  let registry: CommandRegistry;
  let messageBus: MessageBus;
  let permissionService: PermissionService;

  beforeEach(() => {
    CommandRegistry.resetInstance();
    const logger = createSilentLogger();
    messageBus = MessageBus.getInstance(logger);
    
    // Create a PermissionService with test configuration
    permissionService = new PermissionService({
      anchors: ["matrix:@anchor:test.org"],
      trusted: ["matrix:@trusted:test.org"],
    });
    
    registry = CommandRegistry.getInstance(logger, permissionService);
  });

  describe("registerCommand", () => {
    it("should register a command", () => {
      const command: Command = {
        name: "test-cmd",
        description: "Test command",
        visibility: "public",
        handler: async () => "test result",
      };

      registry.registerCommand("test-plugin", command);

      const commands = registry.listCommands("matrix", "@user:test.org");
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
        visibility: "public",
        handler: async () => "A",
      });

      registry.registerCommand("plugin-b", {
        name: "cmd-b",
        description: "Command from B",
        visibility: "public",
        handler: async () => "B",
      });

      const commands = registry.listCommands("matrix", "@anchor:test.org");
      expect(commands).toHaveLength(2);
    });

    it("should prevent duplicate commands from same plugin", () => {
      const command: Command = {
        name: "dup-cmd",
        description: "Duplicate command",
        visibility: "public",
        handler: async () => "dup",
      };

      registry.registerCommand("test-plugin", command);
      registry.registerCommand("test-plugin", command);

      const commands = registry.listCommands("matrix", "@anchor:test.org");
      expect(commands).toHaveLength(1);
    });

    it("should allow same command name from different plugins", () => {
      const command: Command = {
        name: "shared-cmd",
        description: "Shared command",
        visibility: "public",
        handler: async () => "shared",
      };

      registry.registerCommand("plugin-a", command);
      registry.registerCommand("plugin-b", command);

      const commands = registry.listCommands("matrix", "@anchor:test.org");
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

      const command = registry.findCommand("find-me", "matrix", "@anchor:test.org");
      expect(command).toBeDefined();
      expect(command?.description).toBe("Find this command");
    });

    it("should return undefined for unknown command", () => {
      const command = registry.findCommand("nonexistent", "matrix", "@anchor:test.org");
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
        visibility: "public",
        handler: async () => "B",
      });

      const command = registry.findCommand("duplicate", "matrix", "@user:test.org");
      expect(command).toBeDefined();
      // Should find one of the duplicate commands (order not guaranteed)
      expect(["From A", "From B"]).toContain(command?.description);
    });
  });

  describe("getStats", () => {
    it("should return correct statistics", () => {
      registry.registerCommand("plugin-a", {
        name: "cmd1",
        description: "Command 1",
        visibility: "public",
        handler: async () => "1",
      });

      registry.registerCommand("plugin-a", {
        name: "cmd2",
        description: "Command 2",
        visibility: "public",
        handler: async () => "2",
      });

      registry.registerCommand("plugin-b", {
        name: "cmd3",
        description: "Command 3",
        visibility: "public",
        handler: async () => "3",
      });

      const stats = registry.getStats();
      expect(stats.totalCommands).toBe(3);
      expect(stats.commandsByPlugin["plugin-a"]).toBe(2);
      expect(stats.commandsByPlugin["plugin-b"]).toBe(1);
    });
  });

  describe("Permission-based command filtering", () => {
    beforeEach(() => {
      // Register commands with different visibility levels
      registry.registerCommand("plugin-test", {
        name: "public-cmd",
        description: "Public command",
        visibility: "public",
        handler: async () => "public result",
      });

      registry.registerCommand("plugin-test", {
        name: "trusted-cmd",
        description: "Trusted command",
        visibility: "trusted",
        handler: async () => "trusted result",
      });

      registry.registerCommand("plugin-test", {
        name: "anchor-cmd",
        description: "Anchor command",
        visibility: "anchor",
        handler: async () => "anchor result",
      });

      registry.registerCommand("plugin-test", {
        name: "default-cmd",
        description: "Command with default visibility (anchor)",
        // No visibility specified - should default to "anchor"
        handler: async () => "default result",
      });
    });

    describe("listCommands with permission filtering", () => {
      it("should return all commands for anchor user", () => {
        const commands = registry.listCommands("matrix", "@anchor:test.org");
        expect(commands).toHaveLength(4);
        const names = commands.map((c) => c.name);
        expect(names).toContain("public-cmd");
        expect(names).toContain("trusted-cmd");
        expect(names).toContain("anchor-cmd");
        expect(names).toContain("default-cmd");
      });

      it("should return only public commands for public user", () => {
        const commands = registry.listCommands("matrix", "@public:test.org");
        expect(commands).toHaveLength(1);
        expect(commands[0]?.name).toBe("public-cmd");
      });

      it("should return public and trusted commands for trusted user", () => {
        const commands = registry.listCommands("matrix", "@trusted:test.org");
        expect(commands).toHaveLength(2);
        const names = commands.map((c) => c.name);
        expect(names).toContain("public-cmd");
        expect(names).toContain("trusted-cmd");
        expect(names).not.toContain("anchor-cmd");
        expect(names).not.toContain("default-cmd");
      });

      it("should return all commands for another anchor user", () => {
        const commands = registry.listCommands("matrix", "@anchor:test.org");
        expect(commands).toHaveLength(4);
        const names = commands.map((c) => c.name);
        expect(names).toContain("public-cmd");
        expect(names).toContain("trusted-cmd");
        expect(names).toContain("anchor-cmd");
        expect(names).toContain("default-cmd");
      });
    });

    describe("findCommand with permission filtering", () => {
      it("should find public command for any user level", () => {
        expect(registry.findCommand("public-cmd", "matrix", "@public:test.org")).toBeDefined();
        expect(registry.findCommand("public-cmd", "matrix", "@trusted:test.org")).toBeDefined();
        expect(registry.findCommand("public-cmd", "matrix", "@anchor:test.org")).toBeDefined();
      });

      it("should not find trusted command for public user", () => {
        expect(registry.findCommand("trusted-cmd", "matrix", "@public:test.org")).toBeUndefined();
      });

      it("should find trusted command for trusted and anchor users", () => {
        expect(registry.findCommand("trusted-cmd", "matrix", "@trusted:test.org")).toBeDefined();
        expect(registry.findCommand("trusted-cmd", "matrix", "@anchor:test.org")).toBeDefined();
      });

      it("should not find anchor command for public or trusted users", () => {
        expect(registry.findCommand("anchor-cmd", "matrix", "@public:test.org")).toBeUndefined();
        expect(registry.findCommand("anchor-cmd", "matrix", "@trusted:test.org")).toBeUndefined();
      });

      it("should find anchor command for anchor user", () => {
        expect(registry.findCommand("anchor-cmd", "matrix", "@anchor:test.org")).toBeDefined();
      });

      it("should treat commands with no visibility as anchor-only (secure default)", () => {
        expect(registry.findCommand("default-cmd", "matrix", "@public:test.org")).toBeUndefined();
        expect(registry.findCommand("default-cmd", "matrix", "@trusted:test.org")).toBeUndefined();
        expect(registry.findCommand("default-cmd", "matrix", "@anchor:test.org")).toBeDefined();
      });

      it("should find all commands for anchor user", () => {
        expect(registry.findCommand("anchor-cmd", "matrix", "@anchor:test.org")).toBeDefined();
        expect(registry.findCommand("trusted-cmd", "matrix", "@anchor:test.org")).toBeDefined();
        expect(registry.findCommand("public-cmd", "matrix", "@anchor:test.org")).toBeDefined();
      });
    });

    describe("Permission hierarchy validation", () => {
      it("should respect permission hierarchy: anchor > trusted > public", () => {
        const anchorCommands = registry.listCommands("matrix", "@anchor:test.org");
        const trustedCommands = registry.listCommands("matrix", "@trusted:test.org");
        const publicCommands = registry.listCommands("matrix", "@public:test.org");

        // Anchor should see most commands
        expect(anchorCommands.length).toBeGreaterThanOrEqual(
          trustedCommands.length,
        );
        expect(trustedCommands.length).toBeGreaterThanOrEqual(
          publicCommands.length,
        );

        // Public commands should be accessible to all levels
        const publicNames = publicCommands.map((c) => c.name);
        const trustedNames = trustedCommands.map((c) => c.name);
        const anchorNames = anchorCommands.map((c) => c.name);

        publicNames.forEach((name) => {
          expect(trustedNames).toContain(name);
          expect(anchorNames).toContain(name);
        });

        // Trusted commands should be accessible to trusted and anchor
        trustedNames.forEach((name) => {
          expect(anchorNames).toContain(name);
        });
      });
    });
  });

  // Message bus integration tests removed after refactoring to direct registration
  // CommandRegistry no longer uses MessageBus - plugins register directly via PluginManager
});
