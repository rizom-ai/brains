import { describe, it, expect, beforeEach } from "bun:test";
import { EntityDataSource } from "../src/datasources/entity-datasource";
import { createMockEntityService } from "@brains/test-utils";
import type { IEntityService } from "@brains/plugins";
import { z } from "@brains/utils";

const markdownSchema = z.object({ markdown: z.string() });

function createMockEntity(overrides: {
  id: string;
  entityType: string;
  content: string;
}) {
  return {
    id: overrides.id,
    entityType: overrides.entityType,
    content: overrides.content,
    metadata: {},
    contentHash: "abc123",
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
  };
}

describe("EntityDataSource", () => {
  let entityDataSource: EntityDataSource;
  let mockEntityService: IEntityService;

  beforeEach(() => {
    mockEntityService = createMockEntityService();
    entityDataSource = new EntityDataSource(mockEntityService);
  });

  function createWithEntity(
    entity: ReturnType<typeof createMockEntity> | null,
  ): EntityDataSource {
    const service = createMockEntityService({
      returns: { getEntity: entity },
    });
    mockEntityService = service;
    return new EntityDataSource(service);
  }

  describe("metadata", () => {
    it("should have correct id", () => {
      expect(entityDataSource.id).toBe("shell:entities");
    });

    it("should have correct name", () => {
      expect(entityDataSource.name).toBe("Entity DataSource");
    });

    it("should have description", () => {
      expect(entityDataSource.description).toBeDefined();
    });
  });

  describe("fetch", () => {
    it("should fetch entity content by entityType and id", async () => {
      const ds = createWithEntity(
        createMockEntity({
          id: "README",
          entityType: "base",
          content: "# Welcome\n\nThis is the README content.",
        }),
      );

      const result = await ds.fetch(
        { entityType: "base", query: { id: "README" } },
        markdownSchema,
      );

      expect(result).toEqual({
        markdown: "# Welcome\n\nThis is the README content.",
      });
      expect(mockEntityService.getEntity).toHaveBeenCalledWith(
        "base",
        "README",
      );
    });

    it("should throw error if entityType is missing", async () => {
      const fetchPromise = entityDataSource.fetch(
        { query: { id: "test" } },
        markdownSchema,
      );

      void expect(fetchPromise).rejects.toThrow(
        "EntityDataSource: Invalid query - entityType: Required",
      );
    });

    it("should throw error if query.id is missing", async () => {
      const fetchPromise = entityDataSource.fetch(
        { entityType: "base", query: {} },
        markdownSchema,
      );

      void expect(fetchPromise).rejects.toThrow(
        "EntityDataSource: Invalid query - query.id: Required",
      );
    });

    it("should throw error if entity not found", async () => {
      const ds = createWithEntity(null);

      const fetchPromise = ds.fetch(
        { entityType: "base", query: { id: "nonexistent" } },
        markdownSchema,
      );

      void expect(fetchPromise).rejects.toThrow(
        "EntityDataSource: Entity not found (base:nonexistent)",
      );
    });

    it("should validate output against schema", async () => {
      const ds = createWithEntity(
        createMockEntity({
          id: "test",
          entityType: "base",
          content: "Test content",
        }),
      );

      const strictSchema = z.object({
        markdown: z.string(),
        title: z.string(),
      });

      const fetchPromise = ds.fetch(
        { entityType: "base", query: { id: "test" } },
        strictSchema,
      );

      void expect(fetchPromise).rejects.toThrow();
    });

    it("should handle entities with different types", async () => {
      const ds = createWithEntity(
        createMockEntity({
          id: "my-link",
          entityType: "link",
          content: "# Link Content\n\nThis is a link entity.",
        }),
      );

      const result = await ds.fetch(
        { entityType: "link", query: { id: "my-link" } },
        markdownSchema,
      );

      expect(result).toEqual({
        markdown: "# Link Content\n\nThis is a link entity.",
      });
      expect(mockEntityService.getEntity).toHaveBeenCalledWith(
        "link",
        "my-link",
      );
    });

    it("should handle entities with empty content", async () => {
      const ds = createWithEntity(
        createMockEntity({
          id: "empty",
          entityType: "base",
          content: "",
        }),
      );

      const result = await ds.fetch(
        { entityType: "base", query: { id: "empty" } },
        markdownSchema,
      );

      expect(result).toEqual({ markdown: "" });
    });
  });
});
