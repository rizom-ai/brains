import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseInstanceOverrides, resolve } from "@brains/app";
import chatInterface from "@brains/chat";
import {
  instantiatePluginPackageDefinition,
  isPackageDefinitionPlugin,
  type ApiRouteDefinition,
  type Plugin,
  type WebRouteDefinition,
} from "@brains/plugins";
import {
  baseEntitySchema,
  createMockShell,
  createTestEntityAdapter,
} from "@brains/plugins/test";
import { canonicalBrain } from "../src/model/canonical-brain";
import { refuseNetwork } from "./helpers/refuse-network";

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
                `${plugin.id}|tool|${route.method}|${normalizeRoutePath(`/api/${plugin.id}${route.path}`)}|exact|${route.public}`,
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

/** A mock shell with the identity types the shell registers before any plugin. */
function shellWithIdentityTypes(
  servesHttp = false,
): ReturnType<typeof createMockShell> {
  // The site URL a brain's forms serve on, as the app's local runtime gives it.
  const shell = createMockShell({
    servesHttp,
    localSiteUrl: "http://localhost:8080",
  });
  for (const type of ["anchor-profile", "brain-character"]) {
    shell
      .getEntityRegistry()
      .registerEntityType(
        type,
        baseEntitySchema,
        createTestEntityAdapter(type, { isSingleton: true }),
      );
  }
  return shell;
}

/**
 * A test app's plugins, with the routes the shell collects from them: a
 * declared service or interface builds its routes when it registers, so it
 * is registered on a mock shell first, among the app's other plugins and
 * serving HTTP where the app does, as the shell registers every plugin
 * before it collects routes.
 */
async function resolveTestApp(name: string): Promise<Plugin[]> {
  const source = readFileSync(
    join(import.meta.dir, "..", "test-apps", name, "brain.yaml"),
    "utf8",
  );
  const {
    brain: _brain,
    site: _site,
    ...overrides
  } = parseInstanceOverrides(source);
  const resolved = resolve(canonicalBrain, {}, overrides);
  const plugins = resolved.plugins ?? [];
  for (const plugin of plugins) {
    if (isPackageDefinitionPlugin(plugin)) {
      const shell = shellWithIdentityTypes(resolved.http.enabled === true);
      for (const other of plugins) shell.addPlugin(other);
      await plugin.register(shell);
    }
  }
  return plugins;
}

const minimal = routeManifest(await resolveTestApp("minimal"));
const compositionCases: Array<[string, Plugin[]]> = [
  ["personal", await resolveTestApp("personal")],
  ["publishing", await resolveTestApp("publishing")],
  ["team", await resolveTestApp("team")],
  ["docs", await resolveTestApp("docs")],
  ["rizom-ai", await resolveTestApp("rizom-ai")],
];

describe("canonical HTTP route manifests", () => {
  refuseNetwork();
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

  for (const [name, plugins] of compositionCases) {
    test(`records the ${name} composition delta`, () => {
      expect(manifestDelta(minimal, routeManifest(plugins))).toEqual(
        readExpected(`${name}.delta`),
      );
    });
  }

  test("normalizes generated asset hashes without hiding their routes", () => {
    const manifests = [
      minimal,
      ...compositionCases.map(([, plugins]) => routeManifest(plugins)),
    ].flat();
    expect(manifests).toContain(
      "dashboard|handler|GET|/assets/dashboard.[content-hash].css|exact|true",
    );
    expect(
      manifests.some((entry) => /\.[a-f0-9]{64}\.(?:css|js)\|/u.test(entry)),
    ).toBeFalse();
  });

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

  test("records configured Chat SDK handler routes", async () => {
    const chat = instantiatePluginPackageDefinition(
      chatInterface,
      {
        adapters: {
          discord: {
            applicationId: "fixture-application",
            botToken: "fixture-token",
            publicKey: "fixture-public-key",
          },
        },
      },
      { name: "@brains/chat", version: "0.0.0-test" },
      { pluginId: "chat" },
    );
    for (const plugin of chat) await plugin.register(shellWithIdentityTypes());

    expect(routeManifest(chat)).toEqual(readExpected("chat-sdk"));
  });

  test("records configured newsletter provider routes", () => {
    // The newsletter capability as the canonical brain composes it.
    const entry = canonicalBrain.capabilities.find(
      ([id]) => id === "newsletter",
    );
    if (!entry) throw new Error("No newsletter capability");
    const newsletter = (config: Record<string, unknown>): Plugin[] => {
      const created = entry[1](config);
      return Array.isArray(created) ? created : [created];
    };
    expect(
      routeManifest(
        newsletter({
          provider: { type: "buttondown", apiKey: "fixture-api-key" },
        }),
      ),
    ).toEqual(readExpected("newsletter"));

    expect(
      routeManifest(
        newsletter({
          provider: {
            type: "resend",
            apiKey: "fixture-api-key",
            segmentId: "fixture-segment",
            from: "Newsletter <newsletter@example.com>",
          },
        }),
      ),
    ).toEqual(readExpected("newsletter-resend"));
  });
});
