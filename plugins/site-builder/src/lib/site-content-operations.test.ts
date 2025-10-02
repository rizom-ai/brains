import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { SiteContentOperations } from "./site-content-operations";
import { RouteRegistry } from "./route-registry";
import {
  MockShell,
  createServicePluginContext,
  createSilentLogger,
  type ServicePluginContext,
  type BatchOperation,
} from "@brains/plugins/test";

describe("SiteContentOperations", () => {
  let mockShell: MockShell;
  let context: ServicePluginContext;
  let operations: SiteContentOperations;
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
      layout: "default",
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
      layout: "default",
      sections: [{ id: "main", template: "site-builder:content" }],
      pluginId: "site-builder",
    });

    routeRegistry.register({
      id: "dashboard",
      path: "/dashboard",
      title: "System Dashboard",
      description: "Monitor your Brain system statistics and activity",
      layout: "default",
      sections: [{ id: "main", template: "site-builder:dashboard" }],
      pluginId: "site-builder",
    });

    // Create operations instance with the context and route registry
    operations = new SiteContentOperations(context, routeRegistry);
  });

  afterEach(() => {
    // No cleanup needed for mock shell
  });

  describe("generate", () => {
    test("should queue generation jobs for all sections", async () => {
      // Set up template capabilities
      const getTemplateCapabilitiesSpy = spyOn(
        context,
        "getTemplateCapabilities",
      );
      getTemplateCapabilitiesSpy.mockReturnValue({
        canRender: true,
        canGenerate: true,
        canFetch: false,
        isStaticOnly: false,
      });

      // Spy on entity service to simulate no existing content
      const getEntitySpy = spyOn(context.entityService, "getEntity");
      getEntitySpy.mockResolvedValue(null);

      // Spy on enqueueBatch
      const enqueueBatchSpy = spyOn(context, "enqueueBatch");
      enqueueBatchSpy.mockResolvedValue("batch-123");

      const result = await operations.generate({});

      // Should check template capabilities for each section
      expect(getTemplateCapabilitiesSpy).toHaveBeenCalledTimes(4);

      // Should check for existing content for each section
      expect(getEntitySpy).toHaveBeenCalledTimes(4);

      // Should enqueue batch with 4 jobs (all sections)
      expect(enqueueBatchSpy).toHaveBeenCalledTimes(1);
      const batchJobs = enqueueBatchSpy.mock.calls[0]?.[0];
      expect(batchJobs).toHaveLength(4);

      // Verify result
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
      // Set up template capabilities
      const getTemplateCapabilitiesSpy = spyOn(
        context,
        "getTemplateCapabilities",
      );
      getTemplateCapabilitiesSpy.mockReturnValue({
        canRender: true,
        canGenerate: true,
        canFetch: false,
        isStaticOnly: false,
      });

      // Spy on entity service
      const getEntitySpy = spyOn(context.entityService, "getEntity");
      getEntitySpy.mockResolvedValue(null);

      // Spy on enqueueBatch
      const enqueueBatchSpy = spyOn(context, "enqueueBatch");
      enqueueBatchSpy.mockResolvedValue("batch-456");

      const result = await operations.generate({ routeId: "landing" });

      // Should only check templates for landing sections
      expect(getTemplateCapabilitiesSpy).toHaveBeenCalledTimes(2);

      // Should only check existing content for landing sections
      expect(getEntitySpy).toHaveBeenCalledTimes(2);

      // Should enqueue batch with 2 jobs (landing sections only)
      expect(enqueueBatchSpy).toHaveBeenCalledTimes(1);
      const batchJobs = enqueueBatchSpy.mock.calls[0]?.[0];
      expect(batchJobs).toHaveLength(2);

      // Verify result
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
      // Set up template capabilities
      const getTemplateCapabilitiesSpy = spyOn(
        context,
        "getTemplateCapabilities",
      );
      getTemplateCapabilitiesSpy.mockReturnValue({
        canRender: true,
        canGenerate: true,
        canFetch: false,
        isStaticOnly: false,
      });

      // Spy on entity service
      const getEntitySpy = spyOn(context.entityService, "getEntity");
      getEntitySpy.mockResolvedValue(null);

      // Spy on enqueueBatch
      const enqueueBatchSpy = spyOn(context, "enqueueBatch");
      enqueueBatchSpy.mockResolvedValue("batch-789");

      const result = await operations.generate({
        routeId: "landing",
        sectionId: "hero",
      });

      // Should only check template for hero section
      expect(getTemplateCapabilitiesSpy).toHaveBeenCalledTimes(1);

      // Should only check existing content for hero section
      expect(getEntitySpy).toHaveBeenCalledTimes(1);

      // Should enqueue batch with 1 job
      expect(enqueueBatchSpy).toHaveBeenCalledTimes(1);
      const batchJobs = enqueueBatchSpy.mock.calls[0]?.[0];
      expect(batchJobs).toHaveLength(1);

      // Verify result
      expect(result).toEqual({
        jobs: [{ jobId: "batch-789-0", routeId: "landing", sectionId: "hero" }],
        totalSections: 1,
        queuedSections: 1,
        batchId: "batch-789",
      });
    });

    test("should skip sections with existing content when force is false", async () => {
      // Set up template capabilities
      const getTemplateCapabilitiesSpy = spyOn(
        context,
        "getTemplateCapabilities",
      );
      getTemplateCapabilitiesSpy.mockReturnValue({
        canRender: true,
        canGenerate: true,
        canFetch: false,
        isStaticOnly: false,
      });

      // Mock existing content for hero section
      const getEntitySpy = spyOn(context.entityService, "getEntity");

      // First call returns existing entity, second returns null
      getEntitySpy.mockResolvedValueOnce({
        id: "landing:hero",
        entityType: "site-content",
        content: "Existing content",
        created: "2024-01-01",
        updated: "2024-01-01",
        metadata: {
          routeId: "landing",
          sectionId: "hero",
        },
      });
      getEntitySpy.mockResolvedValueOnce(null); // For features section

      // Spy on enqueueBatch
      const enqueueBatchSpy = spyOn(context, "enqueueBatch");
      enqueueBatchSpy.mockResolvedValue("batch-abc");

      const result = await operations.generate({ routeId: "landing" });

      // Should check both sections
      expect(getEntitySpy).toHaveBeenCalledTimes(2);

      // Should only queue 1 job (features section, hero is skipped)
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
      // Set up template capabilities
      const getTemplateCapabilitiesSpy = spyOn(
        context,
        "getTemplateCapabilities",
      );
      getTemplateCapabilitiesSpy.mockReturnValue({
        canRender: true,
        canGenerate: true,
        canFetch: false,
        isStaticOnly: false,
      });

      // No need to check for existing content when force is true
      const getEntitySpy = spyOn(context.entityService, "getEntity");

      // Spy on enqueueBatch
      const enqueueBatchSpy = spyOn(context, "enqueueBatch");
      enqueueBatchSpy.mockResolvedValue("batch-def");

      const result = await operations.generate({
        routeId: "landing",
        force: true,
      });

      // Should NOT check for existing content when force is true
      expect(getEntitySpy).not.toHaveBeenCalled();

      // Should queue both jobs
      const batchJobs = enqueueBatchSpy.mock.calls[0]?.[0];
      expect(batchJobs).toHaveLength(2);

      expect(result.queuedSections).toBe(2);
    });

    test("should handle dry run without enqueueing jobs", async () => {
      // Set up template capabilities
      const getTemplateCapabilitiesSpy = spyOn(
        context,
        "getTemplateCapabilities",
      );
      getTemplateCapabilitiesSpy.mockReturnValue({
        canRender: true,
        canGenerate: true,
        canFetch: false,
        isStaticOnly: false,
      });

      // Spy on enqueueBatch
      const enqueueBatchSpy = spyOn(context, "enqueueBatch");

      const result = await operations.generate({ dryRun: true });

      // Should NOT enqueue any jobs
      expect(enqueueBatchSpy).not.toHaveBeenCalled();

      // Should return dry run result
      expect(result).toMatchObject({
        jobs: [],
        totalSections: 4,
        queuedSections: 4,
        batchId: expect.stringContaining("dry-run-"),
      });
    });

    test("should skip sections with static content", async () => {
      // Register a route with static content section
      routeRegistry.register({
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
      });

      // Set up template capabilities
      const getTemplateCapabilitiesSpy = spyOn(
        context,
        "getTemplateCapabilities",
      );
      getTemplateCapabilitiesSpy.mockReturnValue({
        canRender: true,
        canGenerate: true,
        canFetch: false,
        isStaticOnly: false,
      });

      // Spy on entity service
      const getEntitySpy = spyOn(context.entityService, "getEntity");
      getEntitySpy.mockResolvedValue(null);

      // Spy on enqueueBatch
      const enqueueBatchSpy = spyOn(context, "enqueueBatch");
      enqueueBatchSpy.mockResolvedValue("batch-ghi");

      const result = await operations.generate({});

      // Should only queue jobs for sections with templates (5 total: 2 from landing, 1 from about, 1 from dashboard, 1 from static-page)
      // The static-section should be skipped
      const batchJobs = enqueueBatchSpy.mock.calls[0]?.[0];
      expect(batchJobs).toHaveLength(5);

      // Verify the static section is not in the jobs
      const sectionIds =
        batchJobs?.map(
          (job: BatchOperation) => job.data["sectionId"] as string,
        ) ?? [];
      expect(sectionIds).not.toContain("static-section");
      expect(sectionIds).toContain("dynamic-section");

      expect(result.queuedSections).toBe(5);
    });

    test("should skip sections where template doesn't support generation", async () => {
      // Set up template capabilities - dashboard doesn't support generation
      const getTemplateCapabilitiesSpy = spyOn(
        context,
        "getTemplateCapabilities",
      );
      getTemplateCapabilitiesSpy.mockImplementation((name: string) => {
        if (name === "site-builder:dashboard") {
          return {
            canRender: true,
            canGenerate: false, // Dashboard can't generate
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

      // Spy on entity service
      const getEntitySpy = spyOn(context.entityService, "getEntity");
      getEntitySpy.mockResolvedValue(null);

      // Spy on enqueueBatch
      const enqueueBatchSpy = spyOn(context, "enqueueBatch");
      enqueueBatchSpy.mockResolvedValue("batch-jkl");

      const result = await operations.generate({});

      // Should only queue 3 jobs (dashboard is skipped)
      const batchJobs = enqueueBatchSpy.mock.calls[0]?.[0];
      expect(batchJobs).toHaveLength(3);

      // Verify dashboard is not in the jobs
      const routeIds =
        batchJobs?.map(
          (job: BatchOperation) => job.data["routeId"] as string,
        ) ?? [];
      expect(routeIds).not.toContain("dashboard");

      expect(result.queuedSections).toBe(3);
    });
  });
});
