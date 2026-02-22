import { describe, it, expect, beforeEach, spyOn } from "bun:test";
import { SiteInfoService } from "../../src/services/site-info-service";
import type { IEntityService } from "@brains/plugins";
import {
  createSilentLogger,
  createMockEntityService,
} from "@brains/test-utils";
import { createMockSiteInfo } from "../fixtures/site-entities";

describe("SiteInfoService", () => {
  let mockEntityService: IEntityService;
  let siteInfoService: SiteInfoService;

  beforeEach(() => {
    SiteInfoService.resetInstance();

    mockEntityService = createMockEntityService();
    spyOn(mockEntityService, "getEntity").mockResolvedValue(null);
    spyOn(mockEntityService, "createEntity").mockResolvedValue({
      entityId: "site-info",
      jobId: "job-123",
    });

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

      spyOn(mockEntityService, "getEntity").mockResolvedValue(mockEntity);

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

      spyOn(mockEntityService, "getEntity").mockResolvedValue(mockEntity);

      await siteInfoService.initialize();

      const siteInfo = await siteInfoService.getSiteInfo();

      expect(siteInfo.title).toBe("My Site");
      expect(siteInfo.description).toBe("A simple website");
      expect(siteInfo.cta).toBeUndefined();
    });
  });

  describe("initialize", () => {
    it("should create default site info entity when none exists", async () => {
      await siteInfoService.initialize();

      // Should have called createEntity
      expect(mockEntityService.createEntity).toHaveBeenCalledTimes(1);

      expect(mockEntityService.createEntity).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "site-info",
          entityType: "site-info",
          content: expect.stringContaining("Personal Brain"),
        }),
      );
      expect(mockEntityService.createEntity).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining("knowledge management system"),
        }),
      );
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

      spyOn(mockEntityService, "getEntity").mockResolvedValue(mockEntity);

      await siteInfoService.initialize();

      // Should NOT have called createEntity
      expect(mockEntityService.createEntity).not.toHaveBeenCalled();
    });

    it("should handle errors during entity creation gracefully", async () => {
      spyOn(mockEntityService, "createEntity").mockRejectedValue(
        new Error("Database error"),
      );

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
      spyOn(mockEntityService, "getEntity").mockResolvedValue(importedEntity);

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
      const freshMockEntityService = createMockEntityService();
      spyOn(freshMockEntityService, "getEntity").mockResolvedValue(null);
      spyOn(freshMockEntityService, "createEntity").mockResolvedValue({
        entityId: "site-info",
        jobId: "job-123",
      });

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

      await customService.initialize();

      expect(mockEntityService.createEntity).toHaveBeenCalledTimes(1);
      expect(mockEntityService.createEntity).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining("Tech Docs"),
        }),
      );
      expect(mockEntityService.createEntity).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining("Technical documentation site"),
        }),
      );
      expect(mockEntityService.createEntity).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining("Get Started"),
        }),
      );
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
