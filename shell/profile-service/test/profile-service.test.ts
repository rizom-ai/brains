import type { mock } from "bun:test";
import { describe, it, expect, beforeEach } from "bun:test";
import { ProfileService } from "../src/profile-service";
import type { IEntityService } from "@brains/entity-service";
import {
  createSilentLogger,
  createMockEntityService,
} from "@brains/test-utils";
import { computeContentHash } from "@brains/utils";
import type { ProfileEntity } from "../src/schema";

describe("ProfileService", () => {
  // Shared mock state that can be controlled per test
  let mockGetEntityImpl: () => Promise<ProfileEntity | null>;
  let mockCreateEntityImpl: () => Promise<{ entityId: string; jobId: string }>;

  let mockEntityService: IEntityService;
  let profileService: ProfileService;

  beforeEach(() => {
    // Reset singleton
    ProfileService.resetInstance();

    // Default implementations
    mockGetEntityImpl = async (): Promise<ProfileEntity | null> => null;
    mockCreateEntityImpl = async (): Promise<{
      entityId: string;
      jobId: string;
    }> => ({
      entityId: "profile",
      jobId: "job-123",
    });

    // Create mock using factory, then override implementations
    mockEntityService = createMockEntityService();
    (mockEntityService.getEntity as ReturnType<typeof mock>).mockImplementation(
      async () => mockGetEntityImpl(),
    );
    (
      mockEntityService.createEntity as ReturnType<typeof mock>
    ).mockImplementation(async () => mockCreateEntityImpl());

    // Create fresh instance with silent logger
    profileService = ProfileService.createFresh(
      mockEntityService,
      createSilentLogger(),
    );
  });

  describe("getDefaultProfile", () => {
    it("should return default profile with name", () => {
      const defaultProfile = ProfileService.getDefaultProfile();

      expect(defaultProfile).toEqual({
        name: "Unknown",
      });
    });
  });

  describe("getProfile", () => {
    it("should return default profile when no entity exists", () => {
      const profile = profileService.getProfile();

      expect(profile).toEqual(ProfileService.getDefaultProfile());
    });

    it("should parse and return profile from cache when entity exists", async () => {
      // Create a mock entity with content
      const mockContent = `# Profile

## Name
Rizom

## Description
Open-source collective building privacy-first tools

## Website
https://rizom.ai

## Email
contact@rizom.ai

## Social Links

### 1

#### Platform
github

#### URL
https://github.com/rizom-ai`;
      const mockEntity: ProfileEntity = {
        id: "profile",
        entityType: "profile",
        content: mockContent,
        contentHash: computeContentHash(mockContent),
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        metadata: {},
      };

      // Control mock behavior to return the entity
      mockGetEntityImpl = async (): Promise<ProfileEntity> => mockEntity;

      // Initialize to load the entity into cache
      await profileService.initialize();

      // Get profile should now return parsed content
      const profile = profileService.getProfile();

      expect(profile.name).toBe("Rizom");
      expect(profile.description).toBe(
        "Open-source collective building privacy-first tools",
      );
      expect(profile.website).toBe("https://rizom.ai");
      expect(profile.email).toBe("contact@rizom.ai");
      expect(profile.socialLinks).toHaveLength(1);
      expect(profile.socialLinks?.[0]).toMatchObject({
        platform: "github",
        url: "https://github.com/rizom-ai",
      });
    });
  });

  describe("initialize", () => {
    it("should create default profile entity when none exists", async () => {
      // Mock behavior: no existing profile
      mockGetEntityImpl = async (): Promise<ProfileEntity | null> => null;

      await profileService.initialize();

      // Should have called createEntity
      expect(mockEntityService.createEntity).toHaveBeenCalledTimes(1);

      // Check that it created with default values
      const createCall = (
        mockEntityService.createEntity as ReturnType<typeof mock>
      ).mock.calls[0]?.[0];
      expect(createCall).toBeDefined();
      expect(createCall).toMatchObject({
        id: "profile",
        entityType: "profile",
      });

      // Content should contain default profile data
      expect(createCall?.content).toContain("Unknown");
    });

    it("should not create entity when one already exists", async () => {
      // Mock behavior: existing entity with valid content
      const existingContent = `# Profile

## Name
Existing Profile`;
      const mockEntity: ProfileEntity = {
        id: "profile",
        entityType: "profile",
        content: existingContent,
        contentHash: computeContentHash(existingContent),
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        metadata: {},
      };

      mockGetEntityImpl = async (): Promise<ProfileEntity> => mockEntity;

      await profileService.initialize();

      // Should NOT have called createEntity
      expect(mockEntityService.createEntity).not.toHaveBeenCalled();
    });

    it("should handle errors during entity creation gracefully", async () => {
      // Mock behavior: no existing entity
      mockGetEntityImpl = async (): Promise<ProfileEntity | null> => null;

      // Mock behavior: createEntity throws error
      mockCreateEntityImpl = async (): Promise<never> => {
        throw new Error("Database error");
      };

      // Should not throw
      await profileService.initialize();
    });
  });

  describe("refreshCache", () => {
    it("should reload profile from database after entity import", async () => {
      // Step 1: Initialize service with NO entity in database
      mockGetEntityImpl = async (): Promise<ProfileEntity | null> => null;
      await profileService.initialize();

      // Verify service is using defaults since no entity exists yet
      let profile = profileService.getProfile();
      expect(profile.name).toBe("Unknown"); // Default name

      // Step 2: Simulate git-sync importing the entity AFTER initialization
      const importedContent = `# Profile

## Name
Yeehaa

## Description
Professional developer, writer, and knowledge worker

## Email
yeehaa@rizom.ai

## Social Links

### Social Link 1

#### Platform
github

#### URL
https://github.com/yourusername

#### Label
View my code on GitHub`;
      const importedEntity: ProfileEntity = {
        id: "profile",
        entityType: "profile",
        content: importedContent,
        contentHash: computeContentHash(importedContent),
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        metadata: {},
      };

      // Change mock to return imported entity
      mockGetEntityImpl = async (): Promise<ProfileEntity> => importedEntity;

      // Step 3: refreshCache() reloads from database
      // (In production, message bus triggers this on entity:created/updated)
      await profileService.refreshCache();
      profile = profileService.getProfile();

      // Should now have imported data
      expect(profile.name).toBe("Yeehaa");
      expect(profile.email).toBe("yeehaa@rizom.ai");
      expect(profile.socialLinks).toHaveLength(1);
      expect(profile.socialLinks?.[0]?.platform).toBe("github");
    });
  });

  describe("custom default profile", () => {
    it("should use provided custom default profile instead of hardcoded default", async () => {
      const customProfile = {
        name: "Custom Organization",
        description: "Custom description",
        website: "https://example.com",
      };

      // Create fresh mock for this test
      const freshMockEntityService = createMockEntityService();
      (
        freshMockEntityService.getEntity as ReturnType<typeof mock>
      ).mockResolvedValue(null);
      (
        freshMockEntityService.createEntity as ReturnType<typeof mock>
      ).mockResolvedValue({ entityId: "profile", jobId: "job-123" });

      // Create a completely fresh service with custom profile
      const customService = ProfileService.createFresh(
        freshMockEntityService,
        createSilentLogger(),
        customProfile,
      );

      // Without any entity in database, should return custom default
      const profile = customService.getProfile();

      expect(profile).toEqual(customProfile);
    });

    it("should create entity with custom default when none exists", async () => {
      const customProfile = {
        name: "Rizom",
        description: "Open-source collective",
        socialLinks: [
          { platform: "github" as const, url: "https://github.com/rizom-ai" },
        ],
      };

      const customService = ProfileService.createFresh(
        mockEntityService,
        createSilentLogger(),
        customProfile,
      );

      // Mock behavior: no existing profile
      mockGetEntityImpl = async (): Promise<ProfileEntity | null> => null;

      await customService.initialize();

      // Should have created entity with custom values
      expect(mockEntityService.createEntity).toHaveBeenCalledTimes(1);

      const createCall = (
        mockEntityService.createEntity as ReturnType<typeof mock>
      ).mock.calls[0]?.[0];

      expect(createCall?.content).toContain("Rizom");
      expect(createCall?.content).toContain("Open-source collective");
      expect(createCall?.content).not.toContain("Unknown");
    });

    it("should fall back to hardcoded default when custom profile is not provided", () => {
      const serviceWithoutCustom = ProfileService.createFresh(
        mockEntityService,
        createSilentLogger(),
        undefined,
      );

      const profile = serviceWithoutCustom.getProfile();

      expect(profile).toEqual(ProfileService.getDefaultProfile());
    });
  });
});
