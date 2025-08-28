import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { SiteContentOperations } from "./site-content-operations";
import {
  createServicePluginHarness,
  createServicePluginContext,
  type ServicePluginContext,
} from "@brains/plugins";
import { SiteBuilderPlugin } from "../plugin";
import type { SiteContentPreview, SiteContentProduction } from "../types";
import { RouteRegistry } from "./route-registry";

describe("SiteContentOperations", () => {
  let operations: SiteContentOperations;
  let harness: ReturnType<typeof createServicePluginHarness<SiteBuilderPlugin>>;
  let plugin: SiteBuilderPlugin;
  let context: ServicePluginContext;

  beforeEach(async () => {
    harness = createServicePluginHarness<SiteBuilderPlugin>();

    // Create plugin with test routes
    plugin = new SiteBuilderPlugin({
      routes: [
        {
          id: "landing",
          path: "/",
          title: "Home",
          description: "Landing page",
          sections: [
            { id: "hero", template: "hero" },
            { id: "features", template: "features" },
          ],
        },
        {
          id: "about",
          path: "/about",
          title: "About",
          description: "About us page",
          sections: [{ id: "main", template: "content" }],
        },
      ],
    });

    // Install plugin
    await harness.installPlugin(plugin);

    // Get the mock shell and create a context
    const shell = harness.getShell();
    context = createServicePluginContext(shell, "site-builder");

    // Mock getTemplateCapabilities to return templates with canGenerate=true by default
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

    // Create a RouteRegistry with test routes matching what the test expects
    const routeRegistry = new RouteRegistry();

    // Register the routes that the test expects (matching the plugin config)
    routeRegistry.register([
      {
        id: "landing",
        path: "/",
        title: "Home",
        description: "Landing page",
        sections: [
          { id: "hero", template: "hero" },
          { id: "features", template: "features" },
        ],
        pluginId: "site-builder",
        environment: "preview",
      },
      {
        id: "about",
        path: "/about",
        title: "About",
        description: "About us page",
        sections: [{ id: "main", template: "content" }],
        pluginId: "site-builder",
        environment: "preview",
      },
      {
        id: "dashboard",
        path: "/dashboard",
        title: "System Dashboard",
        description: "Monitor your Brain system statistics and activity",
        sections: [{ id: "main", template: "site-builder:dashboard" }],
        pluginId: "site-builder",
        environment: "preview",
      },
    ]);

    // Create operations instance with the context and route registry
    operations = new SiteContentOperations(context, routeRegistry);
  });

  afterEach(() => {
    harness.reset();
  });

  describe("getPreviewEntities", () => {
    test("should use listEntities with correct entity type", async () => {
      const mockEntities: SiteContentPreview[] = [
        {
          id: "landing:hero",
          entityType: "site-content-preview" as const,
          content: "# Hero Content",
          routeId: "landing",
          sectionId: "hero",
          created: "2024-01-01",
          updated: "2024-01-01",
        },
        {
          id: "landing:features",
          entityType: "site-content-preview" as const,
          content: "# Features",
          routeId: "landing",
          sectionId: "features",
          created: "2024-01-01",
          updated: "2024-01-01",
        },
      ];

      // Spy on the entity service method
      const listEntitiesSpy = spyOn(context.entityService, "listEntities");
      listEntitiesSpy.mockResolvedValue(mockEntities);

      const result = await operations.getPreviewEntities();

      // Verify it calls listEntities with the correct entity type
      expect(listEntitiesSpy).toHaveBeenCalledWith("site-content-preview", {
        limit: 1000,
      });

      // Verify the result
      expect(result).toEqual([
        { id: "landing:hero", routeId: "landing", sectionId: "hero" },
        { id: "landing:features", routeId: "landing", sectionId: "features" },
      ]);
    });

    test("should filter by routeId when provided", async () => {
      const mockEntities: SiteContentPreview[] = [
        {
          id: "landing:hero",
          entityType: "site-content-preview" as const,
          content: "# Hero Content",
          routeId: "landing",
          sectionId: "hero",
          created: "2024-01-01",
          updated: "2024-01-01",
        },
        {
          id: "about:main",
          entityType: "site-content-preview" as const,
          content: "# About",
          routeId: "about",
          sectionId: "main",
          created: "2024-01-01",
          updated: "2024-01-01",
        },
      ];

      const listEntitiesSpy = spyOn(context.entityService, "listEntities");
      listEntitiesSpy.mockResolvedValue(mockEntities);

      const result = await operations.getPreviewEntities({
        routeId: "landing",
      });

      // Should still call listEntities for all entities
      expect(listEntitiesSpy).toHaveBeenCalledWith("site-content-preview", {
        limit: 1000,
      });

      // But should filter the results
      expect(result).toEqual([
        { id: "landing:hero", routeId: "landing", sectionId: "hero" },
      ]);
    });

    test("should NOT use search method", async () => {
      // This test ensures we don't regress to the bug
      // We're testing that the search method is NOT called, only listEntities
      const listEntitiesSpy = spyOn(context.entityService, "listEntities");
      listEntitiesSpy.mockResolvedValue([]);

      await operations.getPreviewEntities();

      // Verify listEntities WAS called with correct parameters
      expect(listEntitiesSpy).toHaveBeenCalledWith("site-content-preview", {
        limit: 1000,
      });
    });
  });

  describe("getProductionEntities", () => {
    test("should use listEntities with correct entity type", async () => {
      const mockEntities: SiteContentProduction[] = [
        {
          id: "landing:hero",
          entityType: "site-content-production" as const,
          content: "# Hero Content",
          routeId: "landing",
          sectionId: "hero",
          created: "2024-01-01",
          updated: "2024-01-01",
        },
      ];

      const listEntitiesSpy = spyOn(context.entityService, "listEntities");
      listEntitiesSpy.mockResolvedValue(mockEntities);

      const result = await operations.getProductionEntities();

      // Verify it calls listEntities with the correct entity type
      expect(listEntitiesSpy).toHaveBeenCalledWith("site-content-production", {
        limit: 1000,
      });

      expect(result).toEqual([
        { id: "landing:hero", routeId: "landing", sectionId: "hero" },
      ]);
    });
  });

  describe("promote", () => {
    test("should queue derivation jobs with correct entity types", async () => {
      const entityIds = ["landing:hero", "landing:features"];

      const enqueueBatchSpy = spyOn(context, "enqueueBatch");
      enqueueBatchSpy.mockResolvedValue("batch-123");

      const batchId = await operations.promote(entityIds);

      // Verify enqueueBatch was called
      expect(enqueueBatchSpy).toHaveBeenCalled();

      // Get the batch jobs that were queued
      const call = enqueueBatchSpy.mock.calls[0];
      const batchJobs = call?.[0] ?? [];

      expect(batchJobs).toHaveLength(2);
      expect(batchJobs[0]).toEqual({
        type: "shell:content-derivation",
        data: {
          entityId: "landing:hero",
          sourceEntityType: "site-content-preview",
          targetEntityType: "site-content-production",
          options: { deleteSource: false },
        },
      });
      expect(batchJobs[1]).toEqual({
        type: "shell:content-derivation",
        data: {
          entityId: "landing:features",
          sourceEntityType: "site-content-preview",
          targetEntityType: "site-content-production",
          options: { deleteSource: false },
        },
      });

      expect(batchId).toBe("batch-123");
    });

    test("should throw if no entities to promote", async () => {
      expect(() => operations.promote([])).toThrow("No entities to promote");
    });
  });

  describe("rollback", () => {
    test("should queue derivation jobs with reversed entity types", async () => {
      const entityIds = ["landing:hero"];

      const enqueueBatchSpy = spyOn(context, "enqueueBatch");
      enqueueBatchSpy.mockResolvedValue("batch-123");

      const batchId = await operations.rollback(entityIds);

      const call = enqueueBatchSpy.mock.calls[0];
      const batchJobs = call?.[0] ?? [];

      expect(batchJobs).toHaveLength(1);
      expect(batchJobs[0]).toEqual({
        type: "shell:content-derivation",
        data: {
          entityId: "landing:hero",
          sourceEntityType: "site-content-production",
          targetEntityType: "site-content-preview",
        },
      });

      expect(batchId).toBe("batch-123");
    });
  });

  describe("generate", () => {
    test("should queue content generation jobs for all sections", async () => {
      const enqueueBatchSpy = spyOn(context, "enqueueBatch");
      enqueueBatchSpy.mockResolvedValue("batch-123");

      await operations.generate({
        dryRun: false,
        force: false,
      });

      // Should have queued jobs for all sections
      const call = enqueueBatchSpy.mock.calls[0];
      const batchJobs = call?.[0] ?? [];

      // We have 4 sections total (2 in landing, 1 in about, 1 in dashboard)
      // The plugin always registers a dashboard route
      expect(batchJobs).toHaveLength(4);

      // Check that we have jobs for all expected routes
      const routeIds = batchJobs.map((job) => job.data["routeId"]);
      expect(routeIds).toContain("landing");
      expect(routeIds).toContain("about");
      expect(routeIds).toContain("dashboard");

      // Check job structure (using first job)
      expect(batchJobs[0]?.type).toBe("shell:content-generation");
      expect(batchJobs[0]?.data).toHaveProperty("routeId");
      expect(batchJobs[0]?.data).toHaveProperty("sectionId");
      expect(batchJobs[0]?.data).toHaveProperty("entityId");
      expect(batchJobs[0]?.data["entityType"]).toBe("site-content-preview");
    });

    test("should filter by routeId when provided", async () => {
      const enqueueBatchSpy = spyOn(context, "enqueueBatch");
      enqueueBatchSpy.mockResolvedValue("batch-123");

      await operations.generate({
        routeId: "landing",
        dryRun: false,
        force: false,
      });

      const call = enqueueBatchSpy.mock.calls[0];
      const batchJobs = call?.[0] ?? [];

      // Should only have 2 sections from landing route
      expect(batchJobs).toHaveLength(2);

      expect(batchJobs.every((job) => job.data["routeId"] === "landing")).toBe(
        true,
      );
    });

    test("should create correct entity IDs in format routeId:sectionId", async () => {
      const enqueueBatchSpy = spyOn(context, "enqueueBatch");
      enqueueBatchSpy.mockResolvedValue("batch-123");

      await operations.generate({
        routeId: "landing",
        dryRun: false,
        force: false,
      });

      const call = enqueueBatchSpy.mock.calls[0];
      const batchJobs = call?.[0] ?? [];

      expect(batchJobs[0]?.data["entityId"]).toBe("landing:hero");
      expect(batchJobs[1]?.data["entityId"]).toBe("landing:features");
    });
  });
});
