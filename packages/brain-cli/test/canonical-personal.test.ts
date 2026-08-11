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
  coreBundle,
  publishingBundle,
  siteBundle,
  teamBundle,
} from "../src/model/canonical-brain";

registerPackage("@brains/site-default", defaultSite);
registerPackage("@rizom/theme-default", defaultTheme);

const fixtureOverrides = parseInstanceOverrides(
  readFileSync(
    join(import.meta.dir, "fixtures", "canonical-personal", "brain.yaml"),
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

describe("canonical personal bundles", () => {
  test("defines fixed site and publishing membership in canonical order", () => {
    expect(canonicalBrain.bundles).toEqual([
      coreBundle,
      siteBundle,
      publishingBundle,
      teamBundle,
    ]);
    expect(siteBundle.members).toEqual([
      "dashboard",
      "site-info",
      "site-content",
      "site-builder",
      "analytics",
    ]);
    expect(publishingBundle.members).toEqual([
      "blog",
      "series",
      "portfolio",
      "content-pipeline",
      "social-media",
      "newsletter",
      "stock-photo",
      "atproto",
    ]);
  });

  test("parses explicit instance-owned personal choices", () => {
    expect(fixtureOverrides).toMatchObject({
      brain: "brain",
      anchor: "person",
      kind: "professional",
      bundles: ["publishing", "site", "core"],
      site: {
        package: "@brains/site-default",
        theme: "@rizom/theme-default",
      },
      plugins: {
        "directory-sync": { seedContentPath: "./seed-content" },
      },
    });
  });

  test("composes site and publishing config in definition order", () => {
    const resolved = resolve(canonicalBrain, {}, canonicalOverrides());

    expect(resolved.profileKind).toBe("professional");
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
    expect(pluginConfig(resolved, "social-media")).toMatchObject({
      autoGenerateOnBlogPublish: true,
    });
    expect(pluginConfig(resolved, "buttondown")).toMatchObject({
      doubleOptIn: true,
    });
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

  test("keeps site and publishing independently selectable", () => {
    const siteOnly = resolve(
      canonicalBrain,
      {},
      canonicalOverrides({ bundles: ["core", "site"] }),
    );
    expect(pluginIds(siteOnly)).toContain("site-builder");
    expect(pluginIds(siteOnly)).not.toContain("blog");

    const publishingOnly = resolve(
      canonicalBrain,
      {},
      canonicalOverrides({ bundles: ["core", "publishing"] }),
    );
    expect(pluginIds(publishingOnly)).toContain("blog");
    expect(pluginIds(publishingOnly)).toContain("atproto");
    expect(pluginIds(publishingOnly)).not.toContain("site-builder");
  });

  test("keeps publishing instructions definition-owned and neutral", () => {
    const instructions =
      resolve(canonicalBrain, {}, canonicalOverrides()).agentInstructions ?? [];
    expect(instructions).toEqual(publishingBundle.agentInstructions ?? []);
    expect(instructions.join("\n")).toContain("publishing capabilities");
  });

  test("lets trusted collaborators capture notes and links in every posture", () => {
    // The platform baseline is "*": admin, so a content type a trusted user is
    // meant to capture has to be granted explicitly. Only the team bundle did,
    // which left a trusted user unable to save a note on a personal brain even
    // though the tool was offered to them.
    for (const bundles of [["core"], ["core", "site", "publishing"]]) {
      const entityActions =
        resolve(canonicalBrain, {}, { bundles }).permissions?.entityActions ??
        {};

      for (const entityType of ["note", "link"]) {
        expect(
          entityActions[entityType],
          `${bundles.join("+")}/${entityType}`,
        ).toEqual({
          create: "trusted",
          update: "trusted",
          delete: "admin",
          extract: "admin",
          publish: "admin",
        });
      }
    }
  });
});
