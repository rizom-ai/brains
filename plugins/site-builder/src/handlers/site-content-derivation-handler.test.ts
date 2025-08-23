import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { SiteContentDerivationJobHandler } from "./site-content-derivation-handler";
import {
  createServicePluginHarness,
  createServicePluginContext,
  type ServicePluginContext,
  type ProgressReporter,
} from "@brains/plugins";
import { SiteBuilderPlugin } from "../plugin";

describe("SiteContentDerivationJobHandler", () => {
  let handler: SiteContentDerivationJobHandler;
  let harness: ReturnType<typeof createServicePluginHarness<SiteBuilderPlugin>>;
  let context: ServicePluginContext;
  let mockProgressReporter: Partial<ProgressReporter>;

  beforeEach(async () => {
    harness = createServicePluginHarness<SiteBuilderPlugin>();

    const plugin = new SiteBuilderPlugin({});
    await harness.installPlugin(plugin);

    const shell = harness.getShell();
    context = createServicePluginContext(shell, "site-builder");

    handler = new SiteContentDerivationJobHandler(context);

    mockProgressReporter = {
      report: mock(() => Promise.resolve()),
    };
  });

  afterEach(() => {
    harness.reset();
  });

  describe("promote (preview to production)", () => {
    test("should successfully promote content from preview to production", async () => {
      const sourceEntity = {
        id: "landing:hero",
        entityType: "site-content-preview" as const,
        content: "# Hero Content\n\nThis is the preview content",
        routeId: "landing",
        sectionId: "hero",
        created: "2024-01-01",
        updated: "2024-01-01",
      };

      // Mock getting the source entity and checking for existing target
      const getEntitySpy = mock()
        .mockResolvedValueOnce(sourceEntity) // First call: get source entity
        .mockResolvedValueOnce(null); // Second call: check for existing target
      context.entityService.getEntity = getEntitySpy;

      // Mock creating the production entity
      const createEntitySpy = mock(() =>
        Promise.resolve({
          entityId: "landing:hero",
          jobId: "job-promote-123",
        }),
      );
      context.entityService.createEntity = createEntitySpy;

      const jobData = {
        entityId: "landing:hero",
        sourceEntityType: "site-content-preview" as const,
        targetEntityType: "site-content-production" as const,
        options: { deleteSource: false },
      };

      const result = await handler.process(
        jobData,
        "job-promote-123",
        mockProgressReporter as ProgressReporter,
      );

      // Verify source entity was fetched
      expect(getEntitySpy).toHaveBeenCalledWith(
        "site-content-preview",
        "landing:hero",
      );

      // Verify production entity was created with correct data
      expect(createEntitySpy).toHaveBeenCalledWith({
        id: "landing:hero",
        entityType: "site-content-production",
        content: "# Hero Content\n\nThis is the preview content",
        routeId: "landing",
        sectionId: "hero",
      });

      // Verify result
      expect(result).toEqual({
        entityId: "landing:hero",
        success: true,
      });

      // Verify progress was reported
      expect(mockProgressReporter.report).toHaveBeenCalled();
    });

    test("should handle source entity not found", async () => {
      // Mock entity not found
      context.entityService.getEntity = mock(() => Promise.resolve(null));

      const jobData = {
        entityId: "landing:hero",
        sourceEntityType: "site-content-preview" as const,
        targetEntityType: "site-content-production" as const,
      };

      expect(
        handler.process(
          jobData,
          "job-123",
          mockProgressReporter as ProgressReporter,
        ),
      ).rejects.toThrow(
        "Source entity not found: site-content-preview:landing:hero",
      );
    });
  });

  describe("rollback (production to preview)", () => {
    test("should successfully rollback content from production to preview", async () => {
      const sourceEntity = {
        id: "landing:hero",
        entityType: "site-content-production" as const,
        content: "# Production Content\n\nThis is the production content",
        routeId: "landing",
        sectionId: "hero",
        created: "2024-01-01",
        updated: "2024-01-01",
      };

      const existingPreview = {
        id: "landing:hero",
        entityType: "site-content-preview" as const,
        content: "# Old Preview",
        routeId: "landing",
        sectionId: "hero",
        created: "2024-01-01",
        updated: "2024-01-01",
      };

      // Mock getting entities
      const getEntitySpy = mock()
        .mockResolvedValueOnce(sourceEntity) // Get source production
        .mockResolvedValueOnce(existingPreview); // Check for existing preview
      context.entityService.getEntity = getEntitySpy;

      // Mock updating the preview entity
      const updateEntitySpy = mock(() =>
        Promise.resolve({
          entityId: "landing:hero",
          jobId: "job-rollback-123",
        }),
      );
      context.entityService.updateEntity = updateEntitySpy;

      const jobData = {
        entityId: "landing:hero",
        sourceEntityType: "site-content-production" as const,
        targetEntityType: "site-content-preview" as const,
      };

      const result = await handler.process(
        jobData,
        "job-rollback-123",
        mockProgressReporter as ProgressReporter,
      );

      // Verify entities were fetched
      expect(getEntitySpy).toHaveBeenCalledTimes(2);

      // Verify preview was updated (not created) - handler merges existing with new
      expect(updateEntitySpy).toHaveBeenCalledWith({
        id: "landing:hero",
        entityType: "site-content-preview" as const,
        content: "# Production Content\n\nThis is the production content",
        routeId: "landing",
        sectionId: "hero",
        created: "2024-01-01",
        updated: "2024-01-01",
      });

      // Verify result
      expect(result).toEqual({
        entityId: "landing:hero",
        success: true,
      });
    });

    test("should create new preview if none exists during rollback", async () => {
      const sourceEntity = {
        id: "landing:hero",
        entityType: "site-content-production" as const,
        content: "# Production Content",
        routeId: "landing",
        sectionId: "hero",
        created: "2024-01-01",
        updated: "2024-01-01",
      };

      // Mock getting entities
      const getEntitySpy = mock()
        .mockResolvedValueOnce(sourceEntity) // Get source
        .mockResolvedValueOnce(null); // No existing preview
      context.entityService.getEntity = getEntitySpy;

      // Mock creating new preview
      const createEntitySpy = mock(() =>
        Promise.resolve({
          entityId: "landing:hero",
          jobId: "job-rollback-123",
        }),
      );
      context.entityService.createEntity = createEntitySpy;

      const jobData = {
        entityId: "landing:hero",
        sourceEntityType: "site-content-production" as const,
        targetEntityType: "site-content-preview" as const,
      };

      await handler.process(
        jobData,
        "job-rollback-123",
        mockProgressReporter as ProgressReporter,
      );

      // Verify new preview was created
      expect(createEntitySpy).toHaveBeenCalledWith({
        id: "landing:hero",
        entityType: "site-content-preview",
        content: "# Production Content",
        routeId: "landing",
        sectionId: "hero",
      });
    });
  });

  describe("validateAndParse", () => {
    test("should validate correct promotion data", () => {
      const validData = {
        entityId: "landing:hero",
        sourceEntityType: "site-content-preview" as const,
        targetEntityType: "site-content-production" as const,
      };

      const result = handler.validateAndParse(validData);
      expect(result).toEqual(validData);
    });

    test("should validate correct rollback data", () => {
      const validData = {
        entityId: "landing:hero",
        sourceEntityType: "site-content-production" as const,
        targetEntityType: "site-content-preview" as const,
      };

      const result = handler.validateAndParse(validData);
      expect(result).toEqual(validData);
    });

    test("should reject invalid data", () => {
      const invalidData = {
        // Missing entityId
        sourceEntityType: "site-content-preview",
        targetEntityType: "site-content-production",
      };

      const result = handler.validateAndParse(invalidData);
      expect(result).toBeNull();
    });
  });
});
