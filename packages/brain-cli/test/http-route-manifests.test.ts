import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseInstanceOverrides, resolve } from "@brains/app";
import { ChatInterface } from "@brains/chat";
import { newsletter } from "@brains/newsletter";
import type {
  ApiRouteDefinition,
  Plugin,
  WebRouteDefinition,
} from "@brains/plugins";
import { canonicalBrain } from "../src/model/canonical-brain";

interface WebRoutePlugin extends Plugin {
  getWebRoutes(): WebRouteDefinition[];
}

interface ApiRoutePlugin extends Plugin {
  getApiRoutes(): ApiRouteDefinition[];
}

function hasWebRoutes(plugin: Plugin): plugin is WebRoutePlugin {
  return "getWebRoutes" in plugin && typeof plugin.getWebRoutes === "function";
}

function hasApiRoutes(plugin: Plugin): plugin is ApiRoutePlugin {
  return "getApiRoutes" in plugin && typeof plugin.getApiRoutes === "function";
}

function normalizeRoutePath(path: string): string {
  return path.replace(
    /(\/assets\/[^/.]+)\.[a-f0-9]{64}(\.(?:css|js))$/,
    "$1.[content-hash]$2",
  );
}

function routeManifest(plugins: readonly Plugin[]): string[] {
  return plugins
    .flatMap((plugin) => {
      const webRoutes = hasWebRoutes(plugin)
        ? plugin.getWebRoutes().map((route) => {
            const path = normalizeRoutePath(route.path);
            return `${plugin.id}|handler|${route.method ?? "GET"}|${path}|${route.match ?? "exact"}|${route.public ?? false}`;
          })
        : [];
      const apiRoutes = hasApiRoutes(plugin)
        ? plugin
            .getApiRoutes()
            .map(
              (route) =>
                `${plugin.id}|tool|${route.method}|/api/${plugin.id}${route.path}|exact|${route.public}`,
            )
        : [];
      return [...webRoutes, ...apiRoutes];
    })
    .sort();
}

function manifestDelta(
  base: readonly string[],
  next: readonly string[],
): string[] {
  const baseKeys = new Set(base);
  const nextKeys = new Set(next);
  return [
    ...base
      .filter((entry) => !nextKeys.has(entry))
      .map((entry) => `- ${entry}`),
    ...next
      .filter((entry) => !baseKeys.has(entry))
      .map((entry) => `+ ${entry}`),
  ].sort();
}

function readExpected(name: string): string[] {
  const contents = readFileSync(
    join(import.meta.dir, "fixtures", "http-route-manifests", `${name}.txt`),
    "utf8",
  ).trim();
  return contents.length > 0 ? contents.split("\n") : [];
}

function resolveTestApp(name: string): Plugin[] {
  const source = readFileSync(
    join(import.meta.dir, "..", "test-apps", name, "brain.yaml"),
    "utf8",
  );
  const {
    brain: _brain,
    site: _site,
    ...overrides
  } = parseInstanceOverrides(source);
  return resolve(canonicalBrain, {}, overrides).plugins ?? [];
}

function resolveCommerceFixture(): Plugin[] {
  const source = readFileSync(
    join(import.meta.dir, "fixtures", "canonical-commerce", "brain.yaml"),
    "utf8",
  );
  const {
    brain: _brain,
    site: _site,
    ...overrides
  } = parseInstanceOverrides(source);
  return resolve(canonicalBrain, {}, overrides).plugins ?? [];
}

describe("canonical HTTP route manifests", () => {
  const minimal = routeManifest(resolveTestApp("minimal"));

  test("normalizes only content-addressed CSS and JavaScript routes", () => {
    expect(
      normalizeRoutePath(
        "/dashboard/assets/dashboard.0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef.css",
      ),
    ).toBe("/dashboard/assets/dashboard.[content-hash].css");
    expect(normalizeRoutePath("/assets/dashboard.css")).toBe(
      "/assets/dashboard.css",
    );
    expect(
      normalizeRoutePath(
        "/assets/dashboard.0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef.map",
      ),
    ).toBe(
      "/assets/dashboard.0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef.map",
    );
  });

  test("inventories every route in the minimal composition", () => {
    expect(minimal).toEqual(readExpected("minimal"));
  });

  const compositionCases: Array<[string, Plugin[]]> = [
    ["personal", resolveTestApp("personal")],
    ["publishing", resolveTestApp("publishing")],
    ["team", resolveTestApp("team")],
    ["commerce", resolveCommerceFixture()],
    ["docs", resolveTestApp("docs")],
    ["rizom-ai", resolveTestApp("rizom-ai")],
  ];

  for (const [name, plugins] of compositionCases) {
    test(`records the ${name} composition delta`, () => {
      expect(manifestDelta(minimal, routeManifest(plugins))).toEqual(
        readExpected(`${name}.delta`),
      );
    });
  }

  test("has no current canonical method/path collisions", () => {
    const manifestCases: Array<[string, string[]]> = [
      ["minimal", minimal],
      ...compositionCases.map(([caseName, plugins]): [string, string[]] => [
        caseName,
        routeManifest(plugins),
      ]),
    ];

    for (const [name, entries] of manifestCases) {
      const ownersByKey = new Map<string, string>();
      const collisions: string[] = [];
      for (const entry of entries) {
        const [owner, _kind, method, path] = entry.split("|");
        if (!owner || !method || !path) {
          throw new Error(`Malformed route manifest entry: ${entry}`);
        }
        const key = `${method} ${path}`;
        const existingOwner = ownersByKey.get(key);
        if (existingOwner) {
          collisions.push(`${key}: ${existingOwner}, ${owner}`);
        } else {
          ownersByKey.set(key, owner);
        }
      }
      expect(collisions, name).toEqual([]);
    }
  });

  test("records configured Chat SDK handler routes", () => {
    const chat = new ChatInterface({
      adapters: {
        discord: {
          applicationId: "fixture-application",
          botToken: "fixture-token",
          publicKey: "fixture-public-key",
        },
      },
    });

    expect(routeManifest([chat])).toEqual(readExpected("chat-sdk"));
  });

  test("records the configured newsletter tool route without making it a public fixture", () => {
    expect(routeManifest(newsletter({ apiKey: "fixture-api-key" }))).toEqual(
      readExpected("newsletter"),
    );
  });
});
