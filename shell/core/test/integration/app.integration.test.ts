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
            url: `file:${join(tempDir, "brain.db")}`,
          },
          jobQueueDatabase: {
            url: `file:${join(tempDir, "brain-jobs.db")}`,
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
            url: `file:${join(tempDir, "brain.db")}`,
          },
          jobQueueDatabase: {
            url: `file:${join(tempDir, "brain-jobs.db")}`,
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

  describe("service communication", () => {
    let shell: Shell;
    let app: App;

    beforeEach(async () => {
      shell = Shell.createFresh(
        {
          database: {
            url: `file:${join(tempDir, "brain.db")}`,
          },
          jobQueueDatabase: {
            url: `file:${join(tempDir, "brain-jobs.db")}`,
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

      app = App.create(
        {
          name: "test-integration-app",
          database: `file:${join(tempDir, "brain.db")}`,
          logLevel: "error",
        },
        shell,
      );

      await app.initialize();
      await app.start();
    });

    afterEach(async () => {
      await app.stop();
    });

    it("should deliver messages between services", async () => {
      const messageBus = shell.getMessageBus();
      let received = false;
      let messageData: unknown = null;

      // Subscribe to a test channel
      messageBus.subscribe("test-channel", async (data) => {
        received = true;
        messageData = data.payload;
        return { success: true };
      });

      // Send a message
      const response = await messageBus.send(
        "test-channel",
        { test: true },
        "test-sender",
      );

      // Verify message was received
      expect(received).toBe(true);
      expect(messageData).toEqual({ test: true });
      expect(response).toEqual({ success: true });
    });

    it("should access all core services", async () => {
      // This just verifies all services are wired up and accessible
      const entityService = shell.getEntityService();
      const jobQueueService = shell.getJobQueueService();
      const messageBus = shell.getMessageBus();
      const aiService = shell.getAIService();

      expect(entityService).toBeDefined();
      expect(jobQueueService).toBeDefined();
      expect(messageBus).toBeDefined();
      expect(aiService).toBeDefined();
    });
  });
});
