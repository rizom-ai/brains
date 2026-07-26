import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ranger from "@brains/ranger";
import relay from "@brains/relay";
import rover from "@brains/rover";
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
  "email-resend",
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
  "rizom-ecosystem",
  "mcp",
  "webserver",
  "web-chat",
  "discord",
  "a2a",
  "chat",
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
  "email-resend",
  "cms",
  "dashboard",
  "admin",
  "mcp",
  "webserver",
  "web-chat",
  "discord",
  "a2a",
];

interface PluginWithConfig {
  id: string;
  config?: Record<string, unknown>;
}

function catalogIds(definition: BrainDefinition): string[] {
  return [
    ...definition.capabilities.map(([id]) => id),
    ...definition.interfaces.map(([id]) => id),
  ];
}

function resolvedPlugin(id: string): PluginWithConfig | undefined {
  return (
    resolve(canonicalBrain, {}, { bundles: ["core"] }).plugins ?? []
  ).find((plugin) => plugin.id === id) as PluginWithConfig | undefined;
}

describe("canonical brain core", () => {
  test("owns one model-neutral catalog in @rizom/brain source", () => {
    expect(catalogIds(canonicalBrain)).toEqual(expectedCatalogIds);
    expect(new Set(expectedCatalogIds).size).toBe(expectedCatalogIds.length);
    expect(canonicalBrain.bundles?.[0]).toEqual(coreBundle);
    expect(canonicalBrain.presets).toBeUndefined();
    expect(canonicalBrain.site).toBeUndefined();
    expect(canonicalBrain.theme).toBeUndefined();
    expect(canonicalBrain.agentInstructions).toBeUndefined();
  });

  test("is not registered before the coordinated crossover", () => {
    const entrypoint = readFileSync(
      join(import.meta.dir, "..", "scripts", "entrypoint.ts"),
      "utf8",
    );

    expect(entrypoint).not.toContain("canonicalBrain");
    expect(entrypoint).not.toContain('registerModel("brain"');
  });

  test("covers the complete legacy catalog under final member IDs", () => {
    const legacyCatalog = new Set(
      [rover, relay, ranger]
        .flatMap((definition) => catalogIds(definition))
        .map((id) => {
          if (id === "dashboard-root") return "dashboard";
          if (id === "rover-onboarding") return "onboarding";
          return id;
        }),
    );

    expect(new Set(catalogIds(canonicalBrain))).toEqual(legacyCatalog);
  });

  test("expresses the approved Rover core crossover as explicit members", () => {
    const legacyCore = new Set(rover.presets?.core ?? []);
    legacyCore.delete("dashboard-root");
    legacyCore.delete("rover-onboarding");
    legacyCore.delete("atproto");
    legacyCore.add("dashboard");
    legacyCore.add("onboarding");
    legacyCore.add("decks");
    legacyCore.add("atproto-registry");

    expect(coreBundle.members).toEqual(expectedCoreMembers);
    expect(new Set(coreBundle.members)).toEqual(legacyCore);
  });

  test("preserves unchanged Rover core plugin config and permissions", () => {
    const legacy = resolve(rover, {}, { preset: "core" });
    const canonical = resolve(canonicalBrain, {}, { bundles: ["core"] });
    const canonicalById = new Map(
      (canonical.plugins ?? []).map((plugin) => [plugin.id, plugin]),
    );
    const approvedConfigDeltas = new Set([
      "profile",
      "dashboard",
      "directory-sync",
      "atproto",
    ]);

    for (const plugin of legacy.plugins ?? []) {
      if (approvedConfigDeltas.has(plugin.id)) continue;
      expect(
        (canonicalById.get(plugin.id) as PluginWithConfig | undefined)?.config,
      ).toEqual((plugin as PluginWithConfig).config);
    }
    expect(canonical.permissions).toEqual(legacy.permissions);
  });

  test("uses canonical core config without hidden site or seed identity", () => {
    expect(resolvedPlugin("dashboard")?.config).toMatchObject({
      routePath: "/",
    });
    expect(resolvedPlugin("directory-sync")?.config).toMatchObject({
      seedContent: true,
      seedContentPath: "./seed-content",
      initialSync: true,
    });
    expect(resolvedPlugin("profile")?.config).not.toHaveProperty(
      "starterIdentity.anchorKind",
    );

    const resolvedIds =
      resolve(
        canonicalBrain,
        {},
        {
          bundles: ["core"],
        },
      ).plugins?.map((plugin) => plugin.id) ?? [];
    expect(resolvedIds).toContain("decks");
    expect(resolvedIds).toContain("atproto-registry");
    expect(resolvedIds).not.toContain("atproto");
    expect(resolvedIds).not.toContain("site-builder");
  });

  test("attaches transport permissions and eval exclusions to core members", () => {
    const resolved = resolve(canonicalBrain, {}, { bundles: ["core"] });
    expect(resolved.permissions?.rules).toEqual(
      expect.arrayContaining([
        { pattern: "cli:*", level: "admin" },
        { pattern: "mcp:stdio", level: "admin" },
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

    const evalIds =
      resolve(
        canonicalBrain,
        {},
        {
          bundles: ["core"],
          mode: "eval",
        },
      ).plugins?.map((plugin) => plugin.id) ?? [];
    expect(evalIds).not.toContain("dashboard");
    expect(evalIds).not.toContain("mcp");
    expect(evalIds).not.toContain("web-chat");
    expect(evalIds).not.toContain("discord");
  });
});
