import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { App } from "@brains/app";
import { Shell } from "@brains/shell";
import { StdioMCPServer, StreamableHTTPServer } from "@brains/mcp-server";
import { createTestDatabase } from "./helpers/test-db.js";

describe("App Integration", () => {
  let dbPath: string;

  beforeEach(async () => {
    // Get a unique test database for each test
    const testDb = await createTestDatabase();
    dbPath = testDb.dbPath;

    // Reset singletons
    Shell.resetInstance();
    StdioMCPServer.resetInstance();
    StreamableHTTPServer.resetInstance();
  });

  afterEach(() => {
    // Clean up
    Shell.resetInstance();
    StdioMCPServer.resetInstance();
    StreamableHTTPServer.resetInstance();
  });

  describe("stdio transport", () => {
    it("should create and initialize app with stdio transport", async () => {
      const app = App.create({
        name: "test-stdio-app",
        database: `file:${dbPath}`,
        logLevel: "error", // Reduce noise
        shellConfig: {
          features: {
            enablePlugins: false,
            runMigrationsOnInit: true,
          },
        },
      });

      await app.initialize();

      const server = app.getServer();
      expect(server).toBeInstanceOf(StdioMCPServer);
      expect(app.getShell()).toBeInstanceOf(Shell);

      await app.stop();
    });
  });

  describe("HTTP transport", () => {
    it("should create and initialize app with HTTP transport", async () => {
      const app = App.create({
        name: "test-http-app",
        database: `file:${dbPath}`,
        logLevel: "error", // Reduce noise
        transport: {
          type: "http",
          port: 0, // Use random port
          host: "localhost",
        },
        shellConfig: {
          features: {
            enablePlugins: false,
            runMigrationsOnInit: true,
          },
        },
      });

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
      const app = App.create({
        name: "test-lifecycle-app",
        database: `file:${dbPath}`,
        transport: {
          type: "http",
          port: 0,
          host: "localhost",
        },
        logLevel: "error", // Reduce noise
      });

      // Initialize
      await app.initialize();
      expect(app.getServer()).toBeDefined();

      // Start
      await app.start();

      // Get shell and verify it's working
      const shell = app.getShell();
      const mcpServer = shell.getMcpServer();
      expect(mcpServer).toBeDefined();

      // Stop
      await app.stop();
    });
  });
});
