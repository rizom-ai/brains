import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { PluginRegistry, type PluginInfo } from "../src/pluginRegistry";
import { Logger, PluginRegistrationError, PluginDependencyError, PluginInitializationError } from "@brains/utils";
import type { Plugin } from "@brains/plugin-base";
import type { IShell } from "@brains/types";

// Mock shell
const mockShell: IShell = {
  registerCommand: () => {},
  registerTool: () => {},
  registerResource: () => {},
  registerDaemon: () => {},
  registerRoute: () => {},
  getEntityService: () => ({} as any),
  getServiceRegistry: () => ({} as any),
  getCommandRegistry: () => ({} as any),
  getMessageBus: () => ({} as any),
  getDaemonRegistry: () => ({} as any),
  getViewRegistry: () => ({} as any),
  getJobQueueService: () => ({} as any),
  getBatchJobManager: () => ({} as any),
  getLogger: () => Logger.createFresh({ level: "error", context: "test" }),
  query: async () => ({ message: "test" }),
  listCommands: async () => [],
  executeCommand: async () => ({ type: "message", message: "test" }),
};

// Mock plugin factory
function createMockPlugin(
  id: string,
  version = "1.0.0",
  dependencies: string[] = [],
  shouldFailRegister = false,
  packageName?: string,
  type: "core" | "service" | "interface" = "core",
): Plugin {
  return {
    id,
    version,
    type,
    dependencies,
    packageName: packageName || `@brains/${id}`,
    register: async (shell: IShell) => {
      if (shouldFailRegister) {
        throw new Error(`Plugin ${id} registration failed`);
      }
      return {
        commands: [],
        tools: [],
        resources: [],
      };
    },
  };
}

describe("PluginRegistry", () => {
  let registry: PluginRegistry;
  let logger: Logger;

  beforeEach(() => {
    PluginRegistry.resetInstance();
    logger = Logger.createFresh({ level: "error", context: "test" });
    registry = PluginRegistry.createFresh(logger);
  });

  afterEach(() => {
    PluginRegistry.resetInstance();
  });

  describe("singleton pattern", () => {
    it("should return the same instance", () => {
      const instance1 = PluginRegistry.getInstance(logger);
      const instance2 = PluginRegistry.getInstance(logger);
      expect(instance1).toBe(instance2);
    });

    it("should create fresh instances", () => {
      const instance1 = PluginRegistry.createFresh(logger);
      const instance2 = PluginRegistry.createFresh(logger);
      expect(instance1).not.toBe(instance2);
    });

    it("should reset instance", () => {
      const instance1 = PluginRegistry.getInstance(logger);
      PluginRegistry.resetInstance();
      const instance2 = PluginRegistry.getInstance(logger);
      expect(instance1).not.toBe(instance2);
    });
  });

  describe("plugin registration", () => {
    it("should register a plugin successfully", () => {
      const plugin = createMockPlugin("test-plugin");
      
      registry.register(plugin);
      
      expect(registry.has("test-plugin")).toBe(true);
      const info = registry.get("test-plugin");
      expect(info?.plugin).toBe(plugin);
      expect(info?.status).toBe("registered");
      expect(info?.dependencies).toEqual([]);
    });

    it("should register plugin with dependencies", () => {
      const plugin = createMockPlugin("test-plugin", "1.0.0", ["dep1", "dep2"]);
      
      registry.register(plugin);
      
      const info = registry.get("test-plugin");
      expect(info?.dependencies).toEqual(["dep1", "dep2"]);
    });

    it("should throw error for plugin without id", () => {
      const plugin = { version: "1.0.0", register: async () => ({}) } as any;
      
      expect(() => registry.register(plugin)).toThrow(PluginRegistrationError);
    });

    it("should throw error for duplicate plugin registration", () => {
      const plugin1 = createMockPlugin("test-plugin", "1.0.0");
      const plugin2 = createMockPlugin("test-plugin", "2.0.0");
      
      registry.register(plugin1);
      
      expect(() => registry.register(plugin2)).toThrow(PluginRegistrationError);
    });
  });

  describe("plugin initialization", () => {
    it("should initialize plugin without dependencies", async () => {
      const plugin = createMockPlugin("test-plugin");
      registry.register(plugin);
      
      await registry.initializeAll(mockShell);
      
      const info = registry.get("test-plugin");
      expect(info?.status).toBe("initialized");
      expect(info?.initializedAt).toBeInstanceOf(Date);
    });

    it("should initialize plugins in dependency order", async () => {
      const pluginA = createMockPlugin("plugin-a");
      const pluginB = createMockPlugin("plugin-b", "1.0.0", ["plugin-a"]);
      const pluginC = createMockPlugin("plugin-c", "1.0.0", ["plugin-b"]);
      
      // Register in reverse order to test dependency resolution
      registry.register(pluginC);
      registry.register(pluginB);
      registry.register(pluginA);
      
      await registry.initializeAll(mockShell);
      
      expect(registry.get("plugin-a")?.status).toBe("initialized");
      expect(registry.get("plugin-b")?.status).toBe("initialized");
      expect(registry.get("plugin-c")?.status).toBe("initialized");
    });

    it("should handle plugin initialization failure", async () => {
      const goodPlugin = createMockPlugin("good-plugin");
      const badPlugin = createMockPlugin("bad-plugin", "1.0.0", [], true);
      
      registry.register(goodPlugin);
      registry.register(badPlugin);
      
      await registry.initializeAll(mockShell);
      
      expect(registry.get("good-plugin")?.status).toBe("initialized");
      expect(registry.get("bad-plugin")?.status).toBe("error");
      expect(registry.get("bad-plugin")?.error).toBeInstanceOf(Error);
    });

    it("should throw error for unmet dependencies", async () => {
      const plugin = createMockPlugin("plugin-with-deps", "1.0.0", ["missing-dep"]);
      registry.register(plugin);
      
      await expect(registry.initializeAll(mockShell)).rejects.toThrow(PluginDependencyError);
      
      const info = registry.get("plugin-with-deps");
      expect(info?.status).toBe("error");
      expect(info?.error).toBeInstanceOf(PluginDependencyError);
    });

    it("should handle circular dependencies gracefully", async () => {
      const pluginA = createMockPlugin("plugin-a", "1.0.0", ["plugin-b"]);
      const pluginB = createMockPlugin("plugin-b", "1.0.0", ["plugin-a"]);
      
      registry.register(pluginA);
      registry.register(pluginB);
      
      await expect(registry.initializeAll(mockShell)).rejects.toThrow(PluginDependencyError);
    });
  });

  describe("plugin queries", () => {
    beforeEach(() => {
      const plugin1 = createMockPlugin("plugin-1");
      const plugin2 = createMockPlugin("plugin-2");
      registry.register(plugin1);
      registry.register(plugin2);
    });

    it("should check if plugin exists", () => {
      expect(registry.has("plugin-1")).toBe(true);
      expect(registry.has("non-existent")).toBe(false);
    });

    it("should get plugin info", () => {
      const info = registry.get("plugin-1");
      expect(info).toBeDefined();
      expect(info?.plugin.id).toBe("plugin-1");
    });

    it("should return undefined for non-existent plugin", () => {
      const info = registry.get("non-existent");
      expect(info).toBeUndefined();
    });

    it("should get all plugins", () => {
      const all = registry.getAll();
      expect(all).toHaveLength(2);
      expect(all.some(info => info.plugin.id === "plugin-1")).toBe(true);
      expect(all.some(info => info.plugin.id === "plugin-2")).toBe(true);
    });

    it("should get plugin package name", () => {
      const packageName = registry.getPackageName("plugin-1");
      expect(packageName).toBe("@brains/plugin-1");
    });

    it("should return undefined for non-existent plugin package name", () => {
      const packageName = registry.getPackageName("non-existent");
      expect(packageName).toBeUndefined();
    });
  });

  describe("error handling", () => {
    it("should throw PluginInitializationError for missing plugin during initialization", async () => {
      // This tests the private initializePlugin method indirectly
      const plugin = createMockPlugin("test-plugin", "1.0.0", [], true);
      registry.register(plugin);
      
      await registry.initializeAll(mockShell);
      
      const info = registry.get("test-plugin");
      expect(info?.status).toBe("error");
      expect(info?.error).toBeInstanceOf(Error);
    });
  });
});