import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import organizationSite from "@brains/site-organization";
import {
  parseInstanceOverrides,
  registerConventionalSiteTheme,
  registerPackage,
  resolve,
  type AppConfig,
  type InstanceOverrides,
} from "@brains/app";
import rizomTheme from "@brains/theme-rizom";
import { canonicalBrain, teamBundle } from "../src/model/canonical-brain";
import { isRecord } from "@brains/utils/is-record";
import { createPluginHarness } from "@brains/plugins/test";
import { createSilentLogger } from "@brains/test-utils";

const fixtureDirectory = join(import.meta.dir, "fixtures", "canonical-team");
const fixtureOverrides = parseInstanceOverrides(
  readFileSync(join(fixtureDirectory, "brain.yaml"), "utf8"),
);
registerPackage("@brains/site-organization", organizationSite);
registerPackage("@brains/theme-rizom", rizomTheme);
const effectiveFixtureOverrides = await registerConventionalSiteTheme(
  fixtureDirectory,
  fixtureOverrides,
);

const trustedEntityTypes = [
  "note",
  "link",
  "image",
  "doc",
  "decision",
  "action-item",
];

function runtimeOverrides(
  overrides: InstanceOverrides,
): Omit<InstanceOverrides, "brain"> {
  const { brain: _brain, ...runtime } = overrides;
  return runtime;
}

function pluginIds(resolved: AppConfig): string[] {
  return resolved.plugins?.map((plugin) => plugin.id) ?? [];
}

/** The templates the resolved site package registers, as the brain registers it. */
async function siteTemplates(resolved: AppConfig): Promise<string[]> {
  const sitePackage = resolved.plugins?.find(
    (plugin) => plugin.id === "site-package",
  );
  if (!sitePackage) throw new Error("No site package plugin was resolved");
  const harness = createPluginHarness({ logger: createSilentLogger() });
  await harness.installPlugin(sitePackage);
  return [...harness.getTemplates().keys()];
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

function expectTrustedTeamPolicy(resolved: AppConfig): void {
  const entityActions = resolved.permissions?.entityActions;
  expect(entityActions?.["*"]).toEqual({
    create: "admin",
    update: "admin",
    delete: "admin",
    extract: "admin",
    publish: "admin",
  });
  for (const entityType of trustedEntityTypes) {
    expect(entityActions?.[entityType]).toEqual({
      create: "trusted",
      update: "trusted",
      delete: "admin",
      extract: "admin",
      publish: "admin",
    });
  }
  expect(entityActions?.["summary"]).toEqual({
    create: "never",
    update: "never",
    delete: "never",
    extract: "never",
    publish: "never",
  });
}

describe("canonical team bundle", () => {
  test("keeps team as policy over independently selected members", () => {
    expect(teamBundle.members).toEqual([]);
  });

  test("parses explicit team choices and local site content", () => {
    expect(fixtureOverrides).toMatchObject({
      brain: "brain",
      anchor: "team",
      kind: "team",
      bundles: ["team", "site", "chat", "web", "automation", "media", "core"],
      add: ["docs"],
      plugins: {
        "directory-sync": {
          seedContentPath: "./seed-content",
          initialSync: true,
        },
      },
    });
    expect(effectiveFixtureOverrides.plugins?.["site-content"]).toBeDefined();
  });

  test("composes team config, instructions, and permissions", async () => {
    const resolved = resolve(
      canonicalBrain,
      {},
      runtimeOverrides(effectiveFixtureOverrides),
    );

    expect(resolved.profileKind).toBe("team");
    const ids = pluginIds(resolved);
    for (const id of ["conversation-memory", "docs", "site-builder", "mcp"]) {
      expect(ids).toContain(id);
    }
    const templates = await siteTemplates(resolved);
    expect(templates).toContain("organization-site:homepage");
    expect(
      templates.some((name) => name.startsWith("professional-site:")),
    ).toBe(false);
    expect(pluginConfig(resolved, "topics")).toMatchObject({
      extractableStatuses: ["published", "draft"],
    });
    expect(pluginConfig(resolved, "conversation-memory")).toMatchObject({
      memoryVisibility: "shared",
    });
    expect(pluginConfig(resolved, "conversation-memory")).not.toHaveProperty(
      "enableProjection",
    );
    expect(resolved.agentInstructions).toEqual(
      teamBundle.agentInstructions ?? [],
    );
    expectTrustedTeamPolicy(resolved);
  });

  test("removal closes team contributions", () => {
    const base = runtimeOverrides(effectiveFixtureOverrides);
    const resolved = resolve(
      canonicalBrain,
      {},
      {
        ...base,
        remove: ["conversation-memory", "docs"],
      },
    );

    expect(pluginIds(resolved)).not.toContain("conversation-memory");
    expect(pluginIds(resolved)).not.toContain("docs");
    expect(
      resolved.permissions?.rules?.some((rule) =>
        rule.pattern.startsWith("docs:"),
      ),
    ).toBe(false);
  });
});
