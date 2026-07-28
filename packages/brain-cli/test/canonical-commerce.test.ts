import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import rizomTheme from "@brains/theme-rizom";
import {
  parseInstanceOverrides,
  registerPackage,
  resolve,
  type AppConfig,
  type InstanceOverrides,
} from "@brains/app";
import rizomSite from "@rizom/site-rizom";
import { canonicalBrain } from "../src/model/canonical-brain";

const fixtureOverrides = parseInstanceOverrides(
  readFileSync(
    join(import.meta.dir, "fixtures", "canonical-commerce", "brain.yaml"),
    "utf8",
  ),
);
registerPackage("@rizom/site-rizom", rizomSite);
registerPackage("@brains/theme-rizom", rizomTheme);

const ecosystemFactory = canonicalBrain.capabilities.find(
  ([id]) => id === "rizom-ecosystem",
)?.[1];
if (!ecosystemFactory) {
  throw new Error("Canonical catalog is missing the fixture factory");
}
registerPackage("@fixture/commerce-extension", ecosystemFactory);

function runtimeOverrides(
  overrides: InstanceOverrides,
): Omit<InstanceOverrides, "brain"> {
  const { brain: _brain, ...runtime } = overrides;
  return runtime;
}

function commerceOverrides(
  extra: Partial<InstanceOverrides> = {},
): Omit<InstanceOverrides, "brain"> {
  const base = runtimeOverrides(fixtureOverrides);
  return {
    ...base,
    ...extra,
    plugins: {
      ...base.plugins,
      ...extra.plugins,
    },
  };
}

function pluginIds(resolved: AppConfig): string[] {
  return resolved.plugins?.map((plugin) => plugin.id) ?? [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function pluginConfig(
  resolved: AppConfig,
  id: string,
): Record<string, unknown> | undefined {
  const plugin = resolved.plugins?.find((candidate) => candidate.id === id);
  if (!plugin || !("config" in plugin)) return undefined;
  const config = plugin.config;
  return isRecord(config) ? config : undefined;
}

function permissionLevel(
  resolved: AppConfig,
  pattern: string,
): string | undefined {
  return resolved.permissions?.rules?.find((rule) => rule.pattern === pattern)
    ?.level;
}

describe("canonical commerce posture", () => {
  test("uses core plus site with an explicit product addition", () => {
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

  test("resolves instance-owned site, theme, seed, and Discord choices", () => {
    const resolved = resolve(
      canonicalBrain,
      {},
      commerceOverrides({
        plugins: {
          discord: { botToken: "test-token", captureUrls: true },
        },
      }),
    );

    expect(pluginConfig(resolved, "site-builder")).toMatchObject({
      routes: expect.any(Array),
      themeCSS: expect.any(String),
    });
    expect(pluginConfig(resolved, "directory-sync")).toMatchObject({
      seedContentPath: "./seed-content",
      initialSync: true,
    });
    expect(pluginConfig(resolved, "discord")).toMatchObject({
      botToken: "test-token",
      captureUrls: true,
    });
    expect(pluginIds(resolved)).toContain("products");
  });

  test("retains universal core transport posture", () => {
    const resolved = resolve(canonicalBrain, {}, commerceOverrides());

    expect(permissionLevel(resolved, "cli:*")).toBe("admin");
    expect(permissionLevel(resolved, "mcp:stdio")).toBe("admin");
    expect(permissionLevel(resolved, "mcp:http")).toBe("public");
    expect(permissionLevel(resolved, "discord:*")).toBe("public");
    expect(permissionLevel(resolved, "web-chat:*")).toBe("admin");
  });

  test("keeps optional commerce-adjacent capabilities independently selectable", () => {
    for (const id of [
      "atproto-registry",
      "social-media",
      "wishlist",
      "rizom-ecosystem",
      "obsidian-vault",
      "docs",
    ]) {
      const resolved = resolve(
        canonicalBrain,
        {},
        commerceOverrides({ add: [id] }),
      );
      expect(pluginIds(resolved)).toContain(id);
    }
  });

  test("supports external extension declarations without policy bundles", () => {
    const resolved = resolve(
      canonicalBrain,
      {},
      commerceOverrides({
        plugins: {
          commerceExtension: {
            package: "@fixture/commerce-extension",
            config: { enabled: true },
          },
        },
      }),
    );

    expect(pluginIds(resolved)).toContain("rizom-ecosystem");
  });
});
