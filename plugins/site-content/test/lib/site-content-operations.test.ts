import { describe, test, expect, beforeEach, spyOn } from "bun:test";
import { SiteContentOperations } from "../../src/lib/site-content-operations";
import {
  createMockServicePluginContext,
  createTestEntity,
} from "@brains/test-utils";
import type { ServicePluginContext, BatchOperation } from "@brains/plugins";
import type { RouteDefinition } from "@brains/plugins";

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
  {
    id: "dashboard",
    path: "/dashboard",
    title: "System Dashboard",
    description: "Monitor your Brain system statistics and activity",
    layout: "default",
    sections: [{ id: "main", template: "site-builder:dashboard" }],
    pluginId: "site-builder",
  },
];

function createRoutesMessaging(routes: RouteDefinition[]) {
  return async (channel: string) => {
    if (channel === "site-builder:routes:list") {
      return { success: true, data: routes };
    }
    return { noop: true };
  };
}

describe("SiteContentOperations", () => {
  let context: ServicePluginContext;
  let operations: SiteContentOperations;

  beforeEach(() => {
    context = createMockServicePluginContext({
      returns: { messagingSend: createRoutesMessaging(testRoutes) },
    });
    operations = new SiteContentOperations(context);
  });

  describe("generate", () => {
    test("should queue generation jobs for all sections", async () => {
      const getCapabilitiesSpy = spyOn(context.templates, "getCapabilities");
      getCapabilitiesSpy.mockReturnValue({
        canRender: true,
        canGenerate: true,
        canFetch: false,
        isStaticOnly: false,
      });

      const getEntitySpy = spyOn(context.entityService, "getEntity");
      getEntitySpy.mockResolvedValue(null);

      const enqueueBatchSpy = spyOn(context.jobs, "enqueueBatch");
      enqueueBatchSpy.mockResolvedValue("batch-123");

      const result = await operations.generate({});

      expect(getCapabilitiesSpy).toHaveBeenCalledTimes(4);
      expect(getEntitySpy).toHaveBeenCalledTimes(4);
      expect(enqueueBatchSpy).toHaveBeenCalledTimes(1);
      const batchJobs = enqueueBatchSpy.mock.calls[0]?.[0];
      expect(batchJobs).toHaveLength(4);

      expect(result).toEqual({
        jobs: [
          { jobId: "batch-123-0", routeId: "landing", sectionId: "hero" },
          { jobId: "batch-123-1", routeId: "landing", sectionId: "features" },
          { jobId: "batch-123-2", routeId: "about", sectionId: "main" },
          { jobId: "batch-123-3", routeId: "dashboard", sectionId: "main" },
        ],
        totalSections: 4,
        queuedSections: 4,
        batchId: "batch-123",
      });
    });

    test("should filter by routeId when specified", async () => {
      const getCapabilitiesSpy = spyOn(context.templates, "getCapabilities");
      getCapabilitiesSpy.mockReturnValue({
        canRender: true,
        canGenerate: true,
        canFetch: false,
        isStaticOnly: false,
      });

      const getEntitySpy = spyOn(context.entityService, "getEntity");
      getEntitySpy.mockResolvedValue(null);

      const enqueueBatchSpy = spyOn(context.jobs, "enqueueBatch");
      enqueueBatchSpy.mockResolvedValue("batch-456");

      const result = await operations.generate({ routeId: "landing" });

      expect(getCapabilitiesSpy).toHaveBeenCalledTimes(2);
      expect(getEntitySpy).toHaveBeenCalledTimes(2);
      expect(enqueueBatchSpy).toHaveBeenCalledTimes(1);
      const batchJobs = enqueueBatchSpy.mock.calls[0]?.[0];
      expect(batchJobs).toHaveLength(2);

      expect(result).toEqual({
        jobs: [
          { jobId: "batch-456-0", routeId: "landing", sectionId: "hero" },
          { jobId: "batch-456-1", routeId: "landing", sectionId: "features" },
        ],
        totalSections: 2,
        queuedSections: 2,
        batchId: "batch-456",
      });
    });

    test("should filter by sectionId when specified with routeId", async () => {
      const getCapabilitiesSpy = spyOn(context.templates, "getCapabilities");
      getCapabilitiesSpy.mockReturnValue({
        canRender: true,
        canGenerate: true,
        canFetch: false,
        isStaticOnly: false,
      });

      const getEntitySpy = spyOn(context.entityService, "getEntity");
      getEntitySpy.mockResolvedValue(null);

      const enqueueBatchSpy = spyOn(context.jobs, "enqueueBatch");
      enqueueBatchSpy.mockResolvedValue("batch-789");

      const result = await operations.generate({
        routeId: "landing",
        sectionId: "hero",
      });

      expect(getCapabilitiesSpy).toHaveBeenCalledTimes(1);
      expect(getEntitySpy).toHaveBeenCalledTimes(1);
      expect(enqueueBatchSpy).toHaveBeenCalledTimes(1);
      const batchJobs = enqueueBatchSpy.mock.calls[0]?.[0];
      expect(batchJobs).toHaveLength(1);

      expect(result).toEqual({
        jobs: [{ jobId: "batch-789-0", routeId: "landing", sectionId: "hero" }],
        totalSections: 1,
        queuedSections: 1,
        batchId: "batch-789",
      });
    });

    test("should skip sections with existing content when force is false", async () => {
      const getCapabilitiesSpy = spyOn(context.templates, "getCapabilities");
      getCapabilitiesSpy.mockReturnValue({
        canRender: true,
        canGenerate: true,
        canFetch: false,
        isStaticOnly: false,
      });

      const getEntitySpy = spyOn(context.entityService, "getEntity");
      getEntitySpy.mockResolvedValueOnce(
        createTestEntity("site-content", {
          id: "landing:hero",
          content: "Existing content",
          created: "2024-01-01",
          updated: "2024-01-01",
          metadata: {
            routeId: "landing",
            sectionId: "hero",
          },
        }),
      );
      getEntitySpy.mockResolvedValueOnce(null);

      const enqueueBatchSpy = spyOn(context.jobs, "enqueueBatch");
      enqueueBatchSpy.mockResolvedValue("batch-abc");

      const result = await operations.generate({ routeId: "landing" });

      expect(getEntitySpy).toHaveBeenCalledTimes(2);

      const batchJobs = enqueueBatchSpy.mock.calls[0]?.[0];
      expect(batchJobs).toBeDefined();
      expect(batchJobs).toHaveLength(1);
      expect(batchJobs?.[0]?.data).toMatchObject({
        routeId: "landing",
        sectionId: "features",
      });

      expect(result.queuedSections).toBe(1);
      expect(result.totalSections).toBe(1);
    });

    test("should regenerate existing content when force is true", async () => {
      const getCapabilitiesSpy = spyOn(context.templates, "getCapabilities");
      getCapabilitiesSpy.mockReturnValue({
        canRender: true,
        canGenerate: true,
        canFetch: false,
        isStaticOnly: false,
      });

      const getEntitySpy = spyOn(context.entityService, "getEntity");

      const enqueueBatchSpy = spyOn(context.jobs, "enqueueBatch");
      enqueueBatchSpy.mockResolvedValue("batch-def");

      const result = await operations.generate({
        routeId: "landing",
        force: true,
      });

      expect(getEntitySpy).not.toHaveBeenCalled();

      const batchJobs = enqueueBatchSpy.mock.calls[0]?.[0];
      expect(batchJobs).toHaveLength(2);

      expect(result.queuedSections).toBe(2);
    });

    test("should handle dry run without enqueueing jobs", async () => {
      const getCapabilitiesSpy = spyOn(context.templates, "getCapabilities");
      getCapabilitiesSpy.mockReturnValue({
        canRender: true,
        canGenerate: true,
        canFetch: false,
        isStaticOnly: false,
      });

      const enqueueBatchSpy = spyOn(context.jobs, "enqueueBatch");

      const result = await operations.generate({ dryRun: true });

      expect(enqueueBatchSpy).not.toHaveBeenCalled();

      expect(result).toMatchObject({
        jobs: [],
        totalSections: 4,
        queuedSections: 4,
        batchId: expect.stringContaining("dry-run-"),
      });
    });

    test("should skip sections with static content", async () => {
      const routesWithStatic = [
        ...testRoutes,
        {
          id: "static-page",
          path: "/static",
          title: "Static Page",
          description: "Page with static content",
          layout: "default",
          sections: [
            {
              id: "static-section",
              template: "site-builder:static",
              content: "This is static content",
            },
            { id: "dynamic-section", template: "site-builder:content" },
          ],
          pluginId: "site-builder",
        },
      ];

      // Recreate context with updated routes
      context = createMockServicePluginContext({
        returns: { messagingSend: createRoutesMessaging(routesWithStatic) },
      });
      operations = new SiteContentOperations(context);

      const getCapabilitiesSpy = spyOn(context.templates, "getCapabilities");
      getCapabilitiesSpy.mockReturnValue({
        canRender: true,
        canGenerate: true,
        canFetch: false,
        isStaticOnly: false,
      });

      const getEntitySpy = spyOn(context.entityService, "getEntity");
      getEntitySpy.mockResolvedValue(null);

      const enqueueBatchSpy = spyOn(context.jobs, "enqueueBatch");
      enqueueBatchSpy.mockResolvedValue("batch-ghi");

      const result = await operations.generate({});

      const batchJobs = enqueueBatchSpy.mock.calls[0]?.[0];
      expect(batchJobs).toHaveLength(5);

      const sectionIds =
        batchJobs?.map(
          (job: BatchOperation) => job.data["sectionId"] as string,
        ) ?? [];
      expect(sectionIds).not.toContain("static-section");
      expect(sectionIds).toContain("dynamic-section");

      expect(result.queuedSections).toBe(5);
    });

    test("should skip sections where template doesn't support generation", async () => {
      const getCapabilitiesSpy = spyOn(context.templates, "getCapabilities");
      getCapabilitiesSpy.mockImplementation((name: string) => {
        if (name === "site-builder:dashboard") {
          return {
            canRender: true,
            canGenerate: false,
            canFetch: false,
            isStaticOnly: true,
          };
        }
        return {
          canRender: true,
          canGenerate: true,
          canFetch: false,
          isStaticOnly: false,
        };
      });

      const getEntitySpy = spyOn(context.entityService, "getEntity");
      getEntitySpy.mockResolvedValue(null);

      const enqueueBatchSpy = spyOn(context.jobs, "enqueueBatch");
      enqueueBatchSpy.mockResolvedValue("batch-jkl");

      const result = await operations.generate({});

      const batchJobs = enqueueBatchSpy.mock.calls[0]?.[0];
      expect(batchJobs).toHaveLength(3);

      const routeIds =
        batchJobs?.map(
          (job: BatchOperation) => job.data["routeId"] as string,
        ) ?? [];
      expect(routeIds).not.toContain("dashboard");

      expect(result.queuedSections).toBe(3);
    });

    test("should throw when site-builder routes handler is not available", async () => {
      context = createMockServicePluginContext({
        returns: {
          messagingSend: async () => ({ noop: true }),
        },
      });
      operations = new SiteContentOperations(context);

      expect(operations.generate({})).rejects.toThrow(
        "No handler for site-builder:routes:list",
      );
    });
  });
});
