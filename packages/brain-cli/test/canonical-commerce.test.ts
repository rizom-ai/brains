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

const extensionFactory = canonicalBrain.capabilities.find(
  ([id]) => id === "stock-photo",
)?.[1];
if (!extensionFactory) {
  throw new Error("Canonical catalog is missing the fixture factory");
}
registerPackage("@fixture/commerce-extension", extensionFactory);

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
      kind: "organization",
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
      },
    });
  });

  test("resolves instance-owned site, theme, seed, and Discord choices", () => {
    const resolved = resolve(
      canonicalBrain,
      {
        DISCORD_BOT_TOKEN: "test-token",
        DISCORD_PUBLIC_KEY: "test-public-key",
        DISCORD_APPLICATION_ID: "test-application-id",
      },
      commerceOverrides(),
    );

    expect(resolved.profileKind).toBe("organization");
    expect(pluginConfig(resolved, "site-builder")).toMatchObject({
      routes: expect.any(Array),
      themeCSS: expect.any(String),
    });
    expect(pluginConfig(resolved, "directory-sync")).toMatchObject({
      seedContentPath: "./seed-content",
      initialSync: true,
    });
    expect(pluginConfig(resolved, "chat")).toMatchObject({
      adapters: {
        discord: {
          botToken: "test-token",
          publicKey: "test-public-key",
          applicationId: "test-application-id",
          captureUrls: true,
        },
      },
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
    // A capability and the plugin id it registers. They differ for
    // declarative entity packages, whose plugin ids are package-scoped.
    const cases: ReadonlyArray<{ capability: string; pluginId: string }> = [
      { capability: "atproto-registry", pluginId: "atproto-registry" },
      { capability: "social-media", pluginId: "social-media" },
      { capability: "wishlist", pluginId: "wishlist" },
      { capability: "obsidian-vault", pluginId: "obsidian-vault" },
      { capability: "docs", pluginId: "@brains/doc:doc" },
    ];
    for (const { capability, pluginId } of cases) {
      const resolved = resolve(
        canonicalBrain,
        {},
        commerceOverrides({ add: [capability] }),
      );
      expect(pluginIds(resolved)).toContain(pluginId);
    }
  });
});
