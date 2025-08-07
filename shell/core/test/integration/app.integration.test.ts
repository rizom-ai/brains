import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { App } from "@brains/app";
import { Shell } from "../../src/shell";
import { EntityRegistry } from "@brains/entity-service";
import { createMockAIService } from "@brains/ai-service/test";
import { createSilentLogger } from "@brains/utils";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

describe("App Integration", () => {
  let tempDir: string;

  beforeEach(async () => {
    // Create a unique temporary directory for each test
    tempDir = await mkdtemp(join(tmpdir(), "brain-integration-test-"));

    // Reset singletons
    await Shell.resetInstance();
    EntityRegistry.resetInstance();
  });

  afterEach(async () => {
    // Clean up
    await Shell.resetInstance();
    EntityRegistry.resetInstance();
    
    // Remove temporary directory
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  describe("basic app lifecycle", () => {
    it("should create and initialize app", async () => {
      // Create shell with mock AI service and silent logger
      // Let each service create its own database
      const shell = Shell.createFresh(
        {
          database: { 
            url: `file:${join(tempDir, "brain.db")}` 
          },
          jobQueueDatabase: {
            url: `file:${join(tempDir, "brain-jobs.db")}`
          },
          features: {
            enablePlugins: false,
          },
        },
        {
          aiService: createMockAIService(),
          logger: createSilentLogger("integration-test"),
        },
      );

      const app = App.create(
        {
          name: "test-app",
          database: `file:${join(tempDir, "brain.db")}`,
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
      // Create shell with mock AI service and silent logger
      // Let each service create its own database
      const shell = Shell.createFresh(
        {
          database: { 
            url: `file:${join(tempDir, "brain.db")}` 
          },
          jobQueueDatabase: {
            url: `file:${join(tempDir, "brain-jobs.db")}`
          },
          features: {
            enablePlugins: false,
          },
        },
        {
          aiService: createMockAIService(),
          logger: createSilentLogger("integration-test"),
        },
      );

      const app = App.create(
        {
          name: "test-lifecycle-app",
          database: `file:${join(tempDir, "brain.db")}`,
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