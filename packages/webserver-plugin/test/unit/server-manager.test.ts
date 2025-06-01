import { describe, it, expect, beforeEach, mock, afterEach } from "bun:test";
import { ServerManager } from "../../src/server-manager";
import { createSilentLogger } from "@brains/utils";
import { mkdirSync, existsSync, rmSync, writeFileSync } from "fs";
import { join } from "path";

// Type for mocking Bun
type BunWithServe = { serve: typeof Bun.serve };

describe("ServerManager", () => {
  let serverManager: ServerManager;
  let testDistDir: string;
  let originalBunServe: typeof Bun.serve;

  beforeEach(() => {
    // Create a temporary dist directory
    testDistDir = join(import.meta.dir, "test-dist");
    if (existsSync(testDistDir)) {
      rmSync(testDistDir, { recursive: true });
    }
    mkdirSync(testDistDir, { recursive: true });

    // Create some test files
    writeFileSync(
      join(testDistDir, "index.html"),
      "<html><body>Test</body></html>",
    );
    writeFileSync(
      join(testDistDir, "404.html"),
      "<html><body>Not Found</body></html>",
    );

    // Save original Bun.serve
    originalBunServe = Bun.serve;

    serverManager = new ServerManager({
      logger: createSilentLogger("test"),
      distDir: testDistDir,
      previewPort: 4321,
      productionPort: 8080,
    });
  });

  afterEach(async () => {
    // Restore original Bun.serve
    (Bun as unknown as BunWithServe).serve = originalBunServe;

    // Stop any running servers
    await serverManager.stopAll();

    // Cleanup
    if (existsSync(testDistDir)) {
      rmSync(testDistDir, { recursive: true });
    }
  });

  describe("startPreviewServer", () => {
    it("should start preview server with correct configuration", async () => {
      const mockFetch = mock(() => Promise.resolve());
      const mockServer = {
        port: 4321,
        fetch: mockFetch,
        stop: mock(() => Promise.resolve()),
      };

      // Mock Bun.serve
      (Bun as unknown as BunWithServe).serve = mock((options: unknown) => {
        expect((options as { port: number }).port).toBe(4321);
        // hostname is optional in Bun.serve
        return mockServer;
      }) as unknown as typeof Bun.serve;

      const url = await serverManager.startPreviewServer();

      expect(url).toBe("http://localhost:4321");
      expect((Bun as unknown as BunWithServe).serve).toHaveBeenCalled();
    });

    it("should return existing URL if preview server is already running", async () => {
      const mockServer = {
        port: 4321,
        fetch: mock(() => Promise.resolve()),
        stop: mock(() => {}),
      };

      (Bun as unknown as BunWithServe).serve = mock(
        () => mockServer,
      ) as unknown as typeof Bun.serve;

      // Start server first time
      await serverManager.startPreviewServer();

      // Try to start again - should return existing URL
      const url = await serverManager.startPreviewServer();
      expect(url).toBe("http://localhost:4321");
    });

    it("should handle missing index.html", async () => {
      // Remove index.html
      rmSync(join(testDistDir, "index.html"));

      const mockServer = {
        port: 4321,
        fetch: mock(() => Promise.resolve()),
        stop: mock(() => Promise.resolve()),
      };

      // const originalServe = Bun.serve; // Not used
      (Bun as unknown as BunWithServe).serve = mock(
        () => mockServer,
      ) as unknown as typeof Bun.serve;

      await serverManager.startPreviewServer();

      // Should still start even without index.html
      expect((Bun as unknown as BunWithServe).serve).toHaveBeenCalled();
    });
  });

  describe("startProductionServer", () => {
    it("should start production server with compression and caching", async () => {
      const mockServer = {
        port: 8080,
        fetch: mock(() => Promise.resolve()),
        stop: mock(() => Promise.resolve()),
      };

      (Bun as unknown as BunWithServe).serve = mock((options: unknown) => {
        expect((options as { port: number }).port).toBe(8080);
        // hostname is optional in Bun.serve
        return mockServer;
      }) as unknown as typeof Bun.serve;

      const url = await serverManager.startProductionServer();

      expect(url).toBe("http://localhost:8080");
      expect((Bun as unknown as BunWithServe).serve).toHaveBeenCalled();
    });

    it("should return existing URL if production server is already running", async () => {
      const mockServer = {
        port: 8080,
        fetch: mock(() => Promise.resolve()),
        stop: mock(() => {}),
      };

      (Bun as unknown as BunWithServe).serve = mock(
        () => mockServer,
      ) as unknown as typeof Bun.serve;

      // Start server first time
      await serverManager.startProductionServer();

      // Try to start again - should return existing URL
      const url = await serverManager.startProductionServer();
      expect(url).toBe("http://localhost:8080");
    });
  });

  describe("stopServer", () => {
    it("should stop preview server", async () => {
      const mockStop = mock(() => {});
      const mockServer = {
        port: 4321,
        fetch: mock(() => Promise.resolve()),
        stop: mockStop,
      };

      (Bun as unknown as BunWithServe).serve = mock(
        () => mockServer,
      ) as unknown as typeof Bun.serve;

      // Start server first
      await serverManager.startPreviewServer();

      // Then stop it
      await serverManager.stopServer("preview");

      expect(mockStop).toHaveBeenCalled();

      // Check status shows server is stopped
      const status = serverManager.getStatus();
      expect(status.preview).toBe(false);
    });

    it("should stop production server", async () => {
      const mockStop = mock(() => {});
      const mockServer = {
        port: 8080,
        fetch: mock(() => Promise.resolve()),
        stop: mockStop,
      };

      (Bun as unknown as BunWithServe).serve = mock(
        () => mockServer,
      ) as unknown as typeof Bun.serve;

      // Start server first
      await serverManager.startProductionServer();

      // Then stop it
      await serverManager.stopServer("production");

      expect(mockStop).toHaveBeenCalled();

      // Check status shows server is stopped
      const status = serverManager.getStatus();
      expect(status.production).toBe(false);
    });

    it("should not throw if server is not running", async () => {
      // Should not throw
      await serverManager.stopServer("preview");
      await serverManager.stopServer("production");
    });
  });

  describe("stopAll", () => {
    it("should stop all running servers", async () => {
      const mockStopPreview = mock(() => {});
      const mockStopProduction = mock(() => {});

      const mockPreviewServer = {
        port: 4321,
        fetch: mock(() => Promise.resolve()),
        stop: mockStopPreview,
      };

      const mockProductionServer = {
        port: 8080,
        fetch: mock(() => Promise.resolve()),
        stop: mockStopProduction,
      };

      // Mock both servers
      let callCount = 0;
      (Bun as unknown as BunWithServe).serve = mock(() => {
        callCount++;
        return callCount === 1 ? mockPreviewServer : mockProductionServer;
      }) as unknown as typeof Bun.serve;

      // Start both servers
      await serverManager.startPreviewServer();
      await serverManager.startProductionServer();

      // Stop all
      await serverManager.stopAll();

      expect(mockStopPreview).toHaveBeenCalled();
      expect(mockStopProduction).toHaveBeenCalled();

      // Check status shows both servers stopped
      const status = serverManager.getStatus();
      expect(status.preview).toBe(false);
      expect(status.production).toBe(false);
    });

    it("should handle partial server states", async () => {
      const mockStop = mock(() => {});
      const mockServer = {
        port: 4321,
        fetch: mock(() => Promise.resolve()),
        stop: mockStop,
      };

      (Bun as unknown as BunWithServe).serve = mock(
        () => mockServer,
      ) as unknown as typeof Bun.serve;

      // Start only preview server
      await serverManager.startPreviewServer();

      await serverManager.stopAll();

      expect(mockStop).toHaveBeenCalled();

      // Check status
      const status = serverManager.getStatus();
      expect(status.preview).toBe(false);
      expect(status.production).toBe(false);
    });
  });

  describe("getStatus", () => {
    it("should return correct status when no servers are running", () => {
      const status = serverManager.getStatus();

      expect(status).toEqual({
        preview: false,
        production: false,
        previewUrl: undefined,
        productionUrl: undefined,
      });
    });

    it("should return correct status when servers are running", async () => {
      const mockServers = [
        {
          port: 4321,
          fetch: mock(() => Promise.resolve()),
          stop: mock(() => {}),
        },
        {
          port: 8080,
          fetch: mock(() => Promise.resolve()),
          stop: mock(() => {}),
        },
      ];

      let serverIndex = 0;
      (Bun as unknown as BunWithServe).serve = mock(
        () => mockServers[serverIndex++],
      ) as unknown as typeof Bun.serve;

      await serverManager.startPreviewServer();
      await serverManager.startProductionServer();

      const status = serverManager.getStatus();

      expect(status).toEqual({
        preview: true,
        production: true,
        previewUrl: "http://localhost:4321",
        productionUrl: "http://localhost:8080",
      });
    });

    it("should handle mixed server states", async () => {
      const mockServer = {
        port: 4321,
        fetch: mock(() => Promise.resolve()),
        stop: mock(() => {}),
      };

      (Bun as unknown as BunWithServe).serve = mock(
        () => mockServer,
      ) as unknown as typeof Bun.serve;

      await serverManager.startPreviewServer();

      const status = serverManager.getStatus();

      expect(status).toEqual({
        preview: true,
        production: false,
        previewUrl: "http://localhost:4321",
        productionUrl: undefined,
      });
    });
  });

  describe("file serving", () => {
    it("should serve existing files", async () => {
      const mockServer = {
        port: 4321,
        fetch: mock(() => Promise.resolve()),
        stop: mock(() => Promise.resolve()),
      };

      const originalServe = Bun.serve;
      let capturedFetch: unknown;

      (Bun as unknown as BunWithServe).serve = mock((options: unknown) => {
        capturedFetch = (options as { fetch: unknown }).fetch;
        return mockServer;
      }) as unknown as typeof Bun.serve;

      try {
        await serverManager.startPreviewServer();

        // Test serving index.html
        const response = await (
          capturedFetch as (req: Request) => Promise<Response>
        )(new Request("http://localhost:4321/"));
        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toContain("text/html");
      } finally {
        (Bun as unknown as BunWithServe).serve = originalServe;
      }
    });

    it("should return 404 for missing files", async () => {
      const mockServer = {
        port: 4321,
        fetch: mock(() => Promise.resolve()),
        stop: mock(() => Promise.resolve()),
      };

      const originalServe = Bun.serve;
      let capturedFetch: unknown;

      (Bun as unknown as BunWithServe).serve = mock((options: unknown) => {
        capturedFetch = (options as { fetch: unknown }).fetch;
        return mockServer;
      }) as unknown as typeof Bun.serve;

      try {
        await serverManager.startPreviewServer();

        // Test non-existent file
        const response = await (
          capturedFetch as (req: Request) => Promise<Response>
        )(new Request("http://localhost:4321/missing.html"));
        expect(response.status).toBe(404);
      } finally {
        (Bun as unknown as BunWithServe).serve = originalServe;
      }
    });
  });
});
