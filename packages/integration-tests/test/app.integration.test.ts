import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { App } from "@brains/app";
import { Shell } from "@brains/shell";
import { EntityRegistry } from "@brains/shell/src/entity/entityRegistry";
import { StdioMCPServer, StreamableHTTPServer } from "@brains/mcp-server";
import { createTestDatabase } from "./helpers/test-db.js";
import { createMockAIService } from "./helpers/mock-ai-service.js";

describe("App Integration", () => {
  let dbPath: string;

  beforeEach(async () => {
    // Get a unique test database for each test
    const testDb = await createTestDatabase();
    dbPath = testDb.dbPath;

    // Reset singletons
    Shell.resetInstance();
    EntityRegistry.resetInstance();
    StdioMCPServer.resetInstance();
    StreamableHTTPServer.resetInstance();
  });

  afterEach(() => {
    // Clean up
    Shell.resetInstance();
    EntityRegistry.resetInstance();
    StdioMCPServer.resetInstance();
    StreamableHTTPServer.resetInstance();
  });

  describe("stdio transport", () => {
    it("should create and initialize app with stdio transport", async () => {
      // Create shell with mock AI service
      const shell = Shell.createFresh(
        {
          database: { url: `file:${dbPath}` },
          features: {
            enablePlugins: false,
            runMigrationsOnInit: true,
          },
        },
        {
          aiService: createMockAIService(),
        }
      );

      const app = App.create({
        name: "test-stdio-app",
        database: `file:${dbPath}`,
        logLevel: "error", // Reduce noise
      }, shell);

      await app.initialize();

      const server = app.getServer();
      expect(server).toBeInstanceOf(StdioMCPServer);
      expect(app.getShell()).toBeInstanceOf(Shell);

      await app.stop();
    });
  });

  describe("HTTP transport", () => {
    it("should create and initialize app with HTTP transport", async () => {
      // Create shell with mock AI service
      const shell = Shell.createFresh(
        {
          database: { url: `file:${dbPath}` },
          features: {
            enablePlugins: false,
            runMigrationsOnInit: true,
          },
        },
        {
          aiService: createMockAIService(),
        }
      );

      const app = App.create({
        name: "test-http-app",
        database: `file:${dbPath}`,
        logLevel: "error", // Reduce noise
        transport: {
          type: "http",
          port: 0, // Use random port
          host: "localhost",
        },
      }, shell);

      await app.initialize();

      const server = app.getServer();
      expect(server).toBeInstanceOf(StreamableHTTPServer);
      expect(app.getShell()).toBeInstanceOf(Shell);

      // Test that we can start and stop the server
      await app.start();
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
            runMigrationsOnInit: true,
          },
        },
        {
          aiService: createMockAIService(),
        }
      );

      const app = App.create({
        name: "test-lifecycle-app",
        database: `file:${dbPath}`,
        transport: {
          type: "http",
          port: 0,
          host: "localhost",
        },
        logLevel: "error", // Reduce noise
      }, shell);

      // Initialize
      await app.initialize();
      expect(app.getServer()).toBeDefined();

      // Start
      await app.start();

      // Get shell and verify it's working
      const appShell = app.getShell();
      const mcpServer = appShell.getMcpServer();
      expect(mcpServer).toBeDefined();

      // Stop
      await app.stop();
    });
  });
});
