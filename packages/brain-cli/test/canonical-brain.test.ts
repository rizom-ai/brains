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
  "decks",
  "directory-sync",
  "atproto-registry",
  "agents",
  "assessment",
  "auth-service",
  "account",
  "notifications",
  "playbook",
  "playbooks",
  "onboarding",
  "cms",
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
  "products",
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

const expectedCoreMembers = [
  "prompt",
  "profile",
  "style-guide",
  "image",
  "document",
  "note",
  "link",
  "wishlist",
  "topics",
  "decks",
  "directory-sync",
  "atproto-registry",
  "agents",
  "assessment",
  "auth-service",
  "account",
  "notifications",
  "playbook",
  "playbooks",
  "onboarding",
  "email",
  "cms",
  "dashboard",
  "admin",
  "mcp",
  "webserver",
  "web-chat",
  "chat",
  "a2a",
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
    { bundles: ["core"] },
  ).plugins?.find((candidate) => candidate.id === id);
  if (!plugin || !("config" in plugin)) return undefined;
  const config = plugin.config;
  return isRecord(config) ? config : undefined;
}

type DefinitionPermissionRule = NonNullable<
  NonNullable<BrainDefinition["permissions"]>["rules"]
>[number];

const cliPermissionRule = {
  pattern: "cli:*",
  level: "admin",
} satisfies DefinitionPermissionRule;
const mcpStdioPermissionRule = {
  pattern: "mcp:stdio",
  level: "admin",
} satisfies DefinitionPermissionRule;
const definitionPermissionBaseline = {
  rules: [cliPermissionRule, mcpStdioPermissionRule],
} satisfies NonNullable<BrainDefinition["permissions"]>;

function withLegacyPermissionLayout(): BrainDefinition {
  const { permissions: _permissions, ...withoutDefinitionPermissions } =
    canonicalBrain;

  return {
    ...withoutDefinitionPermissions,
    bundles: (canonicalBrain.bundles ?? []).map((bundle) => {
      if (bundle.id !== "core") return bundle;

      return {
        ...bundle,
        permissions: (bundle.permissions ?? []).flatMap((contribution) => {
          if (contribution.member !== "mcp") return [contribution];

          return [
            {
              member: "admin",
              config: { rules: [cliPermissionRule] },
            },
            {
              ...contribution,
              config: {
                ...contribution.config,
                rules: [
                  mcpStdioPermissionRule,
                  ...(contribution.config.rules ?? []),
                ],
              },
            },
          ];
        }),
      };
    }),
  };
}

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

  test("expresses core posture as explicit final member IDs", () => {
    expect(coreBundle.members).toEqual(expectedCoreMembers);
  });

  test("uses canonical config without hidden site or identity", () => {
    expect(pluginConfig("dashboard")).toMatchObject({ routePath: "/" });
    expect(pluginConfig("directory-sync")).toMatchObject({
      seedContent: true,
      seedContentPath: "./seed-content",
      initialSync: true,
    });
    expect(pluginConfig("profile")).not.toHaveProperty(
      "starterIdentity.anchorKind",
    );

    const resolvedIds =
      resolve(canonicalBrain, {}, { bundles: ["core"] }).plugins?.map(
        (plugin) => plugin.id,
      ) ?? [];
    expect(resolvedIds).toContain("decks");
    expect(resolvedIds).toContain("atproto-registry");
    expect(resolvedIds).not.toContain("atproto");
    expect(resolvedIds).not.toContain("site-builder");
    expect(resolvedIds).not.toContain("email-workflows");
    expect(resolvedIds).not.toContain("unified-inbox");
  });

  test("keeps current posture policies byte-identical after baseline relocation", () => {
    expect(canonicalBrain.permissions).toEqual(definitionPermissionBaseline);

    const legacyDefinition = withLegacyPermissionLayout();
    const currentPostures = [
      { bundles: ["core"] },
      { bundles: ["core", "site", "publishing"] },
      { bundles: ["core", "site"], add: ["products"] },
      { bundles: ["core", "site", "team"] },
    ];

    for (const posture of currentPostures) {
      const current = resolve(canonicalBrain, {}, posture).permissions;
      const legacy = resolve(legacyDefinition, {}, posture).permissions;
      expect(JSON.stringify(current)).toBe(JSON.stringify(legacy));
    }
  });

  test("keeps definition rules when their former core members are removed", () => {
    const resolved = resolve(
      canonicalBrain,
      {},
      {
        bundles: ["core"],
        remove: ["admin", "mcp"],
      },
    );

    expect(resolved.permissions?.rules).toEqual([
      ...definitionPermissionBaseline.rules,
      { pattern: "discord:*", level: "public" },
      { pattern: "web-chat:*", level: "admin" },
    ]);
  });

  test("closes channel permissions and eval exclusions with core members", () => {
    const resolved = resolve(canonicalBrain, {}, { bundles: ["core"] });
    expect(resolved.permissions?.rules).toEqual(
      expect.arrayContaining([
        { pattern: "mcp:http", level: "public" },
        { pattern: "discord:*", level: "public" },
        { pattern: "web-chat:*", level: "admin" },
      ]),
    );

    const withoutMcp = resolve(
      canonicalBrain,
      {},
      {
        bundles: ["core"],
        remove: ["mcp"],
      },
    );
    expect(withoutMcp.permissions?.rules).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ pattern: "mcp:http" }),
      ]),
    );
  });
});
