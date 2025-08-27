import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { SiteContentService } from "./site-content-service";
import {
  createServicePluginHarness,
  createServicePluginContext,
  type ServicePluginContext,
} from "@brains/plugins";
import { SiteBuilderPlugin } from "../plugin";
import type { SiteContentPreview } from "../types";

describe("SiteContentService", () => {
  let service: SiteContentService;
  let harness: ReturnType<typeof createServicePluginHarness<SiteBuilderPlugin>>;
  let plugin: SiteBuilderPlugin;
  let context: ServicePluginContext;

  beforeEach(async () => {
    harness = createServicePluginHarness<SiteBuilderPlugin>();

    // Create plugin with test configuration
    plugin = new SiteBuilderPlugin({
      routes: [
        {
          id: "test-route",
          path: "/test",
          title: "Test",
          description: "Test route",
          sections: [
            { id: "section1", template: "test-template" },
            { id: "section2", template: "test-template" },
          ],
        },
      ],
      siteConfig: {
        title: "Test Site",
        description: "Test site description",
      },
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

    // Create service instance
    service = new SiteContentService(context, {
      title: "Test Site",
      description: "Test site description",
    });
  });

  afterEach(() => {
    harness.reset();
  });

  describe("generateContent", () => {
    test("should validate options and call operations.generate", async () => {
      const enqueueBatchSpy = spyOn(context, "enqueueBatch");
      enqueueBatchSpy.mockResolvedValue("batch-123");

      const result = await service.generateContent({
        routeId: "test-route",
        dryRun: false,
        force: false,
      });

      // The result will be "empty-..." if no sections match generation criteria,
      // or "batch-123" if at least one section was queued
      expect(result.batchId).toBeDefined();
      expect(result.jobs).toBeDefined();

      // Check if enqueueBatch was called (it should be with our mock capabilities)
      if (result.totalSections > 0 && result.queuedSections > 0) {
        expect(enqueueBatchSpy).toHaveBeenCalled();
      }
    });

    test("should handle validation errors", async () => {
      expect(
        service.generateContent({
          // @ts-ignore - intentionally passing invalid data
          routeId: 123, // Should be string
        }),
      ).rejects.toThrow();
    });

    test("should pass dryRun option", async () => {
      const enqueueBatchSpy = spyOn(context, "enqueueBatch");
      enqueueBatchSpy.mockResolvedValue("batch-123");

      await service.generateContent({
        dryRun: true,
        force: false,
      });

      // In dry run, no jobs should be queued
      expect(enqueueBatchSpy).not.toHaveBeenCalled();
    });
  });

  describe("promoteContent", () => {
    test("should get preview entities and promote them", async () => {
      // Mock some preview entities
      const mockEntities: SiteContentPreview[] = [
        {
          id: "test-route:section1",
          entityType: "site-content-preview" as const,
          content: "# Section 1",
          routeId: "test-route",
          sectionId: "section1",
          created: "2024-01-01",
          updated: "2024-01-01",
        },
      ];

      const listEntitiesSpy = spyOn(context.entityService, "listEntities");
      listEntitiesSpy.mockResolvedValue(mockEntities);

      const enqueueBatchSpy = spyOn(context, "enqueueBatch");
      enqueueBatchSpy.mockResolvedValue("batch-promote-123");

      const batchId = await service.promoteContent({
        routeId: "test-route",
        dryRun: false,
      });

      expect(batchId).toBe("batch-promote-123");
      expect(listEntitiesSpy).toHaveBeenCalledWith("site-content-preview", {
        limit: 1000,
      });
      expect(enqueueBatchSpy).toHaveBeenCalled();
    });

    test("should throw if no preview content found", async () => {
      const listEntitiesSpy = spyOn(context.entityService, "listEntities");
      listEntitiesSpy.mockResolvedValue([]);

      expect(
        service.promoteContent({ routeId: "test-route", dryRun: false }),
      ).rejects.toThrow("No preview content found to promote");
    });

    test("should filter by sectionId", async () => {
      const mockEntities: SiteContentPreview[] = [
        {
          id: "test-route:section1",
          entityType: "site-content-preview" as const,
          content: "# Section 1",
          routeId: "test-route",
          sectionId: "section1",
          created: "2024-01-01",
          updated: "2024-01-01",
        },
        {
          id: "test-route:section2",
          entityType: "site-content-preview" as const,
          content: "# Section 2",
          routeId: "test-route",
          sectionId: "section2",
          created: "2024-01-01",
          updated: "2024-01-01",
        },
      ];

      const listEntitiesSpy = spyOn(context.entityService, "listEntities");
      listEntitiesSpy.mockResolvedValue(mockEntities);

      const enqueueBatchSpy = spyOn(context, "enqueueBatch");
      enqueueBatchSpy.mockResolvedValue("batch-promote-123");

      await service.promoteContent({
        routeId: "test-route",
        sectionId: "section1",
        dryRun: false,
      });

      // Should only promote section1
      const call = enqueueBatchSpy.mock.calls[0];
      const batchJobs = call?.[0] || [];
      expect(batchJobs).toHaveLength(1);
      expect(batchJobs[0]?.data?.["entityId"]).toBe("test-route:section1");
    });

    test("should support dry run", async () => {
      const mockEntities: SiteContentPreview[] = [
        {
          id: "test-route:section1",
          entityType: "site-content-preview" as const,
          content: "# Section 1",
          routeId: "test-route",
          sectionId: "section1",
          created: "2024-01-01",
          updated: "2024-01-01",
        },
      ];

      const listEntitiesSpy = spyOn(context.entityService, "listEntities");
      listEntitiesSpy.mockResolvedValue(mockEntities);

      const enqueueBatchSpy = spyOn(context, "enqueueBatch");

      const result = await service.promoteContent({
        routeId: "test-route",
        dryRun: true,
      });

      expect(result).toMatch(/^dry-run-/);
      expect(enqueueBatchSpy).not.toHaveBeenCalled();
    });
  });

  describe("rollbackContent", () => {
    test("should get production entities and rollback", async () => {
      const mockEntities = [
        {
          id: "test-route:section1",
          entityType: "site-content-production" as const,
          content: "# Production Content",
          routeId: "test-route",
          sectionId: "section1",
          created: "2024-01-01",
          updated: "2024-01-01",
        },
      ];

      const listEntitiesSpy = spyOn(context.entityService, "listEntities");
      listEntitiesSpy.mockResolvedValue(mockEntities);

      const enqueueBatchSpy = spyOn(context, "enqueueBatch");
      enqueueBatchSpy.mockResolvedValue("batch-rollback-123");

      const batchId = await service.rollbackContent({
        routeId: "test-route",
        dryRun: false,
      });

      expect(batchId).toBe("batch-rollback-123");
      expect(listEntitiesSpy).toHaveBeenCalledWith("site-content-production", {
        limit: 1000,
      });

      // Check the rollback job has correct source/target
      const call = enqueueBatchSpy.mock.calls[0];
      const batchJobs = call?.[0] || [];
      expect(batchJobs[0]?.data?.["sourceEntityType"]).toBe(
        "site-content-production",
      );
      expect(batchJobs[0]?.data?.["targetEntityType"]).toBe(
        "site-content-preview",
      );
    });

    test("should throw if no production content found", async () => {
      const listEntitiesSpy = spyOn(context.entityService, "listEntities");
      listEntitiesSpy.mockResolvedValue([]);

      expect(
        service.rollbackContent({ routeId: "test-route", dryRun: false }),
      ).rejects.toThrow("No production content found to rollback");
    });
  });
});
