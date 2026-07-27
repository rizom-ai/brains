import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ranger from "@brains/ranger";
import {
  parseInstanceOverrides,
  registerPackage,
  resolve,
  type AppConfig,
  type InstanceOverrides,
} from "@brains/app";
import { canonicalBrain } from "../src/model/canonical-brain";

const fixturePath = join(
  import.meta.dir,
  "fixtures",
  "canonical-commerce",
  "brain.yaml",
);
const fixtureOverrides = parseInstanceOverrides(
  readFileSync(fixturePath, "utf8"),
);

if (!ranger.site || !ranger.theme) {
  throw new Error("Ranger characterization requires its legacy site and theme");
}
registerPackage("@rizom/site-rizom", ranger.site);
registerPackage("@brains/theme-rizom", ranger.theme);
const ecosystemFactory = canonicalBrain.capabilities.find(
  ([id]) => id === "rizom-ecosystem",
)?.[1];
if (!ecosystemFactory) {
  throw new Error("Canonical catalog is missing the external fixture factory");
}
registerPackage("@fixture/commerce-extension", ecosystemFactory);

const independentlySelectable = [
  ["products", "products"],
  ["atproto-registry", "atproto-registry"],
  ["social-media", "social-media"],
  ["wishlist", "wishlist"],
  ["rizom-ecosystem", "rizom-ecosystem"],
  ["obsidian-vault", "obsidian-vault"],
  ["docs", "docs"],
] as const;

interface PluginWithConfig {
  id: string;
  config?: Record<string, unknown>;
}

function configFor(
  resolved: AppConfig,
  id: string,
): PluginWithConfig | undefined {
  return (resolved.plugins ?? []).find((plugin) => plugin.id === id) as
    PluginWithConfig | undefined;
}

function pluginIds(resolved: AppConfig): string[] {
  return (resolved.plugins ?? []).map((plugin) => plugin.id);
}

function withoutBrain(
  overrides: InstanceOverrides,
): Omit<InstanceOverrides, "brain"> {
  const { brain, ...runtimeOverrides } = overrides;
  void brain;
  return runtimeOverrides;
}

function commerceOverrides(
  extra: Partial<InstanceOverrides> = {},
): Omit<InstanceOverrides, "brain"> {
  const base = withoutBrain(fixtureOverrides);
  const plugins = { ...base.plugins };
  for (const [id, config] of Object.entries(extra.plugins ?? {})) {
    plugins[id] = { ...plugins[id], ...config };
  }
  return {
    ...base,
    ...extra,
    site: extra.site ?? base.site,
    plugins,
  };
}

function permissionRuleLevel(
  resolved: AppConfig,
  pattern: string,
): string | undefined {
  return resolved.permissions?.rules?.find((rule) => rule.pattern === pattern)
    ?.level;
}

describe("canonical commerce posture", () => {
  test("parses commerce as core plus site with one visible product addition", () => {
    expect(fixtureOverrides).toMatchObject({
      brain: "brain",
      anchor: "organization",
      bundles: ["site", "core"],
      add: ["products"],
      site: {
        package: "@rizom/site-rizom",
        theme: "@brains/theme-rizom",
      },
      plugins: {
        "directory-sync": {
          seedContentPath: "./seed-content",
          initialSync: true,
        },
        discord: { captureUrls: true },
      },
    });
  });

  test("keeps every Ranger runtime factory in the canonical catalog", () => {
    const canonicalIds = new Set([
      ...canonicalBrain.capabilities.map(([id]) => id),
      ...canonicalBrain.interfaces.map(([id]) => id),
    ]);
    const rangerIds = [
      ...ranger.capabilities.map(([id]) => id),
      ...ranger.interfaces.map(([id]) => id),
    ];

    for (const id of rangerIds) {
      expect(canonicalIds).toContain(id);
    }
  });

  test("resolves the instance-owned Ranger site, theme, seed, and Discord choices", () => {
    const canonical = resolve(
      canonicalBrain,
      {},
      commerceOverrides({
        plugins: { discord: { botToken: "test-token" } },
      }),
    );

    expect(configFor(canonical, "site-builder")?.config).toMatchObject({
      routes: expect.any(Array),
      themeCSS: expect.any(String),
    });
    expect(configFor(canonical, "directory-sync")?.config).toMatchObject({
      seedContentPath: "./seed-content",
      initialSync: true,
    });
    expect(configFor(canonical, "discord")?.config).toMatchObject({
      botToken: "test-token",
      captureUrls: true,
    });
  });

  test("characterizes unchanged Ranger plugin config and visible migration deltas", () => {
    const legacy = resolve(
      ranger,
      {},
      {
        preset: "default",
        plugins: { discord: { botToken: "test-token" } },
      },
    );
    const canonical = resolve(
      canonicalBrain,
      {},
      commerceOverrides({
        plugins: { discord: { botToken: "test-token" } },
      }),
    );
    const canonicalIds = pluginIds(canonical);

    for (const id of [
      "prompt",
      "style-guide",
      "cms",
      "dashboard",
      "note",
      "link",
      "products",
      "wishlist",
      "analytics",
      "site-info",
      "site-content",
      "site-builder",
      "mcp",
      "discord",
      "webserver",
    ]) {
      expect(configFor(canonical, id)?.config).toEqual(
        configFor(legacy, id)?.config,
      );
    }

    expect(
      pluginIds(legacy).filter((id) => !canonicalIds.includes(id)),
    ).toEqual(["social-media"]);
    expect(canonicalIds).toEqual(
      expect.arrayContaining([
        "image",
        "document",
        "topics",
        "decks",
        "atproto-registry",
        "auth-service",
        "account",
        "admin",
        "web-chat",
        "a2a",
      ]),
    );
    expect(canonical.agentInstructions).toBeUndefined();
  });

  test("preserves Ranger transport levels while adding the universal core surface", () => {
    const canonical = resolve(canonicalBrain, {}, commerceOverrides());

    expect(permissionRuleLevel(canonical, "cli:*")).toBe("admin");
    expect(permissionRuleLevel(canonical, "mcp:stdio")).toBe("admin");
    expect(permissionRuleLevel(canonical, "mcp:http")).toBe("public");
    expect(permissionRuleLevel(canonical, "discord:*")).toBe("public");
    expect(permissionRuleLevel(canonical, "web-chat:*")).toBe("admin");
    expect(canonical.permissions?.entityActions?.["*"]).toEqual({
      create: "admin",
      update: "admin",
      delete: "admin",
      extract: "admin",
      publish: "admin",
    });
  });

  test("keeps catalog opt-ins independently selectable", () => {
    for (const [memberId, pluginId] of independentlySelectable) {
      const isolated = resolve(
        canonicalBrain,
        {},
        {
          bundles: [],
          add: [memberId],
        },
      );
      expect(pluginIds(isolated)).toContain(pluginId);
      expect(pluginIds(isolated)).toHaveLength(1);
    }
  });

  test("keeps optional capabilities removable from broader postures", () => {
    const selectedOptIns = independentlySelectable.map(
      ([memberId]) => memberId,
    );
    const removed = resolve(
      canonicalBrain,
      {},
      {
        bundles: ["core", "site", "publishing", "team"],
        add: selectedOptIns,
        remove: selectedOptIns,
      },
    );

    for (const [, pluginId] of independentlySelectable) {
      expect(pluginIds(removed)).not.toContain(pluginId);
    }
    expect(removed.permissions?.entityActions?.["doc"]).toBeUndefined();
  });

  test("preserves external plugin packages beside canonical bundles", () => {
    const resolved = resolve(
      canonicalBrain,
      {},
      {
        bundles: ["core", "site"],
        plugins: {
          "commerce-extension": {
            package: "@fixture/commerce-extension",
            config: {},
          },
        },
      },
    );

    expect(pluginIds(resolved)).toContain("rizom-ecosystem");
  });
});
