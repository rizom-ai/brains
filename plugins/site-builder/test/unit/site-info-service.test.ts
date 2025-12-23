import { describe, it, expect, beforeEach, mock } from "bun:test";
import { SiteInfoService } from "../../src/services/site-info-service";
import type { IEntityService } from "@brains/entity-service";
import { createSilentLogger } from "@brains/test-utils";
import type { SiteInfoEntity } from "../../src/services/site-info-schema";
import { createMockSiteInfo } from "../fixtures/site-entities";

describe("SiteInfoService", () => {
  // Shared mock state that can be controlled per test
  let mockGetEntityImpl: () => Promise<SiteInfoEntity | null>;
  let mockCreateEntityImpl: () => Promise<{ entityId: string; jobId: string }>;

  let mockEntityService: IEntityService;
  let siteInfoService: SiteInfoService;

  beforeEach(() => {
    // Reset singleton
    SiteInfoService.resetInstance();

    // Default implementations
    mockGetEntityImpl = async (): Promise<SiteInfoEntity | null> => null;
    mockCreateEntityImpl = async (): Promise<{
      entityId: string;
      jobId: string;
    }> => ({
      entityId: "site-info",
      jobId: "job-123",
    });

    // Create mock that delegates to controllable implementations
    mockEntityService = {
      getEntity: mock(async () => mockGetEntityImpl()),
      createEntity: mock(async () => mockCreateEntityImpl()),
    } as unknown as IEntityService;

    // Create fresh instance with silent logger
    siteInfoService = SiteInfoService.createFresh(
      mockEntityService,
      createSilentLogger(),
    );
  });

  describe("getDefaultSiteInfo", () => {
    it("should return default site info with title and description", () => {
      const defaultSiteInfo = SiteInfoService.getDefaultSiteInfo();

      expect(defaultSiteInfo).toEqual({
        title: "Personal Brain",
        description: "A knowledge management system",
      });
    });
  });

  describe("getSiteInfo", () => {
    it("should return default site info when no entity exists", async () => {
      const siteInfo = await siteInfoService.getSiteInfo();

      expect(siteInfo).toEqual(SiteInfoService.getDefaultSiteInfo());
    });

    it("should parse and return site info from cache when entity exists", async () => {
      // Create a mock entity with content
      const mockEntity = createMockSiteInfo({
        content: `# Site Information

## Title
Rizom

## Description
The Rizom collective's knowledge hub

## URL
https://rizom.ai

## Theme Mode
dark

## CTA

### Heading
Join us

### Button Text
Get Started

### Button Link
https://rizom.ai/join`,
      });

      // Control mock behavior to return the entity
      mockGetEntityImpl = async (): Promise<SiteInfoEntity> => mockEntity;

      // Initialize to load the entity into cache
      await siteInfoService.initialize();

      // Get site info should now return parsed content
      const siteInfo = await siteInfoService.getSiteInfo();

      expect(siteInfo.title).toBe("Rizom");
      expect(siteInfo.description).toBe("The Rizom collective's knowledge hub");
      expect(siteInfo.themeMode).toBe("dark");
      expect(siteInfo.cta).toEqual({
        heading: "Join us",
        buttonText: "Get Started",
        buttonLink: "https://rizom.ai/join",
      });
    });

    it("should handle site info without optional fields", async () => {
      const mockEntity = createMockSiteInfo({
        content: `# Site Information

## Title
My Site

## Description
A simple website`,
      });

      mockGetEntityImpl = async (): Promise<SiteInfoEntity> => mockEntity;

      await siteInfoService.initialize();

      const siteInfo = await siteInfoService.getSiteInfo();

      expect(siteInfo.title).toBe("My Site");
      expect(siteInfo.description).toBe("A simple website");
      expect(siteInfo.cta).toBeUndefined();
    });
  });

  describe("initialize", () => {
    it("should create default site info entity when none exists", async () => {
      // Mock behavior: no existing site info
      mockGetEntityImpl = async (): Promise<SiteInfoEntity | null> => null;

      await siteInfoService.initialize();

      // Should have called createEntity
      expect(mockEntityService.createEntity).toHaveBeenCalledTimes(1);

      // Check that it created with default values
      const createCall = (
        mockEntityService.createEntity as ReturnType<typeof mock>
      ).mock.calls[0]?.[0];
      expect(createCall).toBeDefined();
      expect(createCall).toMatchObject({
        id: "site-info",
        entityType: "site-info",
      });

      // Content should contain default site info data
      expect(createCall?.content).toContain("Personal Brain");
      expect(createCall?.content).toContain("knowledge management system");
    });

    it("should not create entity when one already exists", async () => {
      // Mock behavior: existing entity with valid content
      const mockEntity = createMockSiteInfo({
        content: `# Site Information

## Title
Existing Site

## Description
Existing description`,
      });

      mockGetEntityImpl = async (): Promise<SiteInfoEntity> => mockEntity;

      await siteInfoService.initialize();

      // Should NOT have called createEntity
      expect(mockEntityService.createEntity).not.toHaveBeenCalled();
    });

    it("should handle errors during entity creation gracefully", async () => {
      // Mock behavior: no existing entity
      mockGetEntityImpl = async (): Promise<SiteInfoEntity | null> => null;

      // Mock behavior: createEntity throws error
      mockCreateEntityImpl = async (): Promise<never> => {
        throw new Error("Database error");
      };

      // Should not throw
      await siteInfoService.initialize();
    });
  });

  describe("git-sync cache invalidation bug", () => {
    it("should return stale defaults when entity is imported after initialize", async () => {
      // REGRESSION TEST: This reproduces the bug where git-sync imports entities
      // AFTER the service has initialized, leaving the cache stale with null.
      //
      // Expected behavior: getSiteInfo() should always reflect current database state
      // Actual behavior (BUG): getSiteInfo() returns cached null → falls back to defaults

      // Step 1: Initialize service with NO entity in database (simulating first boot)
      mockGetEntityImpl = async (): Promise<SiteInfoEntity | null> => null;
      await siteInfoService.initialize();

      // Verify service is using defaults since no entity exists yet
      let siteInfo = await siteInfoService.getSiteInfo();
      expect(siteInfo.title).toBe("Personal Brain"); // Default title

      // Step 2: Simulate git-sync importing the entity AFTER initialization
      const importedEntity = createMockSiteInfo({
        content: `# Site Information

## Title
Yeehaa

## Description
Personal knowledge base and professional showcase`,
      });

      // Change mock to return imported entity (as if git-sync just imported it)
      mockGetEntityImpl = async (): Promise<SiteInfoEntity> => importedEntity;

      // Step 3: Call getSiteInfo() again - should now return imported data
      siteInfo = await siteInfoService.getSiteInfo();

      // This should now pass after the fix
      expect(siteInfo.title).toBe("Yeehaa");
      expect(siteInfo.description).toBe(
        "Personal knowledge base and professional showcase",
      );
    });
  });

  describe("custom default site info", () => {
    it("should use provided custom default site info instead of hardcoded default", async () => {
      const customSiteInfo = {
        title: "Rizom",
        description: "The Rizom collective's knowledge hub",
        url: "https://rizom.ai",
        themeMode: "dark" as const,
      };

      // Create fresh mock for this test
      const freshMockEntityService = {
        getEntity: mock(async () => null),
        createEntity: mock(async () => ({
          entityId: "site-info",
          jobId: "job-123",
        })),
      } as unknown as IEntityService;

      // Create a completely fresh service with custom site info
      const customService = SiteInfoService.createFresh(
        freshMockEntityService,
        createSilentLogger(),
        customSiteInfo,
      );

      // Without any entity in database, should return custom default
      const siteInfo = await customService.getSiteInfo();

      expect(siteInfo.title).toBe("Rizom");
      expect(siteInfo.description).toBe("The Rizom collective's knowledge hub");
      expect(siteInfo.themeMode).toBe("dark");
    });

    it("should create entity with custom default when none exists", async () => {
      const customSiteInfo = {
        title: "Tech Docs",
        description: "Technical documentation site",
        cta: {
          heading: "Get Started",
          buttonText: "Read Docs",
          buttonLink: "/docs",
        },
      };

      const customService = SiteInfoService.createFresh(
        mockEntityService,
        createSilentLogger(),
        customSiteInfo,
      );

      // Mock behavior: no existing site info
      mockGetEntityImpl = async (): Promise<SiteInfoEntity | null> => null;

      await customService.initialize();

      // Should have created entity with custom values
      expect(mockEntityService.createEntity).toHaveBeenCalledTimes(1);

      const createCall = (
        mockEntityService.createEntity as ReturnType<typeof mock>
      ).mock.calls[0]?.[0];

      expect(createCall?.content).toContain("Tech Docs");
      expect(createCall?.content).toContain("Technical documentation site");
      expect(createCall?.content).toContain("Get Started");
      expect(createCall?.content).not.toContain("Personal Brain");
    });

    it("should fall back to hardcoded default when custom site info is not provided", async () => {
      const serviceWithoutCustom = SiteInfoService.createFresh(
        mockEntityService,
        createSilentLogger(),
        undefined,
      );

      const siteInfo = await serviceWithoutCustom.getSiteInfo();

      expect(siteInfo).toEqual(SiteInfoService.getDefaultSiteInfo());
    });

    it("should merge partial custom defaults with hardcoded defaults", async () => {
      const partialCustom = {
        title: "Custom Title",
        // description not provided, should use default
      };

      const service = SiteInfoService.createFresh(
        mockEntityService,
        createSilentLogger(),
        partialCustom,
      );

      const siteInfo = await service.getSiteInfo();

      expect(siteInfo.title).toBe("Custom Title");
      expect(siteInfo.description).toBe("A knowledge management system");
    });
  });
});
