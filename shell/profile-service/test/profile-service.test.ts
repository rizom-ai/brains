import { describe, it, expect, beforeEach, mock } from "bun:test";
import { ProfileService } from "../src/profile-service";
import type { IEntityService } from "@brains/entity-service";
import { createSilentLogger } from "@brains/utils";
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

    // Create mock that delegates to controllable implementations
    mockEntityService = {
      getEntity: mock(async () => mockGetEntityImpl()),
      createEntity: mock(async () => mockCreateEntityImpl()),
    } as unknown as IEntityService;

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
    it("should return default profile when no entity exists", async () => {
      const profile = await profileService.getProfile();

      expect(profile).toEqual(ProfileService.getDefaultProfile());
    });

    it("should parse and return profile from cache when entity exists", async () => {
      // Create a mock entity with content
      const mockEntity: ProfileEntity = {
        id: "profile",
        entityType: "profile",
        content: `# Profile

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
https://github.com/rizom-ai`,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        metadata: {},
      };

      // Control mock behavior to return the entity
      mockGetEntityImpl = async (): Promise<ProfileEntity> => mockEntity;

      // Initialize to load the entity into cache
      await profileService.initialize();

      // Get profile should now return parsed content
      const profile = await profileService.getProfile();

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
      const mockEntity: ProfileEntity = {
        id: "profile",
        entityType: "profile",
        content: `# Profile

## Name
Existing Profile`,
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

  describe("git-sync cache invalidation bug", () => {
    it("should return stale defaults when entity is imported after initialize", async () => {
      // REGRESSION TEST: This reproduces the bug where git-sync imports entities
      // AFTER the service has initialized, leaving the cache stale with null.
      //
      // Expected behavior: getProfile() should always reflect current database state
      // Actual behavior (BUG): getProfile() returns cached null → falls back to defaults

      // Step 1: Initialize service with NO entity in database (simulating first boot)
      mockGetEntityImpl = async (): Promise<ProfileEntity | null> => null;
      await profileService.initialize();

      // Verify service is using defaults since no entity exists yet
      let profile = await profileService.getProfile();
      expect(profile.name).toBe("Unknown"); // Default name
      expect(profile.socialLinks).toBeUndefined(); // No social links

      // Step 2: Simulate git-sync importing the entity AFTER initialization
      const importedEntity: ProfileEntity = {
        id: "profile",
        entityType: "profile",
        content: `# Profile

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
View my code on GitHub`,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        metadata: {},
      };

      // Change mock to return imported entity (as if git-sync just imported it)
      mockGetEntityImpl = async (): Promise<ProfileEntity> => importedEntity;

      // Step 3: Call getProfile() again - should now return imported data
      profile = await profileService.getProfile();

      // This should now pass after the fix
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
      const freshMockEntityService = {
        getEntity: mock(async () => null),
        createEntity: mock(async () => ({
          entityId: "profile",
          jobId: "job-123",
        })),
      } as unknown as IEntityService;

      // Create a completely fresh service with custom profile
      const customService = ProfileService.createFresh(
        freshMockEntityService,
        createSilentLogger(),
        customProfile,
      );

      // Without any entity in database, should return custom default
      const profile = await customService.getProfile();

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

    it("should fall back to hardcoded default when custom profile is not provided", async () => {
      const serviceWithoutCustom = ProfileService.createFresh(
        mockEntityService,
        createSilentLogger(),
        undefined,
      );

      const profile = await serviceWithoutCustom.getProfile();

      expect(profile).toEqual(ProfileService.getDefaultProfile());
    });
  });
});
