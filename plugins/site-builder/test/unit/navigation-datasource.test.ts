import { describe, it, expect, beforeEach } from "bun:test";
import { NavigationDataSource } from "../../src/datasources/navigation-datasource";
import { RouteRegistry } from "../../src/lib/route-registry";
import type { RouteDefinition } from "../../src/types/routes";
import { createSilentLogger, z } from "@brains/utils";

// Test schema for navigation data
const testNavigationSchema = z.object({
  navigation: z.array(
    z.object({
      label: z.string(),
      href: z.string(),
    }),
  ),
  copyright: z.string().optional(),
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
      navigation: {
        show: true,
        label: "Home",
        slot: "main",
        priority: 10,
      },
      sections: [],
    };

    const linksRoute: RouteDefinition = {
      id: "links",
      path: "/links",
      title: "Links",
      description: "Links page",
      navigation: {
        show: true,
        slot: "main",
        priority: 40,
      },
      sections: [],
    };

    routeRegistry.register(homeRoute);
    routeRegistry.register(linksRoute);

    // Act: Fetch navigation data
    const result = await dataSource.fetch(null, testNavigationSchema);

    // Assert: Data matches footer component requirements
    expect(result).toEqual({
      navigation: [
        { label: "Home", href: "/" },
        { label: "Links", href: "/links" },
      ],
      copyright: undefined,
    });
  });

  it("should exclude routes not marked for navigation", async () => {
    const publicRoute: RouteDefinition = {
      id: "public",
      path: "/public",
      title: "Public",
      description: "Public page",
      navigation: {
        show: true,
        slot: "main",
        priority: 10,
      },
      sections: [],
    };

    const privateRoute: RouteDefinition = {
      id: "private",
      path: "/private",
      title: "Private",
      description: "Private page",
      navigation: {
        show: false, // This route should not appear
        slot: "main",
        priority: 20,
      },
      sections: [],
    };

    const noNavRoute: RouteDefinition = {
      id: "no-nav",
      path: "/no-nav",
      title: "No Nav",
      description: "Page without navigation",
      sections: [], // No navigation property at all
    };

    routeRegistry.register(publicRoute);
    routeRegistry.register(privateRoute);
    routeRegistry.register(noNavRoute);

    const result = await dataSource.fetch(null, testNavigationSchema);

    // Only the public route should be in navigation
    expect(result).toEqual({
      navigation: [{ label: "Public", href: "/public" }],
      copyright: undefined,
    });
  });

  it("should order navigation by priority", async () => {
    // Register routes in random order
    routeRegistry.register({
      id: "third",
      path: "/third",
      title: "Third",
      description: "Third page",
      navigation: { show: true, slot: "main", priority: 30 },
      sections: [],
    });

    routeRegistry.register({
      id: "first",
      path: "/first",
      title: "First",
      description: "First page",
      navigation: { show: true, slot: "main", priority: 10 },
      sections: [],
    });

    routeRegistry.register({
      id: "second",
      path: "/second",
      title: "Second",
      description: "Second page",
      navigation: { show: true, slot: "main", priority: 20 },
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
