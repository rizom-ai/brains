import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { App } from "@brains/app";
import { Shell } from "@brains/core";
import { EntityRegistry } from "@brains/entity-service";
import { createTestDatabase } from "./helpers/test-db.js";
import { createMockAIService } from "./helpers/mock-ai-service.js";

describe("App Integration", () => {
  let dbPath: string;

  beforeEach(async () => {
    // Get a unique test database for each test
    const testDb = await createTestDatabase();
    dbPath = testDb.dbPath;

    // Reset singletons
    await Shell.resetInstance();
    EntityRegistry.resetInstance();
  });

  afterEach(async () => {
    // Clean up
    await Shell.resetInstance();
    EntityRegistry.resetInstance();
  });

  describe("basic app lifecycle", () => {
    it("should create and initialize app", async () => {
      // Create shell with mock AI service
      const shell = Shell.createFresh(
        {
          database: { url: `file:${dbPath}` },
          features: {
            enablePlugins: false,
          },
        },
        {
          aiService: createMockAIService(),
        },
      );

      const app = App.create(
        {
          name: "test-app",
          database: `file:${dbPath}`,
          logLevel: "error", // Reduce noise
        },
        shell,
      );

      await app.initialize();

      expect(app.getShell()).toBeInstanceOf(Shell);

      await app.stop();
    });
  });


  describe("full lifecycle", () => {
    it("should handle complete app lifecycle", async () => {
      // Create shell with mock AI service
      const shell = Shell.createFresh(
        {
          database: { url: `file:${dbPath}` },
          features: {
            enablePlugins: false,
          },
        },
        {
          aiService: createMockAIService(),
        },
      );

      const app = App.create(
        {
          name: "test-lifecycle-app",
          database: `file:${dbPath}`,
          logLevel: "error", // Reduce noise
        },
        shell,
      );

      // Initialize
      await app.initialize();

      // Start
      await app.start();

      // Get shell and verify it's working
      const appShell = app.getShell();
      expect(appShell).toBeDefined();

      // Stop
      await app.stop();
    });
  });
});
