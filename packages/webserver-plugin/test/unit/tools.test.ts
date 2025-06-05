import { describe, expect, test, beforeEach, mock } from "bun:test";
import { webserverTools } from "../../src/tools";
import type { WebserverManager } from "../../src/webserver-manager";
import type { Registry, EntityService, BaseEntity, PluginTool } from "@brains/types";

describe("webserverTools", () => {
  let mockManager: WebserverManager;
  let mockRegistry: Registry;
  let mockEntityService: EntityService;
  let tools: ReturnType<typeof webserverTools>;

  beforeEach(() => {
    // Mock EntityService
    mockEntityService = {
      createEntity: mock(async (entity: Partial<BaseEntity>) => ({
        ...entity,
        id: "generated-id-123",
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      })),
    } as unknown as EntityService;

    // Mock Registry
    mockRegistry = {
      resolve: mock((name: string) => {
        if (name === "entityService") {
          return mockEntityService;
        }
        throw new Error(`Unknown service: ${name}`);
      }),
    } as unknown as Registry;

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
    tools = webserverTools(mockManager, mockRegistry);
  });

  describe("capture_generated_content", () => {
    const captureContentTool = (): PluginTool => {
      const tool = tools.find((t) => t.name === "capture_generated_content");
      if (!tool) throw new Error("capture_generated_content tool not found");
      return tool;
    };

    test("should capture content successfully", async () => {
      const tool = captureContentTool();
      const input = {
        page: "landing",
        section: "hero",
        data: {
          headline: "Test Headline",
          subheadline: "Test Subheadline",
          ctaText: "Get Started",
          ctaLink: "/dashboard",
        },
      };

      const result = await tool.handler(input);

      expect(result).toEqual({
        success: true,
        message: "Content captured as entity generated-id-123",
        entityId: "generated-id-123",
      });

      // Verify createEntity was called with correct data
      expect(mockEntityService.createEntity).toHaveBeenCalledWith({
        entityType: "site-content",
        content: "Generated content for landing page, hero section",
        page: "landing",
        section: "hero",
        data: input.data,
        created: expect.any(String),
        updated: expect.any(String),
      });
    });

    test("should handle errors gracefully", async () => {
      const tool = captureContentTool();

      // Mock createEntity to throw an error
      mockEntityService.createEntity = mock(async () => {
        throw new Error("Database error");
      });

      const input = {
        page: "landing",
        section: "hero",
        data: {
          headline: "Test",
          subheadline: "Test",
          ctaText: "Test",
          ctaLink: "/test",
        },
      };

      const result = await tool.handler(input);

      expect(result).toEqual({
        success: false,
        error: "Database error",
      });
    });

    test("should validate input schema", () => {
      const tool = captureContentTool();

      // The inputSchema should be properly defined
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema["page"]).toBeDefined();
      expect(tool.inputSchema["section"]).toBeDefined();
      expect(tool.inputSchema["data"]).toBeDefined();
    });
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
