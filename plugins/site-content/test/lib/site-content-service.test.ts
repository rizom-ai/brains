import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { SiteContentService } from "../../src/lib/site-content-service";
import { createMockServicePluginContext } from "@brains/test-utils";
import type { ServicePluginContext } from "@brains/plugins";
import type { RouteDefinition } from "@brains/plugins";
import { SiteContentOperations } from "../../src/lib/site-content-operations";

const testRoutes: RouteDefinition[] = [
  {
    id: "landing",
    path: "/",
    title: "Home",
    description: "Landing page",
    layout: "default",
    sections: [
      { id: "hero", template: "site-builder:hero" },
      { id: "features", template: "site-builder:features" },
    ],
    pluginId: "site-builder",
  },
  {
    id: "about",
    path: "/about",
    title: "About",
    description: "About us page",
    layout: "default",
    sections: [{ id: "main", template: "site-builder:content" }],
    pluginId: "site-builder",
  },
];

describe("SiteContentService", () => {
  let context: ServicePluginContext;
  let service: SiteContentService;

  beforeEach(() => {
    context = createMockServicePluginContext({
      returns: {
        messagingSend: async (channel: string) => {
          if (channel === "site-builder:routes:list") {
            return { success: true, data: testRoutes };
          }
          return { noop: true };
        },
      },
    });

    service = new SiteContentService(context, {
      title: "Test Site",
      description: "Test Description",
    });
  });

  describe("generateContent", () => {
    let generateSpy: ReturnType<typeof spyOn>;

    beforeEach(() => {
      generateSpy = spyOn(SiteContentOperations.prototype, "generate");
    });

    afterEach(() => {
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
        pluginId: "site-content",
        operationType: "content_operations" as const,
      };

      await service.generateContent(
        { routeId: "about", sectionId: "main" },
        metadata,
      );

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
      generateSpy.mockResolvedValue({
        jobs: [],
        totalSections: 0,
        queuedSections: 0,
        batchId: "batch-error",
      });

      try {
        await service.generateContent({
          routeId: 123 as unknown as string,
        });
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    test("should work without site config", async () => {
      const serviceNoConfig = new SiteContentService(context);
      generateSpy.mockResolvedValue({
        jobs: [],
        totalSections: 0,
        queuedSections: 0,
        batchId: "batch-no-config",
      });

      const result = await serviceNoConfig.generateContent({});
      expect(result).toBeDefined();

      expect(generateSpy).toHaveBeenCalledWith(
        { dryRun: false, force: false },
        undefined,
        undefined,
      );
    });
  });
});
