import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import defaultSite from "@brains/site-default";
import {
  applyConventionalSiteRefs,
  CONVENTIONAL_SITE_PACKAGE_REF,
  parseInstanceOverrides,
  registerConventionalSitePackage,
  registerPackage,
  resolve,
  type AppConfig,
  type InstanceOverrides,
} from "@brains/app";
import defaultTheme from "@rizom/theme-default";
import {
  canonicalBrain,
  publishingBundle,
  siteBundle,
} from "../src/model/canonical-brain";

registerPackage("@brains/site-default", defaultSite);
registerPackage("@rizom/theme-default", defaultTheme);

const fixtureOverrides = parseInstanceOverrides(
  readFileSync(
    join(import.meta.dir, "fixtures", "canonical-professional", "brain.yaml"),
    "utf8",
  ),
);

function canonicalOverrides(
  extra: Partial<InstanceOverrides> = {},
): Omit<InstanceOverrides, "brain"> {
  const { brain: _brain, ...runtimeFixture } = fixtureOverrides;
  return { ...runtimeFixture, ...extra };
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

describe("canonical professional posture", () => {
  test("defines independent site and publishing membership", () => {
    expect(siteBundle.members).toEqual([
      "site-info",
      "site-content",
      "site-builder",
      "analytics",
    ]);
    expect(publishingBundle.members).toEqual([
      "blog",
      "series",
      "portfolio",
      "decks",
      "content-pipeline",
      "social-media",
      "newsletter",
      "stock-photo",
    ]);
  });

  test("parses the explicit professional recipe in non-canonical order", () => {
    expect(fixtureOverrides).toMatchObject({
      brain: "brain",
      anchor: "person",
      kind: "professional",
      bundles: [
        "federation",
        "publishing",
        "site",
        "chat",
        "web",
        "automation",
        "media",
        "core",
      ],
      site: {
        package: "@brains/site-default",
        theme: "@rizom/theme-default",
      },
      plugins: {
        "directory-sync": { seedContentPath: "./seed-content" },
      },
    });
  });

  test("composes channel, site, publishing, and federation policy", () => {
    const resolved = resolve(canonicalBrain, {}, canonicalOverrides());

    expect(resolved.profileKind).toBe("professional");
    expect(pluginConfig(resolved, "@brains/mcp:mcp")).toMatchObject({
      transport: "http",
    });
    expect(pluginConfig(resolved, "dashboard")).toMatchObject({
      routePath: "/dashboard",
    });
    expect(pluginConfig(resolved, "site-builder")).toMatchObject({
      routes: expect.any(Array),
      themeCSS: expect.any(String),
    });
    expect(pluginConfig(resolved, "content-pipeline")).toMatchObject({
      generationSchedules: {
        newsletter: "0 9 * * 1",
        "social-post": "0 10 * * *",
      },
    });
    expect(pluginConfig(resolved, "buttondown")).toMatchObject({
      doubleOptIn: true,
    });
    expect(pluginIds(resolved)).toContain("atproto");
    expect(pluginIds(resolved)).toContain(
      "@brains/atproto-registry:atproto-registry",
    );
  });

  test("preserves the base professional plugin under local site overrides", () => {
    const home = defaultSite.routes.find((route) => route.id === "home");
    if (!home) throw new Error("Default professional site has no home route");

    registerConventionalSitePackage(
      {
        layouts: { default: (): null => null },
        routes: [
          {
            ...home,
            sections: [
              ...(home.sections ?? []),
              { id: "ecosystem", template: "local-site:ecosystem" },
            ],
          },
        ],
        entityDisplay: { post: { label: "Essay" } },
      },
      "@brains/site-default",
    );
    const overrides = applyConventionalSiteRefs(canonicalOverrides(), {
      sitePackageRef: CONVENTIONAL_SITE_PACKAGE_REF,
    });

    const resolved = resolve(canonicalBrain, {}, overrides);
    const routes = pluginConfig(resolved, "site-builder")?.["routes"];
    const resolvedHome = Array.isArray(routes)
      ? routes.find((route) => isRecord(route) && route["id"] === "home")
      : undefined;

    expect(pluginIds(resolved)).toContain("professional-site");
    expect(resolvedHome).toMatchObject({
      sections: expect.arrayContaining([
        { id: "ecosystem", template: "local-site:ecosystem" },
      ]),
    });
  });

  test("keeps site, publishing, and federation independently selectable", () => {
    const siteOnly = resolve(
      canonicalBrain,
      {},
      canonicalOverrides({ bundles: ["core", "media", "web", "site"] }),
    );
    expect(pluginIds(siteOnly)).toContain("site-builder");
    expect(pluginIds(siteOnly)).not.toContain("@brains/blog:post");

    const publishingOnly = resolve(
      canonicalBrain,
      {},
      canonicalOverrides({ bundles: ["core", "media", "publishing"] }),
    );
    expect(pluginIds(publishingOnly)).toContain("@brains/blog:post");
    expect(pluginIds(publishingOnly)).not.toContain("site-builder");
    expect(pluginIds(publishingOnly)).not.toContain("atproto");

    const federationOnly = resolve(
      canonicalBrain,
      {},
      canonicalOverrides({ bundles: ["core", "federation"] }),
    );
    expect(pluginIds(federationOnly)).toContain("atproto");
    expect(pluginIds(federationOnly)).not.toContain("site-builder");
  });

  test("keeps publishing instructions definition-owned and neutral", () => {
    const instructions =
      resolve(canonicalBrain, {}, canonicalOverrides()).agentInstructions ?? [];
    expect(instructions).toEqual(publishingBundle.agentInstructions ?? []);
    expect(instructions.join("\n")).toContain("publishing capabilities");
  });
});
