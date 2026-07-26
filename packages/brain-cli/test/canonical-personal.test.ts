import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import rover from "@brains/rover";
import defaultSite from "@brains/site-default";
import {
  parseInstanceOverrides,
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
} from "../src/model/canonical-brain";

registerPackage("@brains/site-default", defaultSite);
registerPackage("@rizom/theme-default", defaultTheme);

const fixturePath = join(
  import.meta.dir,
  "fixtures",
  "canonical-personal",
  "brain.yaml",
);
const fixtureOverrides = parseInstanceOverrides(
  readFileSync(fixturePath, "utf8"),
);

const siteMembers = [
  "dashboard",
  "site-info",
  "site-content",
  "site-builder",
  "analytics",
];
const publishingMembers = [
  "blog",
  "series",
  "portfolio",
  "content-pipeline",
  "social-media",
  "newsletter",
  "stock-photo",
  "atproto",
];
const legacyDefaultRemovals = [
  "series",
  "portfolio",
  "content-pipeline",
  "social-media",
  "newsletter",
  "stock-photo",
];

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

function canonicalOverrides(
  extra: Partial<InstanceOverrides> = {},
): Omit<InstanceOverrides, "brain"> {
  const { brain: _brain, ...runtimeFixture } = fixtureOverrides;
  return {
    ...runtimeFixture,
    ...extra,
    site: fixtureOverrides.site,
    plugins: fixtureOverrides.plugins,
  };
}

function pluginIds(resolved: AppConfig): string[] {
  return (resolved.plugins ?? []).map((plugin) => plugin.id);
}

function compareLegacyPluginConfigs(
  legacy: AppConfig,
  canonical: AppConfig,
): void {
  const canonicalById = new Map(
    (canonical.plugins ?? []).map((plugin) => [plugin.id, plugin]),
  );
  const approvedConfigDeltas = new Set(["profile", "directory-sync"]);

  for (const plugin of legacy.plugins ?? []) {
    if (approvedConfigDeltas.has(plugin.id)) continue;
    expect(
      (canonicalById.get(plugin.id) as PluginWithConfig | undefined)?.config,
    ).toEqual((plugin as PluginWithConfig).config);
  }
  expect(canonical.permissions).toEqual(legacy.permissions);
}

describe("canonical personal bundles", () => {
  test("defines fixed site and publishing membership in canonical order", () => {
    expect(canonicalBrain.bundles).toEqual([
      coreBundle,
      siteBundle,
      publishingBundle,
    ]);
    expect(siteBundle.members).toEqual(siteMembers);
    expect(publishingBundle.members).toEqual(publishingMembers);
    expect(siteBundle.config).toContainEqual({
      member: "dashboard",
      value: { routePath: "/dashboard" },
      overrides: "core",
    });
  });

  test("parses a parallel personal fixture without activating it in the registry", () => {
    expect(fixtureOverrides).toMatchObject({
      brain: "brain",
      anchor: "person",
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

    expect(configFor(resolved, "dashboard")?.config).toMatchObject({
      routePath: "/dashboard",
    });
    expect(configFor(resolved, "site-builder")?.config).toMatchObject({
      routes: expect.any(Array),
      themeCSS: expect.any(String),
    });
    expect(configFor(resolved, "content-pipeline")?.config).toMatchObject({
      generationSchedules: {
        newsletter: "0 9 * * 1",
        "social-post": "0 10 * * *",
      },
      generationConditions: {
        newsletter: {
          skipIfDraftExists: true,
          minSourceEntities: 1,
          sourceEntityType: "post",
        },
        "social-post": {
          skipIfDraftExists: true,
          maxUnpublishedDrafts: 5,
        },
      },
    });
    expect(configFor(resolved, "social-media")?.config).toMatchObject({
      autoGenerateOnBlogPublish: true,
    });
    expect(configFor(resolved, "buttondown")?.config).toMatchObject({
      doubleOptIn: true,
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
    expect(pluginIds(siteOnly)).not.toContain("atproto");

    const publishingOnly = resolve(
      canonicalBrain,
      {},
      canonicalOverrides({ bundles: ["core", "publishing"] }),
    );
    expect(pluginIds(publishingOnly)).toContain("blog");
    expect(pluginIds(publishingOnly)).toContain("atproto");
    expect(pluginIds(publishingOnly)).not.toContain("site-builder");
    expect(pluginIds(publishingOnly)).not.toContain("analytics");
  });

  test("keeps publishing instructions model-neutral", () => {
    const resolved = resolve(canonicalBrain, {}, canonicalOverrides());
    const instructions = resolved.agentInstructions ?? [];
    const text = instructions.join("\n");

    expect(instructions).toEqual(publishingBundle.agentInstructions ?? []);
    expect(text).toContain("publishing capabilities");
    expect(text).not.toMatch(/\bRover\b|\bRelay\b|Rover-for-teams/i);
  });

  test("keeps topic posture unchanged for personal publishing", () => {
    const legacy = resolve(rover, {}, { preset: "full" });
    const canonical = resolve(canonicalBrain, {}, canonicalOverrides());

    expect(configFor(canonical, "topics")?.config).toEqual(
      configFor(legacy, "topics")?.config,
    );
  });

  test("characterizes the visible Rover default migration", () => {
    const legacy = resolve(rover, {}, { preset: "default" });
    const canonical = resolve(
      canonicalBrain,
      {},
      canonicalOverrides({
        add: ["obsidian-vault"],
        remove: legacyDefaultRemovals,
      }),
    );

    compareLegacyPluginConfigs(legacy, canonical);
    expect(pluginIds(canonical)).toContain("site-content");
    expect(pluginIds(canonical)).toContain("atproto-registry");
  });

  test("characterizes the visible Rover full migration", () => {
    const legacy = resolve(rover, {}, { preset: "full" });
    const canonical = resolve(
      canonicalBrain,
      {},
      canonicalOverrides({ add: ["obsidian-vault"] }),
    );

    compareLegacyPluginConfigs(legacy, canonical);
    expect(pluginIds(canonical)).toContain("site-content");
    expect(pluginIds(canonical)).toContain("atproto-registry");
  });

  test("keeps opt-ins explicit for personal and consolidated postures", () => {
    const personal = resolve(canonicalBrain, {}, canonicalOverrides());
    expect(pluginIds(personal)).not.toContain("obsidian-vault");
    expect(pluginIds(personal)).not.toContain("products");
    expect(pluginIds(personal)).not.toContain("rizom-ecosystem");
    expect(pluginIds(personal)).not.toContain("docs");

    const consolidated = resolve(
      canonicalBrain,
      {},
      canonicalOverrides({
        add: ["products", "rizom-ecosystem", "docs"],
      }),
    );
    expect(pluginIds(consolidated)).toEqual(
      expect.arrayContaining(["products", "rizom-ecosystem", "docs"]),
    );
  });

  test("applies bundle-owned eval exclusions", () => {
    const evaluated = resolve(
      canonicalBrain,
      {},
      canonicalOverrides({ mode: "eval" }),
    );
    const ids = pluginIds(evaluated);

    expect(ids).not.toContain("dashboard");
    expect(ids).not.toContain("analytics");
    expect(ids).not.toContain("atproto");
  });
});
