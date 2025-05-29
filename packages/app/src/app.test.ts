import { describe, it, expect, mock } from "bun:test";
import { App } from "./app.js";
import { appConfigSchema } from "./types.js";
import type { Shell } from "@brains/shell";

// Create a mock Shell
const createMockShell = (): Shell => {
  return {
    initialize: mock(() => Promise.resolve()),
    getMcpServer: mock(() => ({})),
  } as unknown as Shell;
};

describe("App", () => {
  describe("create", () => {
    it("should create an app with default config", () => {
      const mockShell = createMockShell();
      const app = App.create({}, mockShell);
      expect(app).toBeDefined();
      expect(app.getShell()).toBe(mockShell);
    });

    it("should create an app with custom config", () => {
      const mockShell = createMockShell();
      const app = App.create(
        {
          name: "test-app",
          version: "2.0.0",
          database: "/tmp/test.db",
          transport: { type: "http", port: 8080, host: "localhost" },
          aiApiKey: "test-key",
          logLevel: "debug",
        },
        mockShell,
      );
      expect(app).toBeDefined();
    });

    it("should parse config with defaults", () => {
      const config = appConfigSchema.parse({});
      expect(config.name).toBe("brain-app");
      expect(config.version).toBe("1.0.0");
      expect(config.transport).toEqual({ type: "stdio" });
    });

    it("should validate config schema", () => {
      // Valid configs
      expect(() => {
        appConfigSchema.parse({
          name: "test",
          version: "1.0.0",
          transport: { type: "stdio" },
        });
      }).not.toThrow();

      expect(() => {
        appConfigSchema.parse({
          transport: { type: "http", port: 3000, host: "localhost" },
        });
      }).not.toThrow();

      // Invalid transport type
      expect(() => {
        appConfigSchema.parse({
          transport: { type: "invalid" },
        });
      }).toThrow();

      // HTTP transport with defaults should work
      const httpConfig = appConfigSchema.parse({
        transport: { type: "http" },
      });
      expect(httpConfig.transport).toEqual({
        type: "http",
        port: 3000,
        host: "localhost",
      });
    });
  });

  describe("lifecycle", () => {
    it("should throw if starting before initialization", async () => {
      const mockShell = createMockShell();
      const app = App.create({}, mockShell);

      // eslint-disable-next-line @typescript-eslint/await-thenable
      await expect(app.start()).rejects.toThrow("App not initialized");
    });

    it("should handle stop gracefully without initialization", async () => {
      const mockShell = createMockShell();
      const app = App.create({}, mockShell);

      // Should not throw even without initialization
      // eslint-disable-next-line @typescript-eslint/await-thenable
      await expect(app.stop()).resolves.toBeUndefined();
    });

    it("should initialize shell during app initialization", async () => {
      const mockShell = createMockShell();
      const app = App.create({ logLevel: "error" }, mockShell);

      await app.initialize();

      expect(mockShell.initialize).toHaveBeenCalled();
      expect(mockShell.getMcpServer).toHaveBeenCalled();
    });
  });

  describe("getters", () => {
    it("should provide access to shell", () => {
      const mockShell = createMockShell();
      const app = App.create({}, mockShell);
      expect(app.getShell()).toBe(mockShell);
    });

    it("should return null for server before initialization", () => {
      const mockShell = createMockShell();
      const app = App.create({}, mockShell);
      expect(app.getServer()).toBeNull();
    });
  });

  describe("run", () => {
    it("should have static run method", () => {
      expect(typeof App.run).toBe("function");
    });

    it("should have instance run method", () => {
      const mockShell = createMockShell();
      const app = App.create({}, mockShell);
      expect(typeof app.run).toBe("function");
    });
  });
});
