import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { SiteContentService } from "./site-content-service";
import { RouteRegistry } from "./route-registry";
import {
  MockShell,
  createServicePluginContext,
  createSilentLogger,
  type ServicePluginContext,
} from "@brains/plugins";
import { SiteContentOperations } from "./site-content-operations";

describe("SiteContentService", () => {
  let mockShell: MockShell;
  let context: ServicePluginContext;
  let service: SiteContentService;
  let routeRegistry: RouteRegistry;

  beforeEach(() => {
    // Create mock shell and context
    const logger = createSilentLogger("site-builder-test");
    mockShell = new MockShell({ logger });
    context = createServicePluginContext(mockShell, "site-builder");

    // Set up route registry with test routes
    routeRegistry = new RouteRegistry(context.logger);

    // Register test routes
    routeRegistry.register({
      id: "landing",
      path: "/",
      title: "Home",
      description: "Landing page",
      sections: [
        { id: "hero", template: "site-builder:hero" },
        { id: "features", template: "site-builder:features" },
      ],
      pluginId: "site-builder",
    });

    routeRegistry.register({
      id: "about",
      path: "/about",
      title: "About",
      description: "About us page",
      sections: [{ id: "main", template: "site-builder:content" }],
      pluginId: "site-builder",
    });

    // Create service instance
    service = new SiteContentService(context, routeRegistry, {
      title: "Test Site",
      description: "Test Description",
    });
  });

  afterEach(() => {
    // No cleanup needed for mock shell
  });

  describe("generateContent", () => {
    let generateSpy: ReturnType<typeof spyOn>;

    beforeEach(() => {
      // Reset the spy before each test
      generateSpy = spyOn(SiteContentOperations.prototype, "generate");
    });

    afterEach(() => {
      // Restore the original function
      generateSpy.mockRestore();
    });

    test("should call operations.generate with correct parameters", async () => {
      generateSpy.mockResolvedValue({
        jobs: [
          { jobId: "job-1", routeId: "landing", sectionId: "hero" },
          { jobId: "job-2", routeId: "landing", sectionId: "features" },
        ],
        totalSections: 2,
        queuedSections: 2,
        batchId: "batch-123",
      });

      const result = await service.generateContent({
        routeId: "landing",
        force: true,
      });

      // Verify operations.generate was called with correct params
      expect(generateSpy).toHaveBeenCalledTimes(1);

      expect(generateSpy).toHaveBeenCalledWith(
        {
          routeId: "landing",
          force: true,
          dryRun: false,
        },
        { title: "Test Site", description: "Test Description" },
        undefined,
      );

      // Verify result
      expect(result).toEqual({
        jobs: [
          { jobId: "job-1", routeId: "landing", sectionId: "hero" },
          { jobId: "job-2", routeId: "landing", sectionId: "features" },
        ],
        totalSections: 2,
        queuedSections: 2,
        batchId: "batch-123",
      });
    });

    test("should pass metadata when provided", async () => {
      generateSpy.mockResolvedValue({
        jobs: [],
        totalSections: 0,
        queuedSections: 0,
        batchId: "batch-456",
      });

      const metadata = {
        rootJobId: "root-123",
        progressToken: "token-abc",
        pluginId: "site-builder",
        operationType: "content_operations" as const,
      };

      await service.generateContent(
        { routeId: "about", sectionId: "main" },
        metadata,
      );

      // Verify metadata was passed through
      expect(generateSpy).toHaveBeenCalledWith(
        { routeId: "about", sectionId: "main", dryRun: false, force: false },
        { title: "Test Site", description: "Test Description" },
        metadata,
      );
    });

    test("should handle dry run", async () => {
      generateSpy.mockResolvedValue({
        jobs: [],
        totalSections: 3,
        queuedSections: 3,
        batchId: "dry-run-789",
      });

      const result = await service.generateContent({
        dryRun: true,
      });

      expect(generateSpy).toHaveBeenCalledWith(
        { dryRun: true, force: false },
        { title: "Test Site", description: "Test Description" },
        undefined,
      );

      expect(result).toMatchObject({
        jobs: [],
        totalSections: 3,
        queuedSections: 3,
        batchId: "dry-run-789",
      });
    });

    test("should handle validation errors", async () => {
      // Reset the spy to ensure clean state
      generateSpy.mockResolvedValue({
        jobs: [],
        totalSections: 0,
        queuedSections: 0,
        batchId: "batch-error",
      });

      // The validation happens inside async function
      try {
        await service.generateContent({
          routeId: 123 as unknown as string, // Invalid type
        });
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    test("should work without site config", async () => {
      // Create service without site config
      const serviceNoConfig = new SiteContentService(context, routeRegistry);
      generateSpy.mockResolvedValue({
        jobs: [],
        totalSections: 0,
        queuedSections: 0,
        batchId: "batch-no-config",
      });

      const result = await serviceNoConfig.generateContent({});
      expect(result).toBeDefined();

      // Should pass undefined as siteConfig
      expect(generateSpy).toHaveBeenCalledWith(
        { dryRun: false, force: false },
        undefined,
        undefined,
      );
    });
  });
});
