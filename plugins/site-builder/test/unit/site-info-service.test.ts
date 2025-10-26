import { describe, it, expect, beforeEach, mock } from "bun:test";
import { SiteInfoService } from "../../src/services/site-info-service";
import type { IEntityService } from "@brains/entity-service";
import { createSilentLogger } from "@brains/utils";
import type { SiteInfoEntity } from "../../src/services/site-info-schema";

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
    it("should return default site info when cache is null", () => {
      const siteInfo = siteInfoService.getSiteInfo();

      expect(siteInfo).toEqual(SiteInfoService.getDefaultSiteInfo());
    });

    it("should parse and return site info from cache when entity exists", async () => {
      // Create a mock entity with content
      const mockEntity: SiteInfoEntity = {
        id: "site-info",
        entityType: "site-info",
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
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      // Control mock behavior to return the entity
      mockGetEntityImpl = async (): Promise<SiteInfoEntity> => mockEntity;

      // Initialize to load the entity into cache
      await siteInfoService.initialize();

      // Get site info should now return parsed content
      const siteInfo = siteInfoService.getSiteInfo();

      expect(siteInfo.title).toBe("Rizom");
      expect(siteInfo.description).toBe("The Rizom collective's knowledge hub");
      expect(siteInfo.url).toBe("https://rizom.ai");
      expect(siteInfo.themeMode).toBe("dark");
      expect(siteInfo.cta).toEqual({
        heading: "Join us",
        buttonText: "Get Started",
        buttonLink: "https://rizom.ai/join",
      });
    });

    it("should handle site info without optional fields", async () => {
      const mockEntity: SiteInfoEntity = {
        id: "site-info",
        entityType: "site-info",
        content: `# Site Information

## Title
My Site

## Description
A simple website`,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      mockGetEntityImpl = async (): Promise<SiteInfoEntity> => mockEntity;

      await siteInfoService.initialize();

      const siteInfo = siteInfoService.getSiteInfo();

      expect(siteInfo.title).toBe("My Site");
      expect(siteInfo.description).toBe("A simple website");
      expect(siteInfo.url).toBeUndefined();
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
      const mockEntity: SiteInfoEntity = {
        id: "site-info",
        entityType: "site-info",
        content: `# Site Information

## Title
Existing Site

## Description
Existing description`,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

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

  describe("refreshCache", () => {
    it("should reload site info from database", async () => {
      // Mock behavior: return test entity
      mockGetEntityImpl = async (): Promise<SiteInfoEntity> => ({
        id: "site-info",
        entityType: "site-info",
        content: "test content",
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      });

      await siteInfoService.refreshCache();

      expect(mockEntityService.getEntity).toHaveBeenCalledWith(
        "site-info",
        "site-info",
      );
    });
  });

  describe("custom default site info", () => {
    it("should use provided custom default site info instead of hardcoded default", () => {
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
      const siteInfo = customService.getSiteInfo();

      expect(siteInfo.title).toBe("Rizom");
      expect(siteInfo.description).toBe("The Rizom collective's knowledge hub");
      expect(siteInfo.url).toBe("https://rizom.ai");
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

    it("should fall back to hardcoded default when custom site info is not provided", () => {
      const serviceWithoutCustom = SiteInfoService.createFresh(
        mockEntityService,
        createSilentLogger(),
        undefined,
      );

      const siteInfo = serviceWithoutCustom.getSiteInfo();

      expect(siteInfo).toEqual(SiteInfoService.getDefaultSiteInfo());
    });

    it("should merge partial custom defaults with hardcoded defaults", () => {
      const partialCustom = {
        title: "Custom Title",
        // description not provided, should use default
      };

      const service = SiteInfoService.createFresh(
        mockEntityService,
        createSilentLogger(),
        partialCustom,
      );

      const siteInfo = service.getSiteInfo();

      expect(siteInfo.title).toBe("Custom Title");
      expect(siteInfo.description).toBe("A knowledge management system");
    });
  });
});
