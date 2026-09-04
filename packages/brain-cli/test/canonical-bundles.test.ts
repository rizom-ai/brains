import { describe, expect, test } from "bun:test";
import {
  resolve,
  resolveBundleSelection,
  type AppConfig,
  type BundleSelectionResolution,
  type ResolvedBundlePermissionContribution,
} from "@brains/app";
import {
  publishingAgentInstructions,
  teamAgentInstructions,
  trustedContentEntityActions,
} from "../src/model/bundle-policy";
import { canonicalBundles } from "../src/model/canonical-bundles";
import { canonicalBrain } from "../src/model/canonical-brain";
import { isRecord } from "@brains/utils/is-record";

const catalogIds = [
  ...canonicalBrain.capabilities.map(([id]) => id),
  ...canonicalBrain.interfaces.map(([id]) => id),
];

const targetRecipeNames = [
  "headless",
  "personal",
  "professional",
  "team",
] as const;
type TargetRecipeName = (typeof targetRecipeNames)[number];

interface TargetRecipeSelection {
  bundleContract: "capability-bundles-v1";
  bundles: string[];
  add?: string[];
}

const bundleContract = "capability-bundles-v1" as const;
const targetRecipes: Record<TargetRecipeName, TargetRecipeSelection> = {
  headless: { bundleContract, bundles: ["core"] },
  personal: {
    bundleContract,
    bundles: ["core", "media", "web", "chat"],
  },
  professional: {
    bundleContract,
    bundles: [
      "core",
      "media",
      "automation",
      "web",
      "chat",
      "site",
      "publishing",
      "federation",
    ],
  },
  team: {
    bundleContract,
    bundles: ["core", "media", "automation", "web", "chat", "site", "team"],
    add: ["docs"],
  },
};

const expectedMembers: Record<TargetRecipeName, string[]> = {
  headless: [
    "prompt",
    "profile",
    "style-guide",
    "note",
    "link",
    "topics",
    "directory-sync",
    "agents",
    "unified-inbox",
    "mcp",
    "a2a",
  ],
  personal: [
    "prompt",
    "profile",
    "style-guide",
    "image",
    "document",
    "note",
    "link",
    "topics",
    "directory-sync",
    "agents",
    "auth-service",
    "notifications",
    "studio",
    "dashboard",
    "admin",
    "conversation-memory",
    "unified-inbox",
    "mcp",
    "email",
    "webserver",
    "web-chat",
    "chat",
    "a2a",
  ],
  professional: [
    "prompt",
    "profile",
    "style-guide",
    "image",
    "document",
    "note",
    "link",
    "topics",
    "decks",
    "directory-sync",
    "atproto-registry",
    "agents",
    "auth-service",
    "notifications",
    "playbook",
    "playbooks",
    "onboarding",
    "studio",
    "dashboard",
    "admin",
    "site-info",
    "site-content",
    "site-builder",
    "analytics",
    "blog",
    "series",
    "portfolio",
    "content-pipeline",
    "social-media",
    "newsletter",
    "stock-photo",
    "atproto",
    "conversation-memory",
    "unified-inbox",
    "mcp",
    "email",
    "webserver",
    "web-chat",
    "chat",
    "a2a",
  ],
  team: [
    "prompt",
    "profile",
    "style-guide",
    "image",
    "document",
    "note",
    "link",
    "topics",
    "directory-sync",
    "agents",
    "auth-service",
    "notifications",
    "playbook",
    "playbooks",
    "onboarding",
    "studio",
    "dashboard",
    "admin",
    "site-info",
    "site-content",
    "site-builder",
    "analytics",
    "conversation-memory",
    "docs",
    "unified-inbox",
    "mcp",
    "email",
    "webserver",
    "web-chat",
    "chat",
    "a2a",
  ],
};

const webPermission: ResolvedBundlePermissionContribution = {
  bundleId: "web",
  member: "mcp",
  config: { rules: [{ pattern: "mcp:http", level: "public" }] },
};

const channelPermissions: ResolvedBundlePermissionContribution[] = [
  webPermission,
  {
    bundleId: "chat",
    member: "chat",
    config: { rules: [{ pattern: "discord:*", level: "public" }] },
  },
  {
    bundleId: "chat",
    member: "web-chat",
    config: { rules: [{ pattern: "web-chat:*", level: "admin" }] },
  },
];

const teamPermissions: ResolvedBundlePermissionContribution[] = [
  ...channelPermissions,
  {
    bundleId: "team",
    member: "note",
    config: { entityActions: { note: trustedContentEntityActions } },
  },
  {
    bundleId: "team",
    member: "link",
    config: { entityActions: { link: trustedContentEntityActions } },
  },
  {
    bundleId: "team",
    member: "image",
    config: { entityActions: { image: trustedContentEntityActions } },
  },
  {
    bundleId: "team",
    member: "docs",
    config: { entityActions: { doc: trustedContentEntityActions } },
  },
  {
    bundleId: "team",
    member: "conversation-memory",
    config: {
      entityActions: {
        decision: trustedContentEntityActions,
        "action-item": trustedContentEntityActions,
      },
    },
  },
  {
    bundleId: "team",
    member: "mcp",
    config: { rules: [{ pattern: "mcp:http", level: "admin" }] },
    overrides: "web",
  },
];

function targetResolution(name: TargetRecipeName): BundleSelectionResolution {
  const recipe = targetRecipes[name];
  return resolveBundleSelection({
    catalogIds,
    definitions: canonicalBundles,
    selected: recipe.bundles,
    ...(recipe.add ? { add: recipe.add } : {}),
  });
}

function pluginConfig(
  resolved: AppConfig,
  id: string,
): Record<string, unknown> | undefined {
  const plugin = resolved.plugins?.find((candidate) => candidate.id === id);
  if (!plugin || !("config" in plugin)) return undefined;
  return isRecord(plugin.config) ? plugin.config : undefined;
}

function permissionLevel(
  resolved: AppConfig,
  pattern: string,
): string | undefined {
  return resolved.permissions?.rules?.find((rule) => rule.pattern === pattern)
    ?.level;
}

describe("canonical bundle taxonomy", () => {
  test("is the active nine-bundle registry", () => {
    expect(canonicalBrain.bundles?.map(({ id }) => id)).toEqual([
      "core",
      "media",
      "automation",
      "web",
      "chat",
      "site",
      "publishing",
      "federation",
      "team",
    ]);
    expect(canonicalBrain.bundles).toBe(canonicalBundles);
  });

  for (const name of targetRecipeNames) {
    test(`${name} resolves the exact canonical member set`, () => {
      const resolution = targetResolution(name);
      expect(resolution.activeBundles).toEqual(targetRecipes[name].bundles);
      expect(resolution.activeMembers).toEqual(expectedMembers[name]);
    });
  }

  test("headless contributes only the core eval exclusion", () => {
    const resolution = targetResolution("headless");
    expect(resolution.configByMember).toEqual({});
    expect(resolution.permissionContributions).toEqual([]);
    expect(resolution.agentInstructions).toEqual([]);
    expect(resolution.evalDisable).toEqual(["mcp"]);
  });

  test("personal composes private console channel policy", () => {
    const resolution = targetResolution("personal");
    expect(resolution.configByMember).toEqual({
      dashboard: { routePath: "/" },
    });
    expect(resolution.permissionContributions).toEqual(channelPermissions);
    expect(resolution.agentInstructions).toEqual([]);
    expect(resolution.evalDisable).toEqual([
      "mcp",
      "webserver",
      "dashboard",
      "chat",
      "web-chat",
      "email",
    ]);
  });

  test("professional composes site, publishing, and federation policy", () => {
    const resolution = targetResolution("professional");
    expect(resolution.configByMember).toEqual({
      dashboard: { routePath: "/dashboard" },
      "content-pipeline": {
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
      },
      "social-media": { autoGenerateOnBlogPublish: true },
      newsletter: { doubleOptIn: true },
    });
    expect(resolution.permissionContributions).toEqual(channelPermissions);
    expect(resolution.agentInstructions).toEqual(publishingAgentInstructions);
    expect(resolution.evalDisable).toEqual([
      "mcp",
      "webserver",
      "dashboard",
      "chat",
      "web-chat",
      "email",
      "analytics",
      "atproto",
    ]);
  });

  test("team composes policy without owning members", () => {
    const resolution = targetResolution("team");
    expect(canonicalBundles.at(-1)?.members).toEqual([]);
    expect(resolution.configByMember).toEqual({
      topics: { extractableStatuses: ["published", "draft"] },
      dashboard: { routePath: "/dashboard" },
      "conversation-memory": { memoryVisibility: "shared" },
    });
    expect(resolution.permissionContributions).toEqual(teamPermissions);
    expect(resolution.agentInstructions).toEqual(teamAgentInstructions);
    expect(resolution.evalDisable).toEqual([
      "mcp",
      "webserver",
      "dashboard",
      "chat",
      "web-chat",
      "email",
      "analytics",
    ]);
  });

  test("derives effective transport and team permission overrides", () => {
    const headless = resolve(canonicalBrain, {}, targetRecipes.headless);
    expect(pluginConfig(headless, "mcp")?.["transport"]).toBe("stdio");
    expect(headless.plugins?.some(({ id }) => id === "webserver")).toBe(false);
    expect(permissionLevel(headless, "mcp:http")).toBeUndefined();

    const personal = resolve(canonicalBrain, {}, targetRecipes.personal);
    expect(pluginConfig(personal, "mcp")?.["transport"]).toBe("http");
    expect(permissionLevel(personal, "mcp:http")).toBe("public");

    const team = resolve(canonicalBrain, {}, targetRecipes.team);
    expect(permissionLevel(team, "mcp:http")).toBe("admin");
    for (const entityType of [
      "note",
      "link",
      "image",
      "doc",
      "decision",
      "action-item",
    ]) {
      expect(team.permissions?.entityActions?.[entityType]).toEqual(
        trustedContentEntityActions,
      );
    }
    expect(team.permissions?.entityActions?.["deck"]).toBeUndefined();
  });
});
