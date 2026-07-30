import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import defaultSite from "@brains/site-default";
import {
  parseInstanceOverrides,
  registerConventionalSiteTheme,
  registerPackage,
  resolve,
  type AppConfig,
  type InstanceOverrides,
} from "@brains/app";
import rizomTheme from "@brains/theme-rizom";
import {
  canonicalBrain,
  coreBundle,
  publishingBundle,
  siteBundle,
  teamBundle,
} from "../src/model/canonical-brain";

const fixtureDirectory = join(import.meta.dir, "fixtures", "canonical-team");
const fixtureOverrides = parseInstanceOverrides(
  readFileSync(join(fixtureDirectory, "brain.yaml"), "utf8"),
);
registerPackage("@brains/site-default", defaultSite);
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
  "deck",
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
}

describe("canonical team bundle", () => {
  test("keeps fixed membership in canonical definition order", () => {
    expect(canonicalBrain.bundles).toEqual([
      coreBundle,
      siteBundle,
      publishingBundle,
      teamBundle,
    ]);
    expect(teamBundle.members).toEqual([
      "image",
      "note",
      "link",
      "topics",
      "decks",
      "mcp",
      "chat",
      "conversation-memory",
      "docs",
    ]);
  });

  test("parses explicit team choices and local site content", () => {
    expect(fixtureOverrides).toMatchObject({
      brain: "brain",
      anchor: "team",
      kind: "team",
      bundles: ["team", "site", "core"],
      plugins: {
        "directory-sync": {
          seedContentPath: "./seed-content",
          initialSync: true,
        },
      },
    });
    expect(effectiveFixtureOverrides.plugins?.["site-content"]).toBeDefined();
  });

  test("composes team config, instructions, and permissions", () => {
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
    expect(pluginConfig(resolved, "topics")).toMatchObject({
      extractableStatuses: ["published", "draft"],
    });
    expect(pluginConfig(resolved, "conversation-memory")).toMatchObject({
      enableProjection: true,
      memoryVisibility: "shared",
    });
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
