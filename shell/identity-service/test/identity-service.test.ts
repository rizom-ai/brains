import { describe, it, expect, beforeEach, mock } from "bun:test";
import { IdentityService } from "../src/identity-service";
import type { IEntityService } from "@brains/entity-service";
import { createSilentLogger } from "@brains/utils";
import type { IdentityEntity } from "../src/schema";

describe("IdentityService", () => {
  // Shared mock state that can be controlled per test
  let mockGetEntityImpl: () => Promise<IdentityEntity | null>;
  let mockCreateEntityImpl: () => Promise<{ entityId: string; jobId: string }>;

  let mockEntityService: IEntityService;
  let identityService: IdentityService;

  beforeEach(() => {
    // Reset singleton
    IdentityService.resetInstance();

    // Default implementations
    mockGetEntityImpl = async () => null;
    mockCreateEntityImpl = async () => ({
      entityId: "identity",
      jobId: "job-123",
    });

    // Create mock that delegates to controllable implementations
    mockEntityService = {
      getEntity: mock(async () => mockGetEntityImpl()),
      createEntity: mock(async () => mockCreateEntityImpl()),
    } as unknown as IEntityService;

    // Create fresh instance with silent logger
    identityService = IdentityService.createFresh(
      mockEntityService,
      createSilentLogger(),
    );
  });

  describe("getDefaultIdentity", () => {
    it("should return default identity with role, purpose, and values", () => {
      const defaultIdentity = IdentityService.getDefaultIdentity();

      expect(defaultIdentity).toEqual({
        role: "Personal knowledge assistant",
        purpose:
          "Help organize, understand, and retrieve information from your personal knowledge base",
        values: ["clarity", "accuracy", "helpfulness"],
      });
    });
  });

  describe("getIdentity", () => {
    it("should return default identity when cache is null", () => {
      const identity = identityService.getIdentity();

      expect(identity).toEqual(IdentityService.getDefaultIdentity());
    });

    it("should parse and return identity from cache when entity exists", async () => {
      // Create a mock entity with content
      const mockEntity: IdentityEntity = {
        id: "identity",
        entityType: "identity",
        content: `# Brain Identity

## Role
Research assistant

## Purpose
Help with academic research

## Values

- rigor
- accuracy`,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      // Control mock behavior to return the entity
      mockGetEntityImpl = async () => mockEntity;

      // Initialize to load the entity into cache
      await identityService.initialize();

      // Get identity should now return parsed content
      const identity = identityService.getIdentity();

      expect(identity.role).toBe("Research assistant");
      expect(identity.purpose).toBe("Help with academic research");
      expect(identity.values).toEqual(["rigor", "accuracy"]);
    });
  });

  describe("initialize", () => {
    it("should create default identity entity when none exists", async () => {
      // Mock behavior: no existing identity
      mockGetEntityImpl = async () => null;

      await identityService.initialize();

      // Should have called createEntity
      expect(mockEntityService.createEntity).toHaveBeenCalledTimes(1);

      // Check that it created with default values
      const createCall = (
        mockEntityService.createEntity as ReturnType<typeof mock>
      ).mock.calls[0]?.[0];
      expect(createCall).toBeDefined();
      expect(createCall).toMatchObject({
        id: "identity",
        entityType: "identity",
      });

      // Content should contain default identity data
      expect(createCall?.content).toContain("Personal knowledge assistant");
      expect(createCall?.content).toContain("clarity");
    });

    it("should not create entity when one already exists", async () => {
      // Mock behavior: existing entity
      const mockEntity: IdentityEntity = {
        id: "identity",
        entityType: "identity",
        content: "existing content",
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      mockGetEntityImpl = async () => mockEntity;

      await identityService.initialize();

      // Should NOT have called createEntity
      expect(mockEntityService.createEntity).not.toHaveBeenCalled();
    });

    it("should handle errors during entity creation gracefully", async () => {
      // Mock behavior: no existing entity
      mockGetEntityImpl = async () => null;

      // Mock behavior: createEntity throws error
      mockCreateEntityImpl = async () => {
        throw new Error("Database error");
      };

      // Should not throw
      await identityService.initialize();
    });
  });

  describe("refreshCache", () => {
    it("should reload identity from database", async () => {
      // Mock behavior: return test entity
      mockGetEntityImpl = async () => ({
        id: "identity",
        entityType: "identity",
        content: "test content",
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      });

      await identityService.refreshCache();

      expect(mockEntityService.getEntity).toHaveBeenCalledWith(
        "identity",
        "identity",
      );
    });
  });
});
