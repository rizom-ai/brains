import { describe, it, expect, mock } from "bun:test";
import { App } from "../src/app";
import { appConfigSchema } from "../src/types";
import type { Shell } from "@brains/core";

// Create a mock Shell
const createMockShell = (): Shell => {
  return {
    initialize: mock(() => Promise.resolve()),
    getPluginManager: mock(() => ({
      registerPlugin: mock(() => {}),
    })),
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
    });

    it("should validate config schema", () => {
      // Valid configs
      expect(() => {
        appConfigSchema.parse({
          name: "test",
          version: "1.0.0",
        });
      }).not.toThrow();

      expect(() => {
        appConfigSchema.parse({
          logLevel: "debug",
        });
      }).not.toThrow();
    });
  });

  describe("lifecycle", () => {
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
    });
  });

  describe("getters", () => {
    it("should provide access to shell", () => {
      const mockShell = createMockShell();
      const app = App.create({}, mockShell);
      expect(app.getShell()).toBe(mockShell);
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

  describe("identity configuration", () => {
    it("should accept identity in app config", () => {
      const mockShell = createMockShell();
      const customIdentity = {
        name: "Test Assistant",
        role: "Technical assistant",
        purpose: "Help with technical tasks",
        values: ["precision", "efficiency"],
      };

      const app = App.create(
        {
          identity: customIdentity,
        },
        mockShell,
      );

      expect(app).toBeDefined();
    });

    it("should work without identity config (using default)", () => {
      const mockShell = createMockShell();
      const app = App.create({}, mockShell);
      expect(app).toBeDefined();
    });
  });
});
