import { describe, expect, it } from "bun:test";
import {
  PluginManager,
  type ApiRouteDefinition,
  type Plugin,
  type PluginCapabilities,
  type WebRouteDefinition,
} from "@brains/plugins";
import { createSilentLogger } from "@brains/test-utils";
import { DaemonRegistry } from "../src/daemon-registry";
import {
  collectHttpRouteContributors,
  HttpRouteRegistry,
  type HttpRouteContributor,
} from "../src/http-route-registry";

function webRoute(
  path: string,
  options: Partial<Omit<WebRouteDefinition, "path" | "handler">> = {},
): WebRouteDefinition {
  return {
    path,
    handler: () => new Response("ok"),
    ...options,
  };
}

function contributor(
  pluginId: string,
  options: Omit<HttpRouteContributor, "pluginId"> = {
    apiRoutes: [],
    webRoutes: [],
  },
): HttpRouteContributor {
  return { pluginId, ...options };
}

describe("HttpRouteRegistry", () => {
  it("normalizes getter declarations into one immutable snapshot", () => {
    const registry = HttpRouteRegistry.createFresh();

    const snapshot = registry.finalize([
      contributor("example", {
        webRoutes: [webRoute("/example")],
        apiRoutes: [
          {
            path: "/run",
            method: "POST",
            tool: "run",
            public: true,
          },
        ],
      }),
    ]);

    expect(snapshot).toEqual([
      {
        kind: "handler",
        ownerPluginId: "example",
        fullPath: "/example",
        method: "GET",
        match: "exact",
        sharedHostAdmission: "deny",
        handler: expect.any(Function),
      },
      {
        kind: "tool",
        ownerPluginId: "example",
        fullPath: "/api/example/run",
        method: "POST",
        match: "exact",
        sharedHostAdmission: "admit",
        definition: {
          path: "/run",
          method: "POST",
          tool: "run",
          public: true,
        },
      },
    ]);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot[0])).toBe(true);
  });

  it("rejects duplicate method/path keys across handler and tool routes", () => {
    const registry = HttpRouteRegistry.createFresh();

    expect(() =>
      registry.finalize([
        contributor("first", {
          webRoutes: [
            webRoute("/api/second/run", {
              method: "POST",
              match: "prefix",
              public: true,
            }),
          ],
          apiRoutes: [],
        }),
        contributor("second", {
          webRoutes: [],
          apiRoutes: [
            {
              path: "/run",
              method: "POST",
              tool: "run",
              public: true,
            },
          ],
        }),
      ]),
    ).toThrow(
      'HTTP route conflict for POST /api/second/run between plugins "first" and "second"; give one declaration a different method or path',
    );
  });

  it("applies reserved namespaces to mounted API paths, not suffixes", () => {
    const registry = HttpRouteRegistry.createFresh();

    expect(() =>
      registry.finalize([
        contributor("example", {
          webRoutes: [],
          apiRoutes: [
            {
              path: "/health",
              method: "GET",
              tool: "health",
              public: true,
            },
          ],
        }),
      ]),
    ).not.toThrow();
    expect(registry.getSnapshot()[0]?.fullPath).toBe("/api/example/health");
  });

  it("allows one path to use different methods", () => {
    const registry = HttpRouteRegistry.createFresh();

    expect(() =>
      registry.finalize([
        contributor("example", {
          webRoutes: [
            webRoute("/example", { method: "GET", public: true }),
            webRoute("/example", { method: "POST", public: true }),
          ],
          apiRoutes: [],
        }),
      ]),
    ).not.toThrow();
  });

  it("rejects invalid runtime methods and match modes", () => {
    const invalidMethod = webRoute("/invalid-method", { public: true });
    Reflect.set(invalidMethod, "method", "PATCH");
    expect(() =>
      HttpRouteRegistry.createFresh().finalize([
        contributor("example", {
          webRoutes: [invalidMethod],
          apiRoutes: [],
        }),
      ]),
    ).toThrow('Invalid HTTP route method "PATCH" declared by plugin "example"');

    const invalidMatch = webRoute("/invalid-match", { public: true });
    Reflect.set(invalidMatch, "match", "wildcard");
    expect(() =>
      HttpRouteRegistry.createFresh().finalize([
        contributor("example", {
          webRoutes: [invalidMatch],
          apiRoutes: [],
        }),
      ]),
    ).toThrow(
      'Invalid HTTP route match "wildcard" declared by plugin "example"',
    );
  });

  it("rejects OPTIONS for tool-backed routes", () => {
    const invalidMethod: ApiRouteDefinition = {
      path: "/run",
      method: "POST",
      tool: "run",
      public: true,
    };
    Reflect.set(invalidMethod, "method", "OPTIONS");

    expect(() =>
      HttpRouteRegistry.createFresh().finalize([
        contributor("example", {
          webRoutes: [],
          apiRoutes: [invalidMethod],
        }),
      ]),
    ).toThrow(
      'Invalid HTTP route method "OPTIONS" declared by plugin "example"',
    );
  });

  it("rejects an invalid runtime tool name", () => {
    const invalidTool: ApiRouteDefinition = {
      path: "/run",
      method: "POST",
      tool: "run",
      public: true,
    };
    Reflect.set(invalidTool, "tool", "");

    expect(() =>
      HttpRouteRegistry.createFresh().finalize([
        contributor("example", {
          webRoutes: [],
          apiRoutes: [invalidTool],
        }),
      ]),
    ).toThrow(
      'Invalid HTTP route tool for "/api/example/run" declared by plugin "example"',
    );
  });

  it("rejects a missing runtime handler", () => {
    const missingHandler = webRoute("/missing-handler", { public: true });
    Reflect.deleteProperty(missingHandler, "handler");

    expect(() =>
      HttpRouteRegistry.createFresh().finalize([
        contributor("example", {
          webRoutes: [missingHandler],
          apiRoutes: [],
        }),
      ]),
    ).toThrow(
      'Invalid HTTP route handler for "/missing-handler" declared by plugin "example"',
    );
  });

  for (const path of [
    "relative",
    "//authority",
    "/with?query=true",
    "/with#fragment",
    "/with space",
    "/one/../two",
    "/trailing/",
    "/encoded%20segment",
    "/double//slash",
    "/health",
    "/health/ready",
    "/images/file.png",
    "/.site-build-manifest.json",
  ]) {
    it(`rejects malformed or reserved path ${path}`, () => {
      const registry = HttpRouteRegistry.createFresh();
      expect(() =>
        registry.finalize([
          contributor("example", {
            webRoutes: [webRoute(path, { public: true })],
            apiRoutes: [],
          }),
        ]),
      ).toThrow(
        `Invalid HTTP route path "${path}" declared by plugin "example"`,
      );
    });
  }

  it("collects each plugin getter once at the composition boundary", () => {
    const logger = createSilentLogger("http-route-registry-test");
    const manager = PluginManager.createFresh(
      logger,
      DaemonRegistry.createFresh(logger),
    );
    let webReads = 0;
    let apiReads = 0;
    const plugin: Plugin = {
      id: "example",
      packageName: "@test/example",
      type: "service",
      version: "1.0.0",
      register: async (): Promise<PluginCapabilities> => ({
        tools: [],
        resources: [],
      }),
      getWebRoutes: (): WebRouteDefinition[] => {
        webReads += 1;
        return [webRoute("/example", { public: true })];
      },
      getApiRoutes: (): ApiRouteDefinition[] => {
        apiReads += 1;
        return [];
      },
    };
    manager.registerPlugin(plugin);

    const registry = HttpRouteRegistry.createFresh();
    registry.finalize(collectHttpRouteContributors(manager));
    registry.getSnapshot();
    registry.getManifest();

    expect(webReads).toBe(1);
    expect(apiReads).toBe(1);
  });

  it("exposes a handler-free diagnostic manifest", () => {
    const registry = HttpRouteRegistry.createFresh();
    registry.finalize([
      contributor("example", {
        webRoutes: [webRoute("/example", { public: true })],
        apiRoutes: [],
      }),
    ]);

    expect(registry.getManifest()).toEqual([
      {
        ownerPluginId: "example",
        kind: "handler",
        method: "GET",
        fullPath: "/example",
        match: "exact",
        sharedHostAdmission: "admit",
      },
    ]);
    expect(Object.isFrozen(registry.getManifest())).toBe(true);
  });

  it("can only finalize once", () => {
    const registry = HttpRouteRegistry.createFresh();
    registry.finalize([]);

    expect(() => registry.finalize([])).toThrow(
      "HTTP route registry has already been finalized",
    );
  });
});
