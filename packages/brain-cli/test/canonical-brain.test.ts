import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolve, type BrainDefinition } from "@brains/app";
import { canonicalBrain, coreBundle } from "../src/model/canonical-brain";

const expectedCatalogIds = [
  "prompt",
  "profile",
  "style-guide",
  "image",
  "document",
  "note",
  "link",
  "wishlist",
  "topics",
  "knowledge-map",
  "decks",
  "directory-sync",
  "atproto-registry",
  "agents",
  "assessment",
  "auth-service",
  "notifications",
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
  "docs",
  "obsidian-vault",
  "email-workflows",
  "unified-inbox",
  "mcp",
  "email",
  "webserver",
  "web-chat",
  "chat",
  "a2a",
];

const bundleContract = "capability-bundles-v1" as const;

const expectedCoreMembers = [
  "profile",
  "prompt",
  "style-guide",
  "directory-sync",
  "note",
  "link",
  "topics",
  "unified-inbox",
  "mcp",
  "a2a",
  "agents",
];

function catalogIds(definition: BrainDefinition): string[] {
  return [
    ...definition.capabilities.map(([id]) => id),
    ...definition.interfaces.map(([id]) => id),
  ];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function pluginConfig(id: string): Record<string, unknown> | undefined {
  const plugin = resolve(
    canonicalBrain,
    {},
    { bundleContract, bundles: ["core"] },
  ).plugins?.find((candidate) => candidate.id === id);
  if (!plugin || !("config" in plugin)) return undefined;
  const config = plugin.config;
  return isRecord(config) ? config : undefined;
}

const definitionPermissionBaseline = {
  rules: [
    { pattern: "cli:*", level: "admin" },
    { pattern: "mcp:stdio", level: "admin" },
  ],
} satisfies NonNullable<BrainDefinition["permissions"]>;

describe("canonical brain core", () => {
  test("owns one complete model-neutral catalog", () => {
    expect(catalogIds(canonicalBrain)).toEqual(expectedCatalogIds);
    expect(new Set(expectedCatalogIds).size).toBe(expectedCatalogIds.length);
    expect(canonicalBrain.bundles?.[0]).toEqual(coreBundle);
    expect(canonicalBrain.site).toBeUndefined();
    expect(canonicalBrain.theme).toBeUndefined();
    expect(canonicalBrain.agentInstructions).toBeUndefined();
  });

  test("is the sole bundled definition", () => {
    const entrypoint = readFileSync(
      join(import.meta.dir, "..", "scripts", "entrypoint.ts"),
      "utf8",
    );

    expect(entrypoint).toContain("setCanonicalDefinition(canonicalBrain)");
    expect(entrypoint).not.toContain("registerModel");
  });

  test("expresses the headless posture as explicit final member IDs", () => {
    expect(coreBundle.members).toEqual(expectedCoreMembers);
  });

  test("resolves a self-contained headless core without hidden site policy", () => {
    expect(pluginConfig("dashboard")).toBeUndefined();
    expect(pluginConfig("directory-sync")).toMatchObject({
      seedContent: true,
      seedContentPath: "./seed-content",
      initialSync: true,
    });
    expect(pluginConfig("@brains/mcp:mcp")).toMatchObject({
      transport: "stdio",
    });
    expect(pluginConfig("profile")).not.toHaveProperty(
      "starterIdentity.anchorKind",
    );

    const resolvedIds =
      resolve(
        canonicalBrain,
        {},
        { bundleContract, bundles: ["core"] },
      ).plugins?.map((plugin) => plugin.id) ?? [];
    expect(resolvedIds).toEqual([
      "@brains/prompt:prompt",
      "@brains/profile:profile",
      "@brains/style-guide:style-guide",
      "@brains/note:note",
      "@brains/link:capture",
      "@brains/link:link",
      "@brains/topics:topics",
      "@brains/topics:topic",
      "directory-sync",
      "@brains/agent-discovery:agents",
      "@brains/agent-discovery:agent",
      "@brains/agent-discovery:skill",
      "@brains/unified-inbox:unified-inbox",
      "@brains/mcp:mcp",
      "a2a",
    ]);
    expect(resolvedIds).toContain("@brains/unified-inbox:unified-inbox");
    expect(resolvedIds).not.toContain("webserver");
    expect(resolvedIds).not.toContain("notifications");
    expect(resolvedIds).not.toContain("atproto");
    expect(resolvedIds).not.toContain("site-builder");
    expect(resolvedIds).not.toContain("email-workflows");
  });

  test("keeps posture-independent permissions on the definition", () => {
    expect(canonicalBrain.permissions).toEqual(definitionPermissionBaseline);

    const resolved = resolve(
      canonicalBrain,
      {},
      {
        bundleContract,
        bundles: ["core"],
        remove: ["mcp"],
      },
    );
    expect(resolved.permissions?.rules).toEqual(
      definitionPermissionBaseline.rules,
    );
  });

  test("opens channel permissions only with their channel bundles", () => {
    const headless = resolve(
      canonicalBrain,
      {},
      {
        bundleContract,
        bundles: ["core"],
      },
    );
    expect(headless.permissions?.rules).toEqual(
      definitionPermissionBaseline.rules,
    );

    const personal = resolve(
      canonicalBrain,
      {},
      {
        bundleContract,
        bundles: ["core", "media", "web", "chat"],
      },
    );
    expect(personal.permissions?.rules).toEqual([
      ...definitionPermissionBaseline.rules,
      { pattern: "mcp:http", level: "public" },
      { pattern: "discord:*", level: "public" },
      { pattern: "web-chat:*", level: "admin" },
    ]);
  });
});
