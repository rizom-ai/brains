import { describe, test, expect, beforeEach } from "bun:test";
import { DynamicRouteGenerator } from "../../src/lib/dynamic-route-generator";
import { RouteRegistry } from "../../src/lib/route-registry";
import type { ServicePluginContext, ViewTemplate } from "@brains/plugins";
import { createSilentLogger } from "@brains/utils";
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

    mockContext = {
      logger,
      entityService: {
        getEntityTypes: () => entityTypes,
        listEntities: async (type: string) => entities.get(type) ?? [],
      } as unknown as ServicePluginContext["entityService"],
      listViewTemplates: () => templates,
    } as ServicePluginContext;

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
        { id: "intro-to-ai", entityType: "topic" },
        { id: "machine-learning", entityType: "topic" },
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
      entities.set("topic", [{ id: "topic1", entityType: "topic" }]);
      entities.set("profile", [{ id: "user1", entityType: "profile" }]);

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
        const testGenerator = new DynamicRouteGenerator(
          {
            ...mockContext,
            entityService: {
              getEntityTypes: () => [entity],
              listEntities: async () => [],
            } as unknown as ServicePluginContext["entityService"],
            listViewTemplates: () => [
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
            ],
          } as ServicePluginContext,
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
});
