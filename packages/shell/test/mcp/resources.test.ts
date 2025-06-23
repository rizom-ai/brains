import { describe, expect, it, beforeEach, mock } from "bun:test";
import { registerShellResources } from "@/mcp/resources";
import { createSilentLogger } from "@brains/utils";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { EntityService } from "@/entity/entityService";
import type { ContentRegistry } from "@/content/content-registry";
import type { ContentGenerationService } from "@/content/contentGenerationService";
import { z } from "zod";

// Create mock services
const createMockEntityService = (): EntityService =>
  ({
    getEntityTypes: mock(() => ["note", "article"]),
    getEntity: mock((entityType: string, id: string) => {
      if (id === "not-found") return null;
      return {
        id,
        entityType,
        title: `Test ${entityType}`,
        content: `Content for ${id}`,
        created: "2024-01-01T00:00:00.000Z",
        updated: "2024-01-01T00:00:00.000Z",
      };
    }),
  }) as unknown as EntityService;

const createMockContentRegistry = (): ContentRegistry =>
  ({
    listContent: mock(() => ["testSchema", "noteSchema"]),
    getSchema: mock((name: string) => {
      if (name === "not-found") return null;
      if (name === "testSchema" || name === "noteSchema") {
        return z.object({ test: z.string() });
      }
      return null;
    }),
    getTemplate: mock(() => null),
    getFormatter: mock(() => null),
  }) as unknown as ContentRegistry;

const createMockContentGenerationService = (): ContentGenerationService =>
  ({
    listTemplates: mock(() => [
      {
        name: "blog-post",
        description: "Generate a blog post",
        basePrompt: "Write a blog post",
        schema: z.object({ title: z.string(), content: z.string() }),
      },
      {
        name: "summary",
        description: "Generate a summary",
        basePrompt: "Summarize this",
        schema: z.object({ summary: z.string() }),
      },
    ]),
  }) as unknown as ContentGenerationService;

// Create mock MCP server
interface ResourceConfig {
  template: unknown;
  metadata: {
    description?: string;
    [key: string]: unknown;
  };
}

interface ResourceResult {
  contents: Array<{
    uri: string;
    text: string;
    mimeType?: string;
  }>;
}

type ResourceHandler = (uri: URL, params?: unknown) => Promise<ResourceResult>;

const createMockMcpServer = (): {
  resource: ReturnType<typeof mock>;
  getResource: (name: string) => ResourceConfig | undefined;
  getHandler: (name: string) => ResourceHandler | undefined;
  getRegisteredResources: () => string[];
} => {
  const resources = new Map<string, ResourceConfig>();
  const resourceHandlers = new Map<string, ResourceHandler>();

  return {
    resource: mock(
      (
        name: string,
        template: unknown,
        metadata: unknown,
        handler: ResourceHandler,
      ) => {
        resources.set(name, {
          template,
          metadata: metadata as {
            description?: string;
            [key: string]: unknown;
          },
        });
        resourceHandlers.set(name, handler);
      },
    ),
    getResource: (name: string): ResourceConfig | undefined =>
      resources.get(name),
    getHandler: (name: string): ResourceHandler | undefined =>
      resourceHandlers.get(name),
    getRegisteredResources: (): string[] => Array.from(resources.keys()),
  };
};

describe("MCP Resources", () => {
  let mockServer: ReturnType<typeof createMockMcpServer>;
  let entityService: EntityService;
  let contentRegistry: ContentRegistry;
  let contentGenerationService: ContentGenerationService;
  let logger: ReturnType<typeof createSilentLogger>;

  beforeEach(() => {
    mockServer = createMockMcpServer();
    entityService = createMockEntityService();
    contentRegistry = createMockContentRegistry();
    contentGenerationService = createMockContentGenerationService();
    logger = createSilentLogger();
  });

  describe("Registration", () => {
    it("should register all resources", () => {
      registerShellResources(mockServer as unknown as McpServer, {
        entityService,
        contentRegistry,
        contentGenerationService,
        logger,
      });

      const registeredResources = mockServer.getRegisteredResources();

      // Should register entity resources
      expect(registeredResources).toContain("entity_note");
      expect(registeredResources).toContain("entity_article");

      // Should register schema resources
      expect(registeredResources).toContain("schema_testSchema");
      expect(registeredResources).toContain("schema_noteSchema");

      // Should register list resources
      expect(registeredResources).toContain("entity-types");
      expect(registeredResources).toContain("schema-list");
      expect(registeredResources).toContain("content-templates");

      // Should register template resources
      expect(registeredResources).toContain("template_blog-post");
      expect(registeredResources).toContain("template_summary");
    });
  });

  describe("Entity Resources", () => {
    beforeEach(() => {
      registerShellResources(mockServer as unknown as McpServer, {
        entityService,
        contentRegistry,
        contentGenerationService,
        logger,
      });
    });

    it("should handle entity resource requests", async () => {
      const handler = mockServer.getHandler("entity_note");
      if (!handler) throw new Error("Handler not found");
      const uri = new URL("entity://note/test-id");

      const result = (await handler(uri, { id: "test-id" })) as ResourceResult;

      expect(result.contents).toHaveLength(1);
      expect(result.contents[0]?.uri).toBe("entity://note/test-id");
      const data = JSON.parse(result.contents[0]?.text ?? "{}") as Record<
        string,
        unknown
      >;
      expect(data["id"]).toBe("test-id");
      expect(data["entityType"]).toBe("note");
      expect(data["title"]).toBe("Test note");
    });

    it("should handle entity not found", async () => {
      const handler = mockServer.getHandler("entity_note");
      if (!handler) throw new Error("Handler not found");
      const uri = new URL("entity://note/not-found");

      void expect(handler(uri, { id: "not-found" })).rejects.toThrow(
        "Entity not found: note/not-found",
      );
    });

    it("should handle invalid entity ID", async () => {
      const handler = mockServer.getHandler("entity_note");
      if (!handler) throw new Error("Handler not found");
      const uri = new URL("entity://note/");

      void expect(handler(uri, { id: undefined })).rejects.toThrow(
        "Invalid entity ID in URI",
      );
    });

    it("should handle array entity IDs", async () => {
      const handler = mockServer.getHandler("entity_note");
      if (!handler) throw new Error("Handler not found");
      const uri = new URL("entity://note/test");

      void expect(handler(uri, { id: ["id1", "id2"] })).rejects.toThrow(
        "Invalid entity ID in URI",
      );
    });

    it("should register resources for all entity types", () => {
      const noteResource = mockServer.getResource("entity_note");
      if (!noteResource) throw new Error("Resource not found");
      expect(noteResource.metadata.description).toBe(
        "Access note entities by ID",
      );

      const articleResource = mockServer.getResource("entity_article");
      if (!articleResource) throw new Error("Resource not found");
      expect(articleResource.metadata.description).toBe(
        "Access article entities by ID",
      );
    });
  });

  describe("Schema Resources", () => {
    beforeEach(() => {
      registerShellResources(mockServer as unknown as McpServer, {
        entityService,
        contentRegistry,
        contentGenerationService,
        logger,
      });
    });

    it("should handle schema resource requests", async () => {
      const handler = mockServer.getHandler("schema_testSchema");
      if (!handler) throw new Error("Handler not found");
      const uri = new URL("schema://testSchema");

      const result = (await handler(uri)) as ResourceResult;

      expect(result.contents).toHaveLength(1);
      expect(result.contents[0]?.uri).toBe("schema://testSchema");
      const data = JSON.parse(result.contents[0]?.text ?? "{}") as Record<
        string,
        unknown
      >;
      expect(data["name"]).toBe("testSchema");
      expect(data["type"]).toBe("zod-schema");
    });

    it("should handle schema not found", async () => {
      const handler = mockServer.getHandler("schema_testSchema");
      if (!handler) throw new Error("Handler not found");
      const uri = new URL("schema://testSchema");

      (
        contentRegistry.getSchema as ReturnType<typeof mock>
      ).mockReturnValueOnce(undefined);

      void expect(handler(uri)).rejects.toThrow("Schema not found: testSchema");
    });

    it("should register resources for all schemas", () => {
      const testResource = mockServer.getResource("schema_testSchema");
      if (!testResource) throw new Error("Resource not found");
      expect(testResource.metadata.description).toBe(
        "Schema definition for testSchema",
      );

      const noteResource = mockServer.getResource("schema_noteSchema");
      if (!noteResource) throw new Error("Resource not found");
      expect(noteResource.metadata.description).toBe(
        "Schema definition for noteSchema",
      );
    });
  });

  describe("List Resources", () => {
    beforeEach(() => {
      registerShellResources(mockServer as unknown as McpServer, {
        entityService,
        contentRegistry,
        contentGenerationService,
        logger,
      });
    });

    it("should list entity types", async () => {
      const handler = mockServer.getHandler("entity-types");
      if (!handler) throw new Error("Handler not found");
      const uri = new URL("entity://types");

      const result = (await handler(uri)) as ResourceResult;

      expect(result.contents).toHaveLength(1);
      const data = JSON.parse(result.contents[0]?.text ?? "{}") as Record<
        string,
        unknown
      >;
      expect(data["entityTypes"]).toEqual(["note", "article"]);
    });

    it("should list schemas", async () => {
      const handler = mockServer.getHandler("schema-list");
      if (!handler) throw new Error("Handler not found");
      const uri = new URL("schema://list");

      const result = (await handler(uri)) as ResourceResult;

      expect(result.contents).toHaveLength(1);
      const data = JSON.parse(result.contents[0]?.text ?? "{}") as Record<
        string,
        unknown
      >;
      expect(data["schemaNames"]).toEqual(["testSchema", "noteSchema"]);
    });

    it("should list content templates", async () => {
      const handler = mockServer.getHandler("content-templates");
      if (!handler) throw new Error("Handler not found");
      const uri = new URL("template://list");

      const result = (await handler(uri)) as ResourceResult;

      expect(result.contents).toHaveLength(1);
      const data = JSON.parse(result.contents[0]?.text ?? "{}") as Record<
        string,
        unknown
      >;
      const templates = data["templates"] as Array<Record<string, unknown>>;
      expect(templates).toHaveLength(2);
      expect(templates[0]?.["name"]).toBe("blog-post");
      expect(templates[1]?.["name"]).toBe("summary");
    });
  });

  describe("Template Resources", () => {
    beforeEach(() => {
      registerShellResources(mockServer as unknown as McpServer, {
        entityService,
        contentRegistry,
        contentGenerationService,
        logger,
      });
    });

    it("should handle template resource requests", async () => {
      const handler = mockServer.getHandler("template_blog-post");
      if (!handler) throw new Error("Handler not found");
      const uri = new URL("template://blog-post");

      const result = (await handler(uri)) as ResourceResult;

      expect(result.contents).toHaveLength(1);
      expect(result.contents[0]?.uri).toBe("template://blog-post");
      const data = JSON.parse(result.contents[0]?.text ?? "{}") as Record<
        string,
        unknown
      >;
      expect(data["name"]).toBe("blog-post");
      expect(data["description"]).toBe("Generate a blog post");
      expect(data["basePrompt"]).toBe("Write a blog post");
      expect(data["schemaType"]).toBe("zod-schema");
    });

    it("should register resources for all templates", () => {
      const blogResource = mockServer.getResource("template_blog-post");
      if (!blogResource) throw new Error("Resource not found");
      expect(blogResource.metadata.description).toBe(
        "Content generation template: Generate a blog post",
      );

      const summaryResource = mockServer.getResource("template_summary");
      if (!summaryResource) throw new Error("Resource not found");
      expect(summaryResource.metadata.description).toBe(
        "Content generation template: Generate a summary",
      );
    });
  });

  describe("Error Handling", () => {
    beforeEach(() => {
      registerShellResources(mockServer as unknown as McpServer, {
        entityService,
        contentRegistry,
        contentGenerationService,
        logger,
      });
    });

    it("should handle errors in entity resource handler", async () => {
      const handler = mockServer.getHandler("entity_note");
      if (!handler) throw new Error("Handler not found");
      const uri = new URL("entity://note/test-id");

      const error = new Error("Database error");
      (
        entityService.getEntity as ReturnType<typeof mock>
      ).mockRejectedValueOnce(error);

      void expect(handler(uri, { id: "test-id" })).rejects.toThrow(
        "Database error",
      );
    });

    it("should handle errors in schema resource handler", async () => {
      const handler = mockServer.getHandler("schema_testSchema");
      if (!handler) throw new Error("Handler not found");
      const uri = new URL("schema://testSchema");

      const error = new Error("Schema error");
      (
        contentRegistry.getSchema as ReturnType<typeof mock>
      ).mockImplementationOnce(() => {
        throw error;
      });

      void expect(handler(uri)).rejects.toThrow("Schema error");
    });

    it("should handle errors in list resources", async () => {
      const handler = mockServer.getHandler("entity-types");
      if (!handler) throw new Error("Handler not found");
      const uri = new URL("entity://types");

      const error = new Error("List error");
      (
        entityService.getEntityTypes as ReturnType<typeof mock>
      ).mockImplementationOnce(() => {
        throw error;
      });

      void expect(handler(uri)).rejects.toThrow("List error");
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty entity types", () => {
      (entityService.getEntityTypes as ReturnType<typeof mock>).mockReturnValue(
        [],
      );

      registerShellResources(mockServer as unknown as McpServer, {
        entityService,
        contentRegistry,
        contentGenerationService,
        logger,
      });

      const registeredResources = mockServer.getRegisteredResources();
      expect(registeredResources).not.toContain("entity_note");
      expect(registeredResources).toContain("entity-types"); // List resource should still be registered
    });

    it("should handle empty schemas", () => {
      (contentRegistry.listContent as ReturnType<typeof mock>).mockReturnValue(
        [],
      );

      registerShellResources(mockServer as unknown as McpServer, {
        entityService,
        contentRegistry,
        contentGenerationService,
        logger,
      });

      const registeredResources = mockServer.getRegisteredResources();
      expect(registeredResources).not.toContain("schema_testSchema");
      expect(registeredResources).toContain("schema-list"); // List resource should still be registered
    });

    it("should handle empty templates", () => {
      (
        contentGenerationService.listTemplates as ReturnType<typeof mock>
      ).mockReturnValue([]);

      registerShellResources(mockServer as unknown as McpServer, {
        entityService,
        contentRegistry,
        contentGenerationService,
        logger,
      });

      const registeredResources = mockServer.getRegisteredResources();
      expect(registeredResources).not.toContain("template_blog-post");
      expect(registeredResources).toContain("content-templates"); // List resource should still be registered
    });
  });
});
