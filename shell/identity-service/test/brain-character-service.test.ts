import { describe, it, expect, beforeEach, spyOn, type Mock } from "bun:test";
import { BrainCharacterService } from "../src/brain-character-service";
import type { IEntityService } from "@brains/entity-service";
import {
  createSilentLogger,
  createMockEntityService,
  createTestEntity,
} from "@brains/test-utils";
import type { BrainCharacterEntity } from "../src/brain-character-schema";

describe("BrainCharacterService", () => {
  // Shared mock state that can be controlled per test
  let mockGetEntityImpl: () => Promise<BrainCharacterEntity | null>;
  let mockCreateEntityImpl: () => Promise<{ entityId: string; jobId: string }>;

  let mockEntityService: IEntityService;
  let characterService: BrainCharacterService;
  let getEntitySpy: Mock<(...args: unknown[]) => Promise<unknown>>;
  let createEntitySpy: Mock<(...args: unknown[]) => Promise<unknown>>;

  beforeEach(() => {
    // Reset singleton
    BrainCharacterService.resetInstance();

    // Default implementations
    mockGetEntityImpl = async (): Promise<BrainCharacterEntity | null> => null;
    mockCreateEntityImpl = async (): Promise<{
      entityId: string;
      jobId: string;
    }> => ({
      entityId: "brain-character",
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
    characterService = BrainCharacterService.createFresh(
      mockEntityService,
      createSilentLogger(),
    );
  });

  describe("getDefaultCharacter", () => {
    it("should return default character with name, role, purpose, and values", () => {
      const defaultCharacter = BrainCharacterService.getDefaultCharacter();

      expect(defaultCharacter).toEqual({
        name: "Personal Brain",
        role: "Personal knowledge assistant",
        purpose:
          "Help organize, understand, and retrieve information from your personal knowledge base",
        values: ["clarity", "accuracy", "helpfulness"],
      });
    });
  });

  describe("getCharacter", () => {
    it("should return default character when cache is null", () => {
      const character = characterService.getCharacter();

      expect(character).toEqual(BrainCharacterService.getDefaultCharacter());
    });

    it("should parse and return character from cache when entity exists", async () => {
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
      const mockEntity = createTestEntity<BrainCharacterEntity>(
        "brain-character",
        {
          id: "brain-character",
          content: mockContent,
        },
      );

      // Control mock behavior to return the entity
      mockGetEntityImpl = async (): Promise<BrainCharacterEntity> => mockEntity;

      // Initialize to load the entity into cache
      await characterService.initialize();

      // Get character should now return parsed content
      const character = characterService.getCharacter();

      expect(character.role).toBe("Research assistant");
      expect(character.purpose).toBe("Help with academic research");
      expect(character.values).toEqual(["rigor", "accuracy"]);
    });
  });

  describe("initialize", () => {
    it("should create default character entity when none exists", async () => {
      // Mock behavior: no existing character
      mockGetEntityImpl = async (): Promise<BrainCharacterEntity | null> =>
        null;

      await characterService.initialize();

      // Should have called createEntity
      expect(mockEntityService.createEntity).toHaveBeenCalledTimes(1);

      // Check that it created with default values
      const createCall = createEntitySpy.mock.calls[0]?.[0] as
        | Record<string, unknown>
        | undefined;
      expect(createCall).toBeDefined();
      expect(createCall).toMatchObject({
        id: "brain-character",
        entityType: "brain-character",
      });

      // Content should contain default character data
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
      const mockEntity = createTestEntity<BrainCharacterEntity>(
        "brain-character",
        {
          id: "brain-character",
          content: existingContent,
        },
      );

      mockGetEntityImpl = async (): Promise<BrainCharacterEntity> => mockEntity;

      await characterService.initialize();

      // Should NOT have called createEntity
      expect(mockEntityService.createEntity).not.toHaveBeenCalled();
    });

    it("should handle errors during entity creation gracefully", async () => {
      // Mock behavior: no existing character
      mockGetEntityImpl = async (): Promise<BrainCharacterEntity | null> =>
        null;

      // Mock behavior: createEntity throws error
      mockCreateEntityImpl = async (): Promise<never> => {
        throw new Error("Database error");
      };

      // Should not throw
      await characterService.initialize();
    });
  });

  describe("refreshCache", () => {
    it("should reload character from database", async () => {
      // Mock behavior: return test entity
      const testContent = "test content";
      mockGetEntityImpl = async (): Promise<BrainCharacterEntity> =>
        createTestEntity<BrainCharacterEntity>("brain-character", {
          id: "brain-character",
          content: testContent,
        });

      await characterService.refreshCache();

      expect(mockEntityService.getEntity).toHaveBeenCalledWith(
        "brain-character",
        "brain-character",
      );
    });
  });

  describe("custom default character", () => {
    it("should use provided custom default character instead of hardcoded default", () => {
      const customCharacter = {
        name: "Tech Doc Brain",
        role: "Technical documentation assistant",
        purpose: "Help write and maintain technical documentation",
        values: ["precision", "clarity", "consistency"],
      };

      // Create fresh mock for this test
      const freshMockEntityService = createMockEntityService();
      spyOn(freshMockEntityService, "getEntity").mockResolvedValue(null);
      spyOn(freshMockEntityService, "createEntity").mockResolvedValue({
        entityId: "brain-character",
        jobId: "job-123",
      });

      // Create a completely fresh service with custom character
      const customService = BrainCharacterService.createFresh(
        freshMockEntityService,
        createSilentLogger(),
        customCharacter,
      );

      // Without any entity in database, should return custom default
      const character = customService.getCharacter();

      expect(character).toEqual(customCharacter);
    });

    it("should create entity with custom default when none exists", async () => {
      const customCharacter = {
        name: "Research Brain",
        role: "Research assistant",
        purpose: "Help with academic research",
        values: ["rigor", "thoroughness"],
      };

      const customService = BrainCharacterService.createFresh(
        mockEntityService,
        createSilentLogger(),
        customCharacter,
      );

      // Mock behavior: no existing character
      mockGetEntityImpl = async (): Promise<BrainCharacterEntity | null> =>
        null;

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

    it("should fall back to hardcoded default when custom character is not provided", () => {
      const serviceWithoutCustom = BrainCharacterService.createFresh(
        mockEntityService,
        createSilentLogger(),
        undefined,
      );

      const character = serviceWithoutCustom.getCharacter();

      expect(character).toEqual(BrainCharacterService.getDefaultCharacter());
    });
  });
});
