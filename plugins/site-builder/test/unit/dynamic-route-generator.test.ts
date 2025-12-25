import { describe, test, expect, beforeEach } from "bun:test";
import { mock } from "bun:test";
import { DynamicRouteGenerator } from "../../src/lib/dynamic-route-generator";
import { RouteRegistry } from "../../src/lib/route-registry";
import type { ServicePluginContext, ViewTemplate } from "@brains/plugins";
import {
  createSilentLogger,
  createMockServicePluginContext,
} from "@brains/test-utils";
import { z } from "@brains/utils";

describe("DynamicRouteGenerator", () => {
  let routeRegistry: RouteRegistry;
  let generator: DynamicRouteGenerator;
  let mockContext: ServicePluginContext;
  let entityTypes: string[];
  let entities: Map<string, unknown[]>;
  let templates: ViewTemplate[];

  beforeEach(() => {
    entityTypes = [];
    entities = new Map();
    templates = [];
    const logger = createSilentLogger("test");
    routeRegistry = new RouteRegistry(logger);

    mockContext = createMockServicePluginContext({ logger });
    // Override entityService methods to use test data
    (
      mockContext.entityService.getEntityTypes as ReturnType<typeof mock>
    ).mockImplementation(() => entityTypes);
    (
      mockContext.entityService.listEntities as ReturnType<typeof mock>
    ).mockImplementation(async (type: string) => entities.get(type) ?? []);
    // Override listViewTemplates to use test data
    (
      mockContext.listViewTemplates as ReturnType<typeof mock>
    ).mockImplementation(() => templates);

    generator = new DynamicRouteGenerator(mockContext, routeRegistry);
  });

  describe("generateEntityRoutes", () => {
    test("should not generate routes when no entity types exist", async () => {
      await generator.generateEntityRoutes();
      expect(routeRegistry.size()).toBe(0);
    });

    test("should not generate routes when entity has no matching templates", async () => {
      entityTypes.push("topic");

      await generator.generateEntityRoutes();
      expect(routeRegistry.size()).toBe(0);
    });

    test("should generate routes when entity has matching list and detail templates", async () => {
      // Set up entity type and entities
      entityTypes.push("topic");
      entities.set("topic", [
        {
          id: "intro-to-ai",
          entityType: "topic",
          metadata: { slug: "intro-to-ai" },
        },
        {
          id: "machine-learning",
          entityType: "topic",
          metadata: { slug: "machine-learning" },
        },
      ]);

      // Set up templates
      templates.push(
        {
          name: "topics:topic-list",
          pluginId: "topics",
          schema: z.object({}),
          renderers: {},
          interactive: false,
        },
        {
          name: "topics:topic-detail",
          pluginId: "topics",
          schema: z.object({}),
          renderers: {},
          interactive: false,
        },
      );

      await generator.generateEntityRoutes();

      // Should have 1 index route + 2 detail routes
      expect(routeRegistry.size()).toBe(3);

      // Check index route
      const indexRoute = routeRegistry.get("/topics");
      expect(indexRoute).toBeDefined();
      expect(indexRoute?.id).toBe("topic-index");

      // Check detail routes
      expect(routeRegistry.get("/topics/intro-to-ai")).toBeDefined();
      expect(routeRegistry.get("/topics/machine-learning")).toBeDefined();
    });

    test("should generate list route when only list template exists", async () => {
      entityTypes.push("topic");

      // Only list template, no detail
      templates.push({
        name: "topics:topic-list",
        pluginId: "topics",
        schema: z.object({}),
        renderers: {},
        interactive: false,
      });

      await generator.generateEntityRoutes();
      expect(routeRegistry.size()).toBe(1);

      // Check that list route was created
      const indexRoute = routeRegistry.get("/topics");
      expect(indexRoute).toBeDefined();
      expect(indexRoute?.id).toBe("topic-index");
    });

    test("should handle multiple entity types", async () => {
      entityTypes.push("topic", "profile");
      entities.set("topic", [
        { id: "topic1", entityType: "topic", metadata: {} },
      ]);
      entities.set("profile", [
        { id: "user1", entityType: "profile", metadata: {} },
      ]);

      templates.push(
        {
          name: "topics:topic-list",
          pluginId: "topics",
          schema: z.object({}),
          renderers: {},
          interactive: false,
        },
        {
          name: "topics:topic-detail",
          pluginId: "topics",
          schema: z.object({}),
          renderers: {},
          interactive: false,
        },
        {
          name: "profiles:profile-list",
          pluginId: "profiles",
          schema: z.object({}),
          renderers: {},
          interactive: false,
        },
        {
          name: "profiles:profile-detail",
          pluginId: "profiles",
          schema: z.object({}),
          renderers: {},
          interactive: false,
        },
      );

      await generator.generateEntityRoutes();

      // Should have 2 index routes + 2 detail routes = 4 total
      expect(routeRegistry.size()).toBe(4);
      expect(routeRegistry.get("/topics")).toBeDefined();
      expect(routeRegistry.get("/profiles")).toBeDefined();
    });

    test("should remove routes for deleted entities on regeneration", async () => {
      // Set up entity type and entities
      entityTypes.push("blog");
      entities.set("blog", [
        {
          id: "post-1",
          entityType: "blog",
          metadata: { slug: "post-1" },
        },
        {
          id: "post-2",
          entityType: "blog",
          metadata: { slug: "post-2" },
        },
      ]);

      // Set up templates
      templates.push(
        {
          name: "blog:blog-list",
          pluginId: "blog",
          schema: z.object({}),
          renderers: {},
          interactive: false,
        },
        {
          name: "blog:blog-detail",
          pluginId: "blog",
          schema: z.object({}),
          renderers: {},
          interactive: false,
        },
      );

      // Generate routes
      await generator.generateEntityRoutes();

      // Should have 1 index route + 2 detail routes
      expect(routeRegistry.size()).toBe(3);
      expect(routeRegistry.get("/blogs")).toBeDefined();
      expect(routeRegistry.get("/blogs/post-1")).toBeDefined();
      expect(routeRegistry.get("/blogs/post-2")).toBeDefined();

      // Delete one entity
      entities.set("blog", [
        {
          id: "post-2",
          entityType: "blog",
          metadata: { slug: "post-2" },
        },
      ]);

      // Regenerate routes
      await generator.generateEntityRoutes();

      // Should now have 1 index route + 1 detail route
      expect(routeRegistry.size()).toBe(2);
      expect(routeRegistry.get("/blogs")).toBeDefined();
      expect(routeRegistry.get("/blogs/post-1")).toBeUndefined(); // Deleted
      expect(routeRegistry.get("/blogs/post-2")).toBeDefined(); // Still exists
    });
  });

  describe("pluralization", () => {
    test("should correctly pluralize entity types in paths", async () => {
      const testCases = [
        { entity: "topic", expected: "/topics" },
        { entity: "category", expected: "/categories" },
        { entity: "class", expected: "/classes" },
        { entity: "box", expected: "/boxes" },
        { entity: "match", expected: "/matches" },
      ];

      for (const { entity, expected } of testCases) {
        const testLogger = createSilentLogger("test");
        const testRegistry = new RouteRegistry(testLogger);

        const testContext = createMockServicePluginContext({
          logger: testLogger,
        });
        (
          testContext.entityService.getEntityTypes as ReturnType<typeof mock>
        ).mockImplementation(() => [entity]);
        (
          testContext.entityService.listEntities as ReturnType<typeof mock>
        ).mockImplementation(async () => []);
        (
          testContext.listViewTemplates as ReturnType<typeof mock>
        ).mockImplementation(() => [
          {
            name: `test:${entity}-list`,
            pluginId: "test",
            schema: z.object({}),
            renderers: {},
            interactive: false,
          },
          {
            name: `test:${entity}-detail`,
            pluginId: "test",
            schema: z.object({}),
            renderers: {},
            interactive: false,
          },
        ]);

        const testGenerator = new DynamicRouteGenerator(
          testContext,
          testRegistry,
        );

        await testGenerator.generateEntityRoutes();

        const route = testRegistry.get(expected);
        expect(route).toBeDefined();
      }
    });
  });

  describe("template matching", () => {
    test("should match templates without plugin prefix", async () => {
      entityTypes.push("topic");
      templates.push(
        {
          name: "topic-list",
          pluginId: "topics",
          schema: z.object({}),
          renderers: {},
          interactive: false,
        },
        {
          name: "topic-detail",
          pluginId: "topics",
          schema: z.object({}),
          renderers: {},
          interactive: false,
        },
      );

      await generator.generateEntityRoutes();
      expect(routeRegistry.size()).toBe(1); // Just index route since no entities
    });

    test("should prefer templates with plugin prefix", async () => {
      entityTypes.push("topic");
      templates.push(
        {
          name: "topic-list",
          pluginId: "old-plugin",
          schema: z.object({}),
          renderers: {},
          interactive: false,
        },
        {
          name: "new-plugin:topic-list",
          pluginId: "new-plugin",
          schema: z.object({}),
          renderers: {},
          interactive: false,
        },
        {
          name: "new-plugin:topic-detail",
          pluginId: "new-plugin",
          schema: z.object({}),
          renderers: {},
          interactive: false,
        },
      );

      await generator.generateEntityRoutes();

      const route = routeRegistry.get("/topics");
      expect(route).toBeDefined();
      expect(route?.sections[0]?.template).toBe("new-plugin:topic-list");
    });
  });

  describe("entity route config", () => {
    test("should use custom label with default pluralName", async () => {
      // Set up entity type
      entityTypes.push("post");
      entities.set("post", [
        { id: "essay-1", entityType: "post", metadata: { slug: "essay-1" } },
      ]);

      // Set up templates
      templates.push(
        {
          name: "blog:post-list",
          pluginId: "blog",
          schema: z.object({}),
          renderers: {},
          interactive: false,
        },
        {
          name: "blog:post-detail",
          pluginId: "blog",
          schema: z.object({}),
          renderers: {},
          interactive: false,
        },
      );

      // Create generator with entity route config
      const configuredGenerator = new DynamicRouteGenerator(
        mockContext,
        routeRegistry,
        {
          post: { label: "Essay" }, // pluralName defaults to 'essays'
        },
      );

      await configuredGenerator.generateEntityRoutes();

      // Should create routes at /essays (not /posts)
      const indexRoute = routeRegistry.get("/essays");
      expect(indexRoute).toBeDefined();
      expect(indexRoute?.title).toBe("Essays");
      expect(indexRoute?.navigation?.label).toBe("Essays");

      // Detail route should also use /essays
      const detailRoute = routeRegistry.get("/essays/essay-1");
      expect(detailRoute).toBeDefined();
    });

    test("should use custom label with explicit pluralName", async () => {
      entityTypes.push("deck");
      entities.set("deck", [
        { id: "deck-1", entityType: "deck", metadata: { slug: "deck-1" } },
      ]);

      templates.push(
        {
          name: "decks:deck-list",
          pluginId: "decks",
          schema: z.object({}),
          renderers: {},
          interactive: false,
        },
        {
          name: "decks:deck-detail",
          pluginId: "decks",
          schema: z.object({}),
          renderers: {},
          interactive: false,
        },
      );

      // Explicit pluralName override
      const configuredGenerator = new DynamicRouteGenerator(
        mockContext,
        routeRegistry,
        {
          deck: { label: "Presentation", pluralName: "talks" },
        },
      );

      await configuredGenerator.generateEntityRoutes();

      // Should use explicit pluralName
      const indexRoute = routeRegistry.get("/talks");
      expect(indexRoute).toBeDefined();
      expect(indexRoute?.title).toBe("Presentations");
      expect(indexRoute?.navigation?.label).toBe("Presentations");

      const detailRoute = routeRegistry.get("/talks/deck-1");
      expect(detailRoute).toBeDefined();
    });

    test("should handle mixed configured and non-configured entity types", async () => {
      entityTypes.push("post", "topic");
      entities.set("post", [
        { id: "post-1", entityType: "post", metadata: { slug: "post-1" } },
      ]);
      entities.set("topic", [
        { id: "topic-1", entityType: "topic", metadata: { slug: "topic-1" } },
      ]);

      templates.push(
        {
          name: "blog:post-list",
          pluginId: "blog",
          schema: z.object({}),
          renderers: {},
          interactive: false,
        },
        {
          name: "blog:post-detail",
          pluginId: "blog",
          schema: z.object({}),
          renderers: {},
          interactive: false,
        },
        {
          name: "topics:topic-list",
          pluginId: "topics",
          schema: z.object({}),
          renderers: {},
          interactive: false,
        },
        {
          name: "topics:topic-detail",
          pluginId: "topics",
          schema: z.object({}),
          renderers: {},
          interactive: false,
        },
      );

      // Only configure post, leave topic as default
      const configuredGenerator = new DynamicRouteGenerator(
        mockContext,
        routeRegistry,
        {
          post: { label: "Essay" },
        },
      );

      await configuredGenerator.generateEntityRoutes();

      // Configured entity (post -> essays)
      const essaysRoute = routeRegistry.get("/essays");
      expect(essaysRoute).toBeDefined();
      expect(essaysRoute?.navigation?.label).toBe("Essays");

      // Non-configured entity (topic -> topics, auto-generated)
      const topicsRoute = routeRegistry.get("/topics");
      expect(topicsRoute).toBeDefined();
      expect(topicsRoute?.navigation?.label).toBe("Topics");

      // Detail routes
      expect(routeRegistry.get("/essays/post-1")).toBeDefined();
      expect(routeRegistry.get("/topics/topic-1")).toBeDefined();
    });

    test("should maintain backward compatibility without config", async () => {
      entityTypes.push("post");
      entities.set("post", [
        { id: "post-1", entityType: "post", metadata: { slug: "post-1" } },
      ]);

      templates.push(
        {
          name: "blog:post-list",
          pluginId: "blog",
          schema: z.object({}),
          renderers: {},
          interactive: false,
        },
        {
          name: "blog:post-detail",
          pluginId: "blog",
          schema: z.object({}),
          renderers: {},
          interactive: false,
        },
      );

      // No entity route config (undefined)
      const defaultGenerator = new DynamicRouteGenerator(
        mockContext,
        routeRegistry,
        undefined,
      );

      await defaultGenerator.generateEntityRoutes();

      // Should use auto-generated values
      const indexRoute = routeRegistry.get("/posts");
      expect(indexRoute).toBeDefined();
      expect(indexRoute?.navigation?.label).toBe("Posts");

      const detailRoute = routeRegistry.get("/posts/post-1");
      expect(detailRoute).toBeDefined();
    });
  });

  describe("pagination", () => {
    test("should generate paginated routes by default", async () => {
      entityTypes.push("post");
      // Create 15 entities to trigger multiple pages with default pageSize of 10
      const posts = Array.from({ length: 15 }, (_, i) => ({
        id: `post-${i + 1}`,
        entityType: "post",
        metadata: { slug: `post-${i + 1}` },
      }));
      entities.set("post", posts);

      templates.push({
        name: "blog:post-list",
        pluginId: "blog",
        schema: z.object({}),
        renderers: {},
        interactive: false,
      });

      await generator.generateEntityRoutes();

      // Should have 2 paginated list routes (15 items / 10 per page = 2 pages)
      const page1Route = routeRegistry.get("/posts");
      expect(page1Route).toBeDefined();
      expect(page1Route?.id).toBe("post-index");
      expect(page1Route?.sections[0]?.dataQuery?.query?.["page"]).toBe(1);
      expect(page1Route?.sections[0]?.dataQuery?.query?.["pageSize"]).toBe(10);

      const page2Route = routeRegistry.get("/posts/page/2");
      expect(page2Route).toBeDefined();
      expect(page2Route?.id).toBe("post-index-page-2");
      expect(page2Route?.sections[0]?.dataQuery?.query?.["page"]).toBe(2);
    });

    test("should only show navigation on first page", async () => {
      entityTypes.push("post");
      const posts = Array.from({ length: 15 }, (_, i) => ({
        id: `post-${i + 1}`,
        entityType: "post",
        metadata: { slug: `post-${i + 1}` },
      }));
      entities.set("post", posts);

      templates.push({
        name: "blog:post-list",
        pluginId: "blog",
        schema: z.object({}),
        renderers: {},
        interactive: false,
      });

      await generator.generateEntityRoutes();

      const page1Route = routeRegistry.get("/posts");
      expect(page1Route?.navigation?.show).toBe(true);

      const page2Route = routeRegistry.get("/posts/page/2");
      expect(page2Route?.navigation).toBeUndefined();
    });

    test("should include baseUrl in paginated route data query", async () => {
      entityTypes.push("post");
      const posts = Array.from({ length: 15 }, (_, i) => ({
        id: `post-${i + 1}`,
        entityType: "post",
        metadata: { slug: `post-${i + 1}` },
      }));
      entities.set("post", posts);

      templates.push({
        name: "blog:post-list",
        pluginId: "blog",
        schema: z.object({}),
        renderers: {},
        interactive: false,
      });

      await generator.generateEntityRoutes();

      const page1Route = routeRegistry.get("/posts");
      expect(page1Route?.sections[0]?.dataQuery?.query?.["baseUrl"]).toBe(
        "/posts",
      );

      const page2Route = routeRegistry.get("/posts/page/2");
      expect(page2Route?.sections[0]?.dataQuery?.query?.["baseUrl"]).toBe(
        "/posts",
      );
    });

    test("should respect custom pageSize in config", async () => {
      entityTypes.push("post");
      // Create 10 entities, with pageSize of 3 = 4 pages
      const posts = Array.from({ length: 10 }, (_, i) => ({
        id: `post-${i + 1}`,
        entityType: "post",
        metadata: { slug: `post-${i + 1}` },
      }));
      entities.set("post", posts);

      templates.push({
        name: "blog:post-list",
        pluginId: "blog",
        schema: z.object({}),
        renderers: {},
        interactive: false,
      });

      const configuredGenerator = new DynamicRouteGenerator(
        mockContext,
        routeRegistry,
        {
          post: { label: "Essay", pageSize: 3 },
        },
      );

      await configuredGenerator.generateEntityRoutes();

      // Should have 4 pages (10 items / 3 per page)
      expect(routeRegistry.get("/essays")).toBeDefined();
      expect(routeRegistry.get("/essays/page/2")).toBeDefined();
      expect(routeRegistry.get("/essays/page/3")).toBeDefined();
      expect(routeRegistry.get("/essays/page/4")).toBeDefined();
      expect(routeRegistry.get("/essays/page/5")).toBeUndefined();

      // Verify pageSize in data query
      const page1Route = routeRegistry.get("/essays");
      expect(page1Route?.sections[0]?.dataQuery?.query?.["pageSize"]).toBe(3);
    });

    test("should disable pagination when paginate is false", async () => {
      entityTypes.push("post");
      const posts = Array.from({ length: 15 }, (_, i) => ({
        id: `post-${i + 1}`,
        entityType: "post",
        metadata: { slug: `post-${i + 1}` },
      }));
      entities.set("post", posts);

      templates.push({
        name: "blog:post-list",
        pluginId: "blog",
        schema: z.object({}),
        renderers: {},
        interactive: false,
      });

      const configuredGenerator = new DynamicRouteGenerator(
        mockContext,
        routeRegistry,
        {
          post: { label: "Essay", paginate: false },
        },
      );

      await configuredGenerator.generateEntityRoutes();

      // Should only have single index route with limit instead of pagination
      expect(routeRegistry.get("/essays")).toBeDefined();
      expect(routeRegistry.get("/essays/page/2")).toBeUndefined();

      const indexRoute = routeRegistry.get("/essays");
      expect(indexRoute?.sections[0]?.dataQuery?.query?.["limit"]).toBe(100);
      expect(
        indexRoute?.sections[0]?.dataQuery?.query?.["page"],
      ).toBeUndefined();
    });

    test("should generate single page when entities fit in one page", async () => {
      entityTypes.push("post");
      // Only 5 entities with default pageSize of 10
      const posts = Array.from({ length: 5 }, (_, i) => ({
        id: `post-${i + 1}`,
        entityType: "post",
        metadata: { slug: `post-${i + 1}` },
      }));
      entities.set("post", posts);

      templates.push({
        name: "blog:post-list",
        pluginId: "blog",
        schema: z.object({}),
        renderers: {},
        interactive: false,
      });

      await generator.generateEntityRoutes();

      // Should only have page 1
      expect(routeRegistry.get("/posts")).toBeDefined();
      expect(routeRegistry.get("/posts/page/2")).toBeUndefined();
    });

    test("should generate at least one page even with zero entities", async () => {
      entityTypes.push("post");
      entities.set("post", []);

      templates.push({
        name: "blog:post-list",
        pluginId: "blog",
        schema: z.object({}),
        renderers: {},
        interactive: false,
      });

      await generator.generateEntityRoutes();

      // Should still create page 1
      expect(routeRegistry.get("/posts")).toBeDefined();
      expect(routeRegistry.get("/posts/page/2")).toBeUndefined();
    });
  });
});
