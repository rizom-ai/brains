import { describe, expect, it, beforeEach } from "bun:test";
import { Shell } from "@/shell";
import { Database } from "bun:sqlite";
import { createSilentLogger } from "@personal-brain/utils";
import { Registry } from "@/registry/registry";
import { EntityRegistry } from "@/entity/entityRegistry";
import { SchemaRegistry } from "@/schema/schemaRegistry";
import { MessageBus } from "@/messaging/messageBus";
import { PluginManager } from "@/plugins/pluginManager";
import { EntityService } from "@/entity/entityService";
import { QueryProcessor } from "@/query/queryProcessor";
import { BrainProtocol } from "@/protocol/brainProtocol";

describe("Shell", () => {
  beforeEach(() => {
    // Reset all singletons before each test
    Shell.resetInstance();
    Registry.resetInstance();
    EntityRegistry.resetInstance();
    SchemaRegistry.resetInstance();
    MessageBus.resetInstance();
    PluginManager.resetInstance();
    EntityService.resetInstance();
    QueryProcessor.resetInstance();
    BrainProtocol.resetInstance();
  });

  describe("initialization", () => {
    it("should start uninitialized", () => {
      const db = new Database(":memory:");
      const logger = createSilentLogger();
      const shell = Shell.createFresh({ db, logger });
      
      expect(shell.isInitialized()).toBe(false);
      
      shell.shutdown();
      db.close();
    });

    it("should initialize successfully", async () => {
      const db = new Database(":memory:");
      const logger = createSilentLogger();
      const shell = Shell.createFresh({ db, logger });
      
      await shell.initialize();
      expect(shell.isInitialized()).toBe(true);
      
      shell.shutdown();
      db.close();
    });
  });

  describe("query processing", () => {
    it("should process queries after initialization", async () => {
      const db = new Database(":memory:");
      const logger = createSilentLogger();
      const shell = Shell.createFresh({ db, logger });
      await shell.initialize();
      
      const result = await shell.query("test query");
      
      expect(result).toBeDefined();
      expect(result.answer).toBeDefined();
      expect(result.citations).toBeArray();
      expect(result.relatedEntities).toBeArray();
      
      shell.shutdown();
      db.close();
    });

    it("should reject queries before initialization", async () => {
      const db = new Database(":memory:");
      const logger = createSilentLogger();
      const shell = Shell.createFresh({ db, logger });
      
      // eslint-disable-next-line @typescript-eslint/await-thenable
      await expect(shell.query("test query")).rejects.toThrow(
        "Shell not initialized"
      );
      
      shell.shutdown();
      db.close();
    });

    it("should process queries with options", async () => {
      const db = new Database(":memory:");
      const logger = createSilentLogger();
      const shell = Shell.createFresh({ db, logger });
      await shell.initialize();
      
      const result = await shell.query("test query", {
        userId: "user123",
        conversationId: "conv456",
        metadata: { source: "test" }
      });
      
      expect(result).toBeDefined();
      
      shell.shutdown();
      db.close();
    });
  });

  describe("command execution", () => {
    it("should execute commands after initialization", async () => {
      const db = new Database(":memory:");
      const logger = createSilentLogger();
      const shell = Shell.createFresh({ db, logger });
      await shell.initialize();
      
      const result = await shell.executeCommand({
        id: "test-123",
        command: "help",
      });
      
      expect(result).toBeDefined();
      expect(result.commandId).toBe("test-123");
      expect(result.success).toBe(true);
      
      shell.shutdown();
      db.close();
    });

    it("should reject commands before initialization", async () => {
      const db = new Database(":memory:");
      const logger = createSilentLogger();
      const shell = Shell.createFresh({ db, logger });
      
      // eslint-disable-next-line @typescript-eslint/await-thenable
      await expect(shell.executeCommand({
        id: "test-123",
        command: "help",
      })).rejects.toThrow("Shell not initialized");
      
      shell.shutdown();
      db.close();
    });
  });

  describe("plugin registration", () => {
    it("should register plugins after initialization", async () => {
      const db = new Database(":memory:");
      const logger = createSilentLogger();
      const shell = Shell.createFresh({ db, logger });
      await shell.initialize();
      
      const mockPlugin = {
        id: "test-plugin",
        name: "Test Plugin",
        version: "1.0.0",
        register: (): void => {},
      };
      
      // Should not throw
      shell.registerPlugin(mockPlugin);
      
      shell.shutdown();
      db.close();
    });

    it("should reject plugin registration before initialization", () => {
      const db = new Database(":memory:");
      const logger = createSilentLogger();
      const shell = Shell.createFresh({ db, logger });
      
      const mockPlugin = {
        id: "test-plugin",
        name: "Test Plugin",
        version: "1.0.0",
        register: (): void => {},
      };
      
      expect(() => shell.registerPlugin(mockPlugin)).toThrow(
        "Shell not initialized"
      );
      
      shell.shutdown();
      db.close();
    });
  });

  describe("shutdown", () => {
    it("should clean up resources on shutdown", async () => {
      const db = new Database(":memory:");
      const logger = createSilentLogger();
      const shell = Shell.createFresh({ db, logger });
      
      await shell.initialize();
      expect(shell.isInitialized()).toBe(true);
      
      shell.shutdown();
      expect(shell.isInitialized()).toBe(false);
      
      db.close();
    });

    it("should reject operations after shutdown", async () => {
      const db = new Database(":memory:");
      const logger = createSilentLogger();
      const shell = Shell.createFresh({ db, logger });
      
      await shell.initialize();
      shell.shutdown();
      
      // eslint-disable-next-line @typescript-eslint/await-thenable
      await expect(shell.query("test")).rejects.toThrow("Shell not initialized");
      
      db.close();
    });
  });
});