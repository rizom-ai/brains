import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseInstanceOverrides, resolve } from "@brains/app";
import chatPackage from "@brains/chat";
import newsletterPackage from "@brains/newsletter";
import type {
  ApiRouteDefinition,
  Plugin,
  WebRouteDefinition,
} from "@brains/plugins";
import { instantiatePluginPackageDefinition } from "@brains/plugins";
import { createMockShell } from "@brains/plugins/test";
import { createSilentLogger } from "@brains/test-utils";
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

/**
 * A declared package knows its routes once it is registered, not when it is
 * constructed: the slot that returns them reads the state `setup` built, and
 * there is no state before the runtime hands it a context. Registering here
 * keeps this manifest measuring the whole HTTP surface rather than quietly
 * shrinking to whatever is still written as a class.
 *
 * Services register too. Registration is not where a service does its work —
 * bring-up runs from `lifecycle.onRegistered`, which only `finalizeRegistration`
 * triggers, and this never calls it — so nothing here starts a sync or a build.
 */
async function registered(plugins: readonly Plugin[]): Promise<Plugin[]> {
  const shell = createMockShell({ logger: createSilentLogger("routes") });
  // Announce the whole composition before registering any of it: an interface
  // that mounts on the shared HTTP host asks whether the host is present, and
  // the answer must not depend on registration order.
  for (const plugin of plugins) shell.addPlugin(plugin);
  for (const plugin of plugins) {
    try {
      await plugin.register(shell);
    } catch {
      // A plugin that refuses this bare shell contributes no routes, which is
      // what an unregistered one contributed before.
    }
  }
  return [...plugins];
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

describe("canonical HTTP route manifests", () => {
  /**
   * Each composition is registered once and its manifest cached.
   *
   * Three tests below want the same manifests, and registering per test would
   * stand up a shell and a full interface set for each of them — the work that
   * produces the answer, repeated for answers already known.
   */
  const manifests = new Map<string, Promise<string[]>>();
  const manifestFor = (name: string): Promise<string[]> => {
    const cached = manifests.get(name);
    if (cached) return cached;
    const built = registered(resolveTestApp(name)).then(routeManifest);
    manifests.set(name, built);
    return built;
  };
  const minimal = (): Promise<string[]> => manifestFor("minimal");

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

  test("inventories every route in the minimal composition", async () => {
    expect(await minimal()).toEqual(readExpected("minimal"));
  });

  const compositionNames = [
    "personal",
    "publishing",
    "team",
    "docs",
    "rizom-ai",
  ];

  for (const name of compositionNames) {
    test(`records the ${name} composition delta`, async () => {
      expect(manifestDelta(await minimal(), await manifestFor(name))).toEqual(
        readExpected(`${name}.delta`),
      );
    });
  }

  test("normalizes generated asset hashes without hiding their routes", async () => {
    const entries = (
      await Promise.all([
        minimal(),
        ...compositionNames.map((name) => manifestFor(name)),
      ])
    ).flat();
    expect(entries).toContain(
      "@brains/dashboard:dashboard|handler|GET|/assets/dashboard.[content-hash].css|exact|true",
    );
    expect(
      entries.some((entry) => /\.[a-f0-9]{64}\.(?:css|js)\|/u.test(entry)),
    ).toBeFalse();
  });

  test("has no current canonical method/path collisions", async () => {
    const manifestCases: Array<[string, string[]]> = [
      ["minimal", await minimal()],
      ...(await Promise.all(
        compositionNames.map(async (name): Promise<[string, string[]]> => [
          name,
          await manifestFor(name),
        ]),
      )),
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

  test("records the configured chat platform's handler routes", async () => {
    // Discord configured, Slack not: only the Discord interface exists, so
    // only its webhook and upload routes are declared.
    const chat = instantiatePluginPackageDefinition(
      chatPackage,
      {
        adapters: {
          discord: {
            applicationId: "fixture-application",
            botToken: "fixture-token",
            publicKey: "fixture-public-key",
          },
        },
      },
      { name: "@brains/chat", version: "0.0.0" },
    );

    expect(routeManifest(await registered(chat))).toEqual(
      readExpected("chat-sdk"),
    );
  });

  test("records the configured newsletter subscribe route without making it a public fixture", async () => {
    expect(
      routeManifest(
        await registered(
          instantiatePluginPackageDefinition(
            newsletterPackage,
            { apiKey: "fixture-api-key" },
            { name: "@brains/newsletter", version: "0.0.0-test" },
          ),
        ),
      ),
    ).toEqual(readExpected("newsletter"));
  });
});
