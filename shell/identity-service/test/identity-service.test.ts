import { describe, it, expect, beforeEach, spyOn, type Mock } from "bun:test";
import { IdentityService } from "../src/identity-service";
import type { IEntityService } from "@brains/entity-service";
import {
  createSilentLogger,
  createMockEntityService,
} from "@brains/test-utils";
import { computeContentHash } from "@brains/utils";
import type { IdentityEntity } from "../src/schema";

describe("IdentityService", () => {
  // Shared mock state that can be controlled per test
  let mockGetEntityImpl: () => Promise<IdentityEntity | null>;
  let mockCreateEntityImpl: () => Promise<{ entityId: string; jobId: string }>;

  let mockEntityService: IEntityService;
  let identityService: IdentityService;
  let getEntitySpy: Mock<(...args: unknown[]) => Promise<unknown>>;
  let createEntitySpy: Mock<(...args: unknown[]) => Promise<unknown>>;

  beforeEach(() => {
    // Reset singleton
    IdentityService.resetInstance();

    // Default implementations
    mockGetEntityImpl = async (): Promise<IdentityEntity | null> => null;
    mockCreateEntityImpl = async (): Promise<{
      entityId: string;
      jobId: string;
    }> => ({
      entityId: "identity",
      jobId: "job-123",
    });

    // Create mock using factory, then override implementations
    mockEntityService = createMockEntityService();
    getEntitySpy = spyOn(
      mockEntityService,
      "getEntity",
    ) as unknown as typeof getEntitySpy;
    createEntitySpy = spyOn(
      mockEntityService,
      "createEntity",
    ) as unknown as typeof createEntitySpy;

    getEntitySpy.mockImplementation(async () => mockGetEntityImpl());
    createEntitySpy.mockImplementation(async () => mockCreateEntityImpl());

    // Create fresh instance with silent logger
    identityService = IdentityService.createFresh(
      mockEntityService,
      createSilentLogger(),
    );
  });

  describe("getDefaultIdentity", () => {
    it("should return default identity with name, role, purpose, and values", () => {
      const defaultIdentity = IdentityService.getDefaultIdentity();

      expect(defaultIdentity).toEqual({
        name: "Personal Brain",
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
      const mockContent = `# Brain Identity

## Name
Research Brain

## Role
Research assistant

## Purpose
Help with academic research

## Values

- rigor
- accuracy`;
      const mockEntity: IdentityEntity = {
        id: "identity",
        entityType: "identity",
        content: mockContent,
        contentHash: computeContentHash(mockContent),
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        metadata: {},
      };

      // Control mock behavior to return the entity
      mockGetEntityImpl = async (): Promise<IdentityEntity> => mockEntity;

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
      mockGetEntityImpl = async (): Promise<IdentityEntity | null> => null;

      await identityService.initialize();

      // Should have called createEntity
      expect(mockEntityService.createEntity).toHaveBeenCalledTimes(1);

      // Check that it created with default values
      const createCall = createEntitySpy.mock.calls[0]?.[0] as
        | Record<string, unknown>
        | undefined;
      expect(createCall).toBeDefined();
      expect(createCall).toMatchObject({
        id: "identity",
        entityType: "identity",
      });

      // Content should contain default identity data
      expect(createCall?.["content"]).toContain("Personal knowledge assistant");
      expect(createCall?.["content"]).toContain("clarity");
    });

    it("should not create entity when one already exists", async () => {
      // Mock behavior: existing entity with valid content
      const existingContent = `# Brain Identity

## Name
Existing Brain

## Role
Existing role

## Purpose
Existing purpose

## Values

- existing value`;
      const mockEntity: IdentityEntity = {
        id: "identity",
        entityType: "identity",
        content: existingContent,
        contentHash: computeContentHash(existingContent),
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        metadata: {},
      };

      mockGetEntityImpl = async (): Promise<IdentityEntity> => mockEntity;

      await identityService.initialize();

      // Should NOT have called createEntity
      expect(mockEntityService.createEntity).not.toHaveBeenCalled();
    });

    it("should handle errors during entity creation gracefully", async () => {
      // Mock behavior: no existing entity
      mockGetEntityImpl = async (): Promise<IdentityEntity | null> => null;

      // Mock behavior: createEntity throws error
      mockCreateEntityImpl = async (): Promise<never> => {
        throw new Error("Database error");
      };

      // Should not throw
      await identityService.initialize();
    });
  });

  describe("refreshCache", () => {
    it("should reload identity from database", async () => {
      // Mock behavior: return test entity
      const testContent = "test content";
      mockGetEntityImpl = async (): Promise<IdentityEntity> => ({
        id: "identity",
        entityType: "identity",
        content: testContent,
        contentHash: computeContentHash(testContent),
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        metadata: {},
      });

      await identityService.refreshCache();

      expect(mockEntityService.getEntity).toHaveBeenCalledWith(
        "identity",
        "identity",
      );
    });
  });

  describe("custom default identity", () => {
    it("should use provided custom default identity instead of hardcoded default", () => {
      const customIdentity = {
        name: "Tech Doc Brain",
        role: "Technical documentation assistant",
        purpose: "Help write and maintain technical documentation",
        values: ["precision", "clarity", "consistency"],
      };

      // Create fresh mock for this test
      const freshMockEntityService = createMockEntityService();
      spyOn(freshMockEntityService, "getEntity").mockResolvedValue(null);
      spyOn(freshMockEntityService, "createEntity").mockResolvedValue({
        entityId: "identity",
        jobId: "job-123",
      });

      // Create a completely fresh service with custom identity
      const customService = IdentityService.createFresh(
        freshMockEntityService,
        createSilentLogger(),
        customIdentity,
      );

      // Without any entity in database, should return custom default
      const identity = customService.getIdentity();

      expect(identity).toEqual(customIdentity);
    });

    it("should create entity with custom default when none exists", async () => {
      const customIdentity = {
        name: "Research Brain",
        role: "Research assistant",
        purpose: "Help with academic research",
        values: ["rigor", "thoroughness"],
      };

      const customService = IdentityService.createFresh(
        mockEntityService,
        createSilentLogger(),
        customIdentity,
      );

      // Mock behavior: no existing identity
      mockGetEntityImpl = async (): Promise<IdentityEntity | null> => null;

      await customService.initialize();

      // Should have created entity with custom values
      expect(mockEntityService.createEntity).toHaveBeenCalledTimes(1);

      const createCall = createEntitySpy.mock.calls[0]?.[0] as
        | Record<string, unknown>
        | undefined;

      expect(createCall?.["content"]).toContain("Research assistant");
      expect(createCall?.["content"]).toContain("rigor");
      expect(createCall?.["content"]).not.toContain(
        "Personal knowledge assistant",
      );
    });

    it("should fall back to hardcoded default when custom identity is not provided", () => {
      const serviceWithoutCustom = IdentityService.createFresh(
        mockEntityService,
        createSilentLogger(),
        undefined,
      );

      const identity = serviceWithoutCustom.getIdentity();

      expect(identity).toEqual(IdentityService.getDefaultIdentity());
    });
  });
});
