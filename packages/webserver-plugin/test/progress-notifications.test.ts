import { describe, it, expect, beforeEach, mock } from "bun:test";
import type { PluginTool } from "@brains/types";
import { webserverTools } from "../src/tools";
import type { WebserverManager } from "../src/webserver-manager";

describe("Progress Notifications", () => {
  let mockManager: WebserverManager;
  let tools: PluginTool[];

  beforeEach(() => {
    // Create a mock WebserverManager
    mockManager = {
      buildSite: mock(() => Promise.resolve()),
      preview: mock(() => Promise.resolve("http://localhost:3000")),
      getStatus: mock(() => ({
        hasBuild: true,
        lastBuild: new Date().toISOString(),
        servers: {
          preview: false,
          production: false,
          previewUrl: undefined,
          productionUrl: undefined,
        },
      })),
    } as unknown as WebserverManager;

    tools = webserverTools(mockManager);
  });

  it("should pass progress callback to buildSite when context is provided", async () => {
    const buildSiteTool = tools.find((t) => t.name === "build_site");
    expect(buildSiteTool).toBeDefined();

    const mockSendProgress = mock(() => Promise.resolve());
    const progressContext = {
      progressToken: "test-token",
      sendProgress: mockSendProgress,
    };

    await buildSiteTool!.handler({ clean: false }, progressContext);

    // Verify buildSite was called with the progress callback
    expect(mockManager.buildSite).toHaveBeenCalledWith(
      undefined,
      mockSendProgress,
    );
  });

  it("should work without progress context", async () => {
    const buildSiteTool = tools.find((t) => t.name === "build_site");
    expect(buildSiteTool).toBeDefined();

    const result = await buildSiteTool!.handler({ clean: true });

    // Verify buildSite was called without progress callback
    expect(mockManager.buildSite).toHaveBeenCalledWith(
      { clean: true },
      undefined,
    );

    expect(result).toMatchObject({
      success: true,
      message: "Site built successfully",
    });
  });

  it("should send progress notifications during build", async () => {
    const progressNotifications: Array<{
      progress: number;
      total?: number;
      message?: string;
    }> = [];

    const mockSendProgress = mock(async (notification) => {
      progressNotifications.push(notification);
    });

    // Override the mock to actually call the progress callback
    mockManager.buildSite = mock(async (_options, sendProgress) => {
      // Simulate progress notifications
      await sendProgress?.({ progress: 0, total: 6, message: "Starting" });
      await sendProgress?.({
        progress: 1,
        total: 6,
        message: "Copying template files",
      });
      await sendProgress?.({
        progress: 2,
        total: 6,
        message: "Generating TypeScript schemas",
      });
    });

    const buildSiteTool = tools.find((t) => t.name === "build_site");
    const progressContext = {
      progressToken: "test-token",
      sendProgress: mockSendProgress,
    };

    await buildSiteTool!.handler({ clean: false }, progressContext);

    // Verify progress notifications were sent
    expect(progressNotifications).toHaveLength(3);
    expect(progressNotifications[0]).toMatchObject({
      progress: 0,
      total: 6,
      message: "Starting",
    });
    expect(progressNotifications[1]).toMatchObject({
      progress: 1,
      total: 6,
      message: "Copying template files",
    });
  });

  it("should pass progress callback to preview method", async () => {
    const previewTool = tools.find((t) => t.name === "preview_site");
    expect(previewTool).toBeDefined();

    const mockSendProgress = mock(() => Promise.resolve());
    const progressContext = {
      progressToken: "test-token",
      sendProgress: mockSendProgress,
    };

    await previewTool!.handler({}, progressContext);

    // Verify preview was called with the progress callback
    expect(mockManager.preview).toHaveBeenCalledWith(mockSendProgress);
  });
});