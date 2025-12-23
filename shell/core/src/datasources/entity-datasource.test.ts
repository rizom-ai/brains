import { describe, it, expect } from "bun:test";
import { EntityDataSource } from "./entity-datasource";
import { createMockEntityService } from "@brains/test-utils";
import { z } from "@brains/utils";

describe("EntityDataSource", () => {
  describe("metadata", () => {
    it("should have correct id", () => {
      const mockEntityService = createMockEntityService();
      const entityDataSource = new EntityDataSource(mockEntityService);
      expect(entityDataSource.id).toBe("shell:entities");
    });

    it("should have correct name", () => {
      const mockEntityService = createMockEntityService();
      const entityDataSource = new EntityDataSource(mockEntityService);
      expect(entityDataSource.name).toBe("Entity DataSource");
    });

    it("should have description", () => {
      const mockEntityService = createMockEntityService();
      const entityDataSource = new EntityDataSource(mockEntityService);
      expect(entityDataSource.description).toBeDefined();
    });
  });

  describe("fetch", () => {
    it("should fetch entity content by entityType and id", async () => {
      const mockEntity = {
        id: "README",
        entityType: "base",
        content: "# Welcome\n\nThis is the README content.",
        metadata: {},
        contentHash: "abc123",
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      const mockEntityService = createMockEntityService({
        returns: { getEntity: mockEntity },
      });
      const entityDataSource = new EntityDataSource(mockEntityService);

      const schema = z.object({
        markdown: z.string(),
      });

      const result = await entityDataSource.fetch(
        {
          entityType: "base",
          query: { id: "README" },
        },
        schema,
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
      const mockEntityService = createMockEntityService();
      const entityDataSource = new EntityDataSource(mockEntityService);

      const schema = z.object({
        markdown: z.string(),
      });

      const fetchPromise = entityDataSource.fetch(
        {
          query: { id: "test" },
        },
        schema,
      );

      void expect(fetchPromise).rejects.toThrow(
        "EntityDataSource: entityType is required",
      );
    });

    it("should throw error if query.id is missing", async () => {
      const mockEntityService = createMockEntityService();
      const entityDataSource = new EntityDataSource(mockEntityService);

      const schema = z.object({
        markdown: z.string(),
      });

      const fetchPromise = entityDataSource.fetch(
        {
          entityType: "base",
          query: {},
        },
        schema,
      );

      void expect(fetchPromise).rejects.toThrow(
        "EntityDataSource: query.id is required",
      );
    });

    it("should throw error if entity not found", async () => {
      const mockEntityService = createMockEntityService({
        returns: { getEntity: null },
      });
      const entityDataSource = new EntityDataSource(mockEntityService);

      const schema = z.object({
        markdown: z.string(),
      });

      const fetchPromise = entityDataSource.fetch(
        {
          entityType: "base",
          query: { id: "nonexistent" },
        },
        schema,
      );

      void expect(fetchPromise).rejects.toThrow(
        "EntityDataSource: Entity not found (base:nonexistent)",
      );
    });

    it("should validate output against schema", async () => {
      const mockEntity = {
        id: "test",
        entityType: "base",
        content: "Test content",
        metadata: {},
        contentHash: "abc123",
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      const mockEntityService = createMockEntityService({
        returns: { getEntity: mockEntity },
      });
      const entityDataSource = new EntityDataSource(mockEntityService);

      const schema = z.object({
        markdown: z.string(),
        title: z.string(), // Required field that won't be in output
      });

      const fetchPromise = entityDataSource.fetch(
        {
          entityType: "base",
          query: { id: "test" },
        },
        schema,
      );

      void expect(fetchPromise).rejects.toThrow();
    });

    it("should handle entities with different types", async () => {
      const mockEntity = {
        id: "my-link",
        entityType: "link",
        content: "# Link Content\n\nThis is a link entity.",
        metadata: {},
        contentHash: "abc123",
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      const mockEntityService = createMockEntityService({
        returns: { getEntity: mockEntity },
      });
      const entityDataSource = new EntityDataSource(mockEntityService);

      const schema = z.object({
        markdown: z.string(),
      });

      const result = await entityDataSource.fetch(
        {
          entityType: "link",
          query: { id: "my-link" },
        },
        schema,
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
      const mockEntity = {
        id: "empty",
        entityType: "base",
        content: "",
        metadata: {},
        contentHash: "abc123",
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      const mockEntityService = createMockEntityService({
        returns: { getEntity: mockEntity },
      });
      const entityDataSource = new EntityDataSource(mockEntityService);

      const schema = z.object({
        markdown: z.string(),
      });

      const result = await entityDataSource.fetch(
        {
          entityType: "base",
          query: { id: "empty" },
        },
        schema,
      );

      expect(result).toEqual({
        markdown: "",
      });
    });
  });
});
