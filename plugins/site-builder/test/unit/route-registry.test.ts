import { describe, it, expect, beforeEach } from "bun:test";
import { RouteRegistry } from "../../src/lib/route-registry";
import type { RouteDefinition } from "../../src/types/routes";
import { createSilentLogger } from "@brains/utils";

describe("RouteRegistry", () => {
  let registry: RouteRegistry;
  const logger = createSilentLogger("test");

  beforeEach(() => {
    registry = new RouteRegistry(logger);
  });

  describe("navigation functionality", () => {
    it("should return empty array when no routes have navigation", () => {
      const route: RouteDefinition = {
        id: "test",
        path: "/test",
        title: "Test",
        description: "Test route",
        sections: [],
      };

      registry.register(route);
      const items = registry.getNavigationItems("main");

      expect(items).toEqual([]);
    });

    it("should return navigation items for routes with navigation metadata", () => {
      const routes: RouteDefinition[] = [
        {
          id: "home",
          path: "/",
          title: "Home",
          description: "Home page",
          navigation: {
            show: true,
            label: "Home",
            slot: "main",
            priority: 10,
          },
          sections: [],
        },
        {
          id: "about",
          path: "/about",
          title: "About Us",
          description: "About page",
          navigation: {
            show: true,
            slot: "main",
            priority: 20,
          },
          sections: [],
        },
        {
          id: "hidden",
          path: "/hidden",
          title: "Hidden Page",
          description: "Not in nav",
          navigation: {
            show: false,
            slot: "main",
            priority: 30,
          },
          sections: [],
        },
      ];

      routes.forEach((route) => registry.register(route));
      const items = registry.getNavigationItems("main");

      expect(items).toHaveLength(2);
      expect(items[0]).toEqual({
        label: "Home",
        href: "/",
        priority: 10,
      });
      expect(items[1]).toEqual({
        label: "About Us", // Uses title when label not specified
        href: "/about",
        priority: 20,
      });
    });

    it("should sort navigation items by priority", () => {
      const routes: RouteDefinition[] = [
        {
          id: "third",
          path: "/third",
          title: "Third",
          description: "Third page",
          navigation: {
            show: true,
            slot: "main",
            priority: 30,
          },
          sections: [],
        },
        {
          id: "first",
          path: "/first",
          title: "First",
          description: "First page",
          navigation: {
            show: true,
            slot: "main",
            priority: 10,
          },
          sections: [],
        },
        {
          id: "second",
          path: "/second",
          title: "Second",
          description: "Second page",
          navigation: {
            show: true,
            slot: "main",
            priority: 20,
          },
          sections: [],
        },
      ];

      routes.forEach((route) => registry.register(route));
      const items = registry.getNavigationItems("main");

      expect(items).toHaveLength(3);
      expect(items[0]?.href).toBe("/first");
      expect(items[1]?.href).toBe("/second");
      expect(items[2]?.href).toBe("/third");
    });

    it("should only return items for the specified slot", () => {
      const routes: RouteDefinition[] = [
        {
          id: "main-item",
          path: "/main",
          title: "Main Item",
          description: "In main nav",
          navigation: {
            show: true,
            slot: "main",
            priority: 10,
          },
          sections: [],
        },
        // This would be for a future slot type
        // {
        //   id: "other-item",
        //   path: "/other",
        //   title: "Other Item",
        //   description: "In other nav",
        //   navigation: {
        //     show: true,
        //     slot: "sidebar",
        //     priority: 10,
        //   },
        //   sections: [],
        // },
      ];

      routes.forEach((route) => registry.register(route));
      const mainItems = registry.getNavigationItems("main");

      expect(mainItems).toHaveLength(1);
      expect(mainItems[0]?.href).toBe("/main");
    });

    it("should use default priority when not specified", () => {
      const route: RouteDefinition = {
        id: "test",
        path: "/test",
        title: "Test",
        description: "Test page",
        navigation: {
          show: true,
          slot: "main" as const,
          priority: undefined as unknown as number, // Testing default priority
        },
        sections: [],
      };

      registry.register(route);
      const items = registry.getNavigationItems("main");

      expect(items).toHaveLength(1);
      expect(items[0]?.priority).toBe(50);
    });
  });
});
