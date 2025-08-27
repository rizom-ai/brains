import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
  mock,
  spyOn,
} from "bun:test";
import { SiteContentGenerationJobHandler } from "./site-content-generation-handler";
import {
  createServicePluginHarness,
  createServicePluginContext,
  type ServicePluginContext,
  type ProgressReporter,
} from "@brains/plugins";
import { SiteBuilderPlugin } from "../plugin";

describe("SiteContentGenerationJobHandler", () => {
  let handler: SiteContentGenerationJobHandler;
  let harness: ReturnType<typeof createServicePluginHarness<SiteBuilderPlugin>>;
  let context: ServicePluginContext;
  let mockProgressReporter: Partial<ProgressReporter>;

  beforeEach(async () => {
    harness = createServicePluginHarness<SiteBuilderPlugin>();

    // Install a basic plugin
    const plugin = new SiteBuilderPlugin({
      templates: {
        "test-template": {
          name: "test-template",
          description: "Test template",
          requiredPermission: "public",
          schema: {} as never,
          formatter: (data: unknown): string =>
            `# Test Content\n\n${JSON.stringify(data)}`,
        },
      },
    });

    await harness.installPlugin(plugin);
    const shell = harness.getShell();
    context = createServicePluginContext(shell, "site-builder");

    // Mock getTemplateCapabilities to return a template with canGenerate=true
    const getTemplateCapabilitiesSpy = spyOn(
      context,
      "getTemplateCapabilities",
    );
    getTemplateCapabilitiesSpy.mockReturnValue({
      canGenerate: true,
      canFetch: false,
      canRender: true,
      isStaticOnly: false,
    });

    // Create handler
    handler = new SiteContentGenerationJobHandler(context);

    // Mock progress reporter
    mockProgressReporter = {
      report: mock(() => Promise.resolve()),
    };
  });

  afterEach(() => {
    harness.reset();
  });

  describe("process", () => {
    test("should generate and save content", async () => {
      // Mock the generateContent method
      const generateContentSpy = spyOn(context, "generateContent");
      generateContentSpy.mockResolvedValue({
        title: "Generated Title",
        content: "Generated content",
      });

      // Mock formatContent
      const formatContentSpy = mock(
        () => "# Formatted Content\n\nGenerated content",
      );
      context.formatContent = formatContentSpy;

      // Mock entity creation
      const createEntitySpy = spyOn(context.entityService, "createEntity");
      createEntitySpy.mockResolvedValue({
        entityId: "landing:hero",
        jobId: "job-123",
      });

      const jobData = {
        routeId: "landing",
        sectionId: "hero",
        entityId: "landing:hero",
        entityType: "site-content-preview" as const,
        templateName: "test-template",
        context: {
          prompt: "Generate hero content",
          data: {
            siteTitle: "Test Site",
          },
        },
        siteConfig: {
          title: "Test Site",
        },
      };

      const result = await handler.process(
        jobData,
        "job-123",
        mockProgressReporter as ProgressReporter,
      );

      // Verify generateContent was called
      expect(generateContentSpy).toHaveBeenCalledWith({
        prompt: "Generate hero content",
        templateName: "test-template",
        data: {
          siteTitle: "Test Site",
        },
      });

      // Verify formatContent was called
      expect(formatContentSpy).toHaveBeenCalledWith("test-template", {
        title: "Generated Title",
        content: "Generated content",
      });

      // Verify entity was created
      expect(createEntitySpy).toHaveBeenCalledWith({
        id: "landing:hero",
        entityType: "site-content-preview" as const,
        content: "# Formatted Content\n\nGenerated content",
        routeId: "landing",
        sectionId: "hero",
      });

      // Verify progress was reported
      expect(mockProgressReporter.report).toHaveBeenCalled();

      // Verify result
      expect(result).toBe("# Formatted Content\n\nGenerated content");
    });

    test("should handle generation errors gracefully", async () => {
      // Mock generateContent to fail with AI service error
      const generateContentSpy = spyOn(context, "generateContent");
      generateContentSpy.mockRejectedValue(new Error("AI service unavailable"));

      const jobData = {
        routeId: "landing",
        sectionId: "hero",
        entityId: "landing:hero",
        entityType: "site-content-preview" as const,
        templateName: "test-template",
        context: {
          prompt: "Generate hero content",
        },
      };

      expect(
        handler.process(
          jobData,
          "job-123",
          mockProgressReporter as ProgressReporter,
        ),
      ).rejects.toThrow("AI service unavailable");
    });

    test("should skip templates without generation support", async () => {
      // Mock getTemplateCapabilities to return a template without generation support
      const getTemplateCapabilitiesSpy = spyOn(
        context,
        "getTemplateCapabilities",
      );
      getTemplateCapabilitiesSpy.mockReturnValue({
        canGenerate: false,
        canFetch: true,
        canRender: true,
        isStaticOnly: false,
      });

      const jobData = {
        routeId: "landing",
        sectionId: "hero",
        entityId: "landing:hero",
        entityType: "site-content-preview" as const,
        templateName: "test-template",
        context: {
          prompt: "Generate hero content",
        },
      };

      const result = await handler.process(
        jobData,
        "job-123",
        mockProgressReporter as ProgressReporter,
      );

      expect(result).toBe("[Template test-template is fetch-only]");
      expect(mockProgressReporter.report).toHaveBeenCalledWith({
        progress: 3,
        total: 3,
        message: "Skipped landing:hero - template doesn't support generation",
      });
    });

    test("should handle missing template gracefully", async () => {
      // Mock getTemplateCapabilities to return null (template not found)
      const getTemplateCapabilitiesSpy = spyOn(
        context,
        "getTemplateCapabilities",
      );
      getTemplateCapabilitiesSpy.mockReturnValue(null);

      const jobData = {
        routeId: "landing",
        sectionId: "hero",
        entityId: "landing:hero",
        entityType: "site-content-preview" as const,
        templateName: "missing-template",
        context: {
          prompt: "Generate content",
        },
      };

      const result = await handler.process(
        jobData,
        "job-123",
        mockProgressReporter as ProgressReporter,
      );

      expect(result).toBe("[Template missing-template not found]");
      expect(mockProgressReporter.report).toHaveBeenCalledWith({
        progress: 3,
        total: 3,
        message: "Skipped landing:hero - template not found",
      });
    });
  });

  describe("validateAndParse", () => {
    test("should validate correct job data", () => {
      const validData = {
        routeId: "landing",
        sectionId: "hero",
        entityId: "landing:hero",
        entityType: "site-content-preview" as const,
        templateName: "hero-template",
        context: {
          prompt: "Generate hero content",
        },
      };

      const result = handler.validateAndParse(validData);
      expect(result).toEqual(validData);
    });

    test("should reject invalid entity type", () => {
      const invalidData = {
        routeId: "landing",
        sectionId: "hero",
        entityId: "landing:hero",
        entityType: "site-content-production" as const, // Should be preview
        templateName: "hero-template",
        context: {
          prompt: "Generate hero content",
        },
      };

      const result = handler.validateAndParse(invalidData);
      expect(result).toBeNull();
    });

    test("should reject missing required fields", () => {
      const invalidData = {
        routeId: "landing",
        // Missing sectionId
        entityId: "landing:hero",
        entityType: "site-content-preview" as const,
        templateName: "hero-template",
        context: {},
      };

      const result = handler.validateAndParse(invalidData);
      expect(result).toBeNull();
    });
  });
});
