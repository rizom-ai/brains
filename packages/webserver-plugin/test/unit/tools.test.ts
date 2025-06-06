import { describe, expect, test, beforeEach, mock } from "bun:test";
import { webserverTools } from "../../src/tools";
import type { WebserverManager } from "../../src/webserver-manager";
import type { PluginTool } from "@brains/types";

describe("webserverTools", () => {
  let mockManager: WebserverManager;
  let tools: ReturnType<typeof webserverTools>;

  beforeEach(() => {
    // Mock WebserverManager
    mockManager = {
      buildSite: mock(async () => {}),
      startPreviewServer: mock(async () => "http://localhost:4321"),
      startProductionServer: mock(async () => "http://localhost:8080"),
      stopServer: mock(async () => {}),
      preview: mock(async () => "http://localhost:4321"),
      getStatus: mock(() => ({
        hasBuild: true,
        lastBuild: new Date().toISOString(),
        servers: {
          preview: true,
          production: false,
          previewUrl: "http://localhost:4321",
          productionUrl: null,
        },
      })),
    } as unknown as WebserverManager;

    // Get tools
    tools = webserverTools(mockManager);
  });

  describe("build_site", () => {
    const buildSiteTool = (): PluginTool => {
      const tool = tools.find((t) => t.name === "build_site");
      if (!tool) throw new Error("build_site tool not found");
      return tool;
    };

    test("should build site successfully", async () => {
      const tool = buildSiteTool();
      const result = await tool.handler({ clean: false });

      expect(result).toEqual({
        success: true,
        message: "Site built successfully",
        lastBuild: expect.any(String),
      });

      expect(mockManager.buildSite).toHaveBeenCalledWith(undefined);
    });

    test("should handle clean build option", async () => {
      const tool = buildSiteTool();
      const result = await tool.handler({ clean: true });

      expect(result).toEqual({
        success: true,
        message: "Site built successfully",
        lastBuild: expect.any(String),
      });

      expect(mockManager.buildSite).toHaveBeenCalledWith({ clean: true });
    });
  });

  describe("get_site_status", () => {
    const getStatusTool = (): PluginTool => {
      const tool = tools.find((t) => t.name === "get_site_status");
      if (!tool) throw new Error("get_site_status tool not found");
      return tool;
    };

    test("should return site status", async () => {
      const tool = getStatusTool();
      const result = await tool.handler({});

      expect(result).toEqual({
        hasBuild: true,
        lastBuild: expect.any(String),
        servers: {
          preview: {
            running: true,
            url: "http://localhost:4321",
          },
          production: {
            running: false,
            url: null,
          },
        },
      });
    });
  });
});
