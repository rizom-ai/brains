import { describe, it, expect, beforeEach } from "bun:test";
import { NavigationDataSource } from "../../src/datasources/navigation-datasource";
import { RouteRegistry } from "../../src/lib/route-registry";
import type { RouteDefinition } from "../../src/types/routes";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils";

// Test schema for navigation data (matches what NavigationDataSource returns)
const testNavigationSchema = z.object({
  navigation: z.array(
    z.object({
      label: z.string(),
      href: z.string(),
    }),
  ),
});

describe("NavigationDataSource", () => {
  let dataSource: NavigationDataSource;
  let routeRegistry: RouteRegistry;
  const logger = createSilentLogger("test");

  beforeEach(() => {
    routeRegistry = new RouteRegistry(logger);
    dataSource = new NavigationDataSource(routeRegistry, logger);
  });

  it("should provide navigation data for footer component", async () => {
    // Setup: Register routes that should appear in navigation
    const homeRoute: RouteDefinition = {
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
    };

    const linksRoute: RouteDefinition = {
      id: "links",
      path: "/links",
      title: "Links",
      description: "Links page",
      layout: "default",
      navigation: {
        show: true,
        slot: "primary",
        priority: 40,
      },
      sections: [],
    };

    routeRegistry.register(homeRoute);
    routeRegistry.register(linksRoute);

    // Act: Fetch navigation data
    const result = await dataSource.fetch(null, testNavigationSchema);

    // Assert: Data contains navigation items
    expect(result).toEqual({
      navigation: [
        { label: "Home", href: "/" },
        { label: "Links", href: "/links" },
      ],
    });
  });

  it("should exclude routes not marked for navigation", async () => {
    const publicRoute: RouteDefinition = {
      id: "public",
      path: "/public",
      title: "Public",
      description: "Public page",
      layout: "default",
      navigation: {
        show: true,
        slot: "primary",
        priority: 10,
      },
      sections: [],
    };

    const privateRoute: RouteDefinition = {
      id: "private",
      path: "/private",
      title: "Private",
      description: "Private page",
      layout: "default",
      navigation: {
        show: false, // This route should not appear
        slot: "primary",
        priority: 20,
      },
      sections: [],
    };

    const noNavRoute: RouteDefinition = {
      id: "no-nav",
      path: "/no-nav",
      title: "No Nav",
      description: "Page without navigation",
      layout: "default",
      sections: [], // No navigation property at all
    };

    routeRegistry.register(publicRoute);
    routeRegistry.register(privateRoute);
    routeRegistry.register(noNavRoute);

    const result = await dataSource.fetch(null, testNavigationSchema);

    // Only the public route should be in navigation
    expect(result).toEqual({
      navigation: [{ label: "Public", href: "/public" }],
    });
  });

  it("should support query parameters for slot selection", async () => {
    // Register routes in different slots
    routeRegistry.register({
      id: "primary-item",
      path: "/primary",
      title: "Primary Item",
      description: "Primary navigation item",
      layout: "default",
      navigation: { show: true, slot: "primary", priority: 10 },
      sections: [],
    });

    routeRegistry.register({
      id: "secondary-item",
      path: "/secondary",
      title: "Secondary Item",
      description: "Secondary navigation item",
      layout: "default",
      navigation: { show: true, slot: "secondary", priority: 10 },
      sections: [],
    });

    // Query for primary slot (default)
    const primaryResult = await dataSource.fetch({}, testNavigationSchema);
    expect(primaryResult).toEqual({
      navigation: [{ label: "Primary Item", href: "/primary" }],
    });

    // Query for secondary slot
    const secondaryResult = await dataSource.fetch(
      { slot: "secondary" },
      testNavigationSchema,
    );
    expect(secondaryResult).toEqual({
      navigation: [{ label: "Secondary Item", href: "/secondary" }],
    });
  });

  it("should support limiting navigation items", async () => {
    // Register multiple routes
    for (let i = 1; i <= 5; i++) {
      routeRegistry.register({
        id: `item-${i}`,
        path: `/item-${i}`,
        title: `Item ${i}`,
        description: `Navigation item ${i}`,
        layout: "default",
        navigation: { show: true, slot: "primary", priority: i * 10 },
        sections: [],
      });
    }

    // Query with limit
    const result = await dataSource.fetch({ limit: 3 }, testNavigationSchema);

    expect(result.navigation).toHaveLength(3);
    expect(result.navigation[0]?.href).toBe("/item-1");
    expect(result.navigation[1]?.href).toBe("/item-2");
    expect(result.navigation[2]?.href).toBe("/item-3");
  });

  it("should order navigation by priority", async () => {
    // Register routes in random order
    routeRegistry.register({
      id: "third",
      path: "/third",
      title: "Third",
      description: "Third page",
      layout: "default",
      navigation: { show: true, slot: "primary", priority: 30 },
      sections: [],
    });

    routeRegistry.register({
      id: "first",
      path: "/first",
      title: "First",
      description: "First page",
      layout: "default",
      navigation: { show: true, slot: "primary", priority: 10 },
      sections: [],
    });

    routeRegistry.register({
      id: "second",
      path: "/second",
      title: "Second",
      description: "Second page",
      layout: "default",
      navigation: { show: true, slot: "primary", priority: 20 },
      sections: [],
    });

    const result = await dataSource.fetch(null, testNavigationSchema);
    const navigation = (result as { navigation: Array<{ href: string }> })
      .navigation;

    // Should be ordered by priority
    expect(navigation[0]?.href).toBe("/first");
    expect(navigation[1]?.href).toBe("/second");
    expect(navigation[2]?.href).toBe("/third");
  });
});
