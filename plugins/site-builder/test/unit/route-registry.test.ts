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
        layout: "default",
        sections: [],
      };

      registry.register(route);
      const items = registry.getNavigationItems("primary");

      expect(items).toEqual([]);
    });

    it("should return navigation items for routes with navigation metadata", () => {
      const routes: RouteDefinition[] = [
        {
          id: "home",
          path: "/",
          title: "Home",
          description: "Home page",
          layout: "default",
          navigation: {
            show: true,
            label: "Home",
            slot: "primary",
            priority: 10,
          },
          sections: [],
        },
        {
          id: "about",
          path: "/about",
          title: "About Us",
          description: "About page",
          layout: "default",
          navigation: {
            show: true,
            slot: "primary",
            priority: 20,
          },
          sections: [],
        },
        {
          id: "hidden",
          path: "/hidden",
          title: "Hidden Page",
          description: "Not in nav",
          layout: "default",
          navigation: {
            show: false,
            slot: "primary",
            priority: 30,
          },
          sections: [],
        },
      ];

      routes.forEach((route) => registry.register(route));
      const items = registry.getNavigationItems("primary");

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
          layout: "default",
          navigation: {
            show: true,
            slot: "primary",
            priority: 30,
          },
          sections: [],
        },
        {
          id: "first",
          path: "/first",
          title: "First",
          description: "First page",
          layout: "default",
          navigation: {
            show: true,
            slot: "primary",
            priority: 10,
          },
          sections: [],
        },
        {
          id: "second",
          path: "/second",
          title: "Second",
          description: "Second page",
          layout: "default",
          navigation: {
            show: true,
            slot: "primary",
            priority: 20,
          },
          sections: [],
        },
      ];

      routes.forEach((route) => registry.register(route));
      const items = registry.getNavigationItems("primary");

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
          layout: "default",
          navigation: {
            show: true,
            slot: "primary",
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
        //   layout: "default",
        //   navigation: {
        //     show: true,
        //     slot: "sidebar",
        //     priority: 10,
        //   },
        //   sections: [],
        // },
      ];

      routes.forEach((route) => registry.register(route));
      const mainItems = registry.getNavigationItems("primary");

      expect(mainItems).toHaveLength(1);
      expect(mainItems[0]?.href).toBe("/main");
    });

    it("should use default priority when not specified", () => {
      const route: RouteDefinition = {
        id: "test",
        path: "/test",
        title: "Test",
        description: "Test page",
        layout: "default",
        navigation: {
          show: true,
          slot: "primary" as const,
          priority: undefined as unknown as number, // Testing default priority
        },
        sections: [],
      };

      registry.register(route);
      const items = registry.getNavigationItems("primary");

      expect(items).toHaveLength(1);
      expect(items[0]?.priority).toBe(50);
    });
  });
});
