import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolve, type BrainDefinition } from "@brains/app";
import { canonicalBrain, coreBundle } from "../src/model/canonical-brain";
import { isRecord } from "@brains/utils/is-record";
import { openAiGuestPricing } from "@brains/ai-service";

const expectedCatalogIds = [
  "prompt",
  "conflict",
  "profile",
  "style-guide",
  "ask-content",
  "image",
  "document",
  "note",
  "refined-note",
  "link",
  "references",
  "wishlist",
  "topics",
  "decks",
  "directory-sync",
  "atproto-registry",
  "agents",
  "assessment",
  "auth-service",
  "notifications",
  "contact",
  "quiz",
  "playbooks",
  "onboarding",
  "studio",
  "dashboard",
  "admin",
  "site-info",
  "site-content",
  "site-builder",
  "form",
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
  "action-board",
  "faq",
  "docs",
  "guides",
  "book",
  "email-workflows",
  "unified-inbox",
  "linkedin-import",
  "oauth-broker",
  "webdav",
  "mcp",
  "email",
  "web-chat",
  "chat",
  "a2a",
];

const bundleContract = "capability-bundles-v1" as const;

const expectedCoreMembers = [
  "profile",
  "prompt",
  "conflict",
  "style-guide",
  "directory-sync",
  "note",
  "refined-note",
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
  test("defaults to GPT-6 Luna at low reasoning, priced for guest turns", () => {
    expect(canonicalBrain.model).toBe("gpt-6-luna");
    expect(canonicalBrain.reasoningEffort).toBe("low");
    // An unpriced default would charge every guest turn the answer cap.
    expect(openAiGuestPricing(canonicalBrain.model)).toBeDefined();
  });

  test("owns one complete model-neutral catalog", () => {
    expect(catalogIds(canonicalBrain)).toEqual(expectedCatalogIds);
    expect(new Set(expectedCatalogIds).size).toBe(expectedCatalogIds.length);
    expect(canonicalBrain.bundles?.[0]).toEqual(coreBundle);
    expect(canonicalBrain.site).toBeUndefined();
    expect(canonicalBrain.theme).toBeUndefined();
    expect(canonicalBrain.agentInstructions).toBeUndefined();
  });

  test("offers guides only through explicit addition, as it offers docs", () => {
    expect(
      canonicalBrain.bundles?.some((bundle) =>
        bundle.members.some((member) => member === "guides"),
      ),
    ).toBe(false);
    const ids = (add: string[]): string[] =>
      (
        resolve(canonicalBrain, {}, { bundleContract, bundles: ["core"], add })
          .plugins ?? []
      ).map((plugin) => plugin.id);

    expect(ids([])).not.toContain("guides");
    expect(ids(["docs", "guides"])).toEqual(
      expect.arrayContaining(["docs", "guides"]),
    );
  });

  test("offers contact only through explicit addition, with intake still default-off", () => {
    expect(
      canonicalBrain.bundles?.some((bundle) =>
        bundle.members.includes("contact"),
      ),
    ).toBe(false);
    const plugins =
      resolve(
        canonicalBrain,
        {},
        { bundleContract, bundles: ["core"], add: ["contact"] },
      ).plugins ?? [];
    expect(plugins.map((plugin) => plugin.id)).toContain("contact-request");
    const contact = plugins.find((plugin) => plugin.id === "contact");
    expect(contact).toBeDefined();
    if (
      contact &&
      "getWebRoutes" in contact &&
      typeof contact.getWebRoutes === "function"
    )
      expect(contact.getWebRoutes()).toEqual([]);
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
    expect(pluginConfig("mcp")).toMatchObject({ transport: "stdio" });
    expect(pluginConfig("profile")).not.toHaveProperty(
      "starterIdentity.anchorKind",
    );

    const headless = resolve(
      canonicalBrain,
      {},
      { bundleContract, bundles: ["core"] },
    );
    const resolvedIds = headless.plugins?.map((plugin) => plugin.id) ?? [];
    expect(resolvedIds).toEqual([
      "prompt",
      // The conflict type installs apart from the service that keeps conflicts.
      "conflict",
      "conflicts",
      "profile",
      "style-guide",
      "note",
      "refined-note",
      "link",
      // The topics service installs its topic type as itself, first.
      "topic",
      "topics",
      // The knowledge map comes with topics.
      "knowledge-map",
      "directory-sync",
      // The agent and skill types install apart from their services.
      "agent-entity",
      "agent-discovery",
      "agent",
      "skill-entity",
      "skill",
      // What peers share with this brain is kept as its own type.
      "shared-copy",
      "shared-copies",
      "unified-inbox",
      "mcp",
      "a2a",
    ]);
    expect(resolvedIds).toContain("unified-inbox");
    expect(headless.http.enabled).toBe(false);
    expect(resolvedIds).not.toContain("notifications");
  });

  test("serves the drive with the web bundle, which signs people in", () => {
    const ids = (bundles: string[]): string[] =>
      (
        resolve(canonicalBrain, {}, { bundleContract, bundles }).plugins ?? []
      ).map((plugin) => plugin.id);

    // A headless brain has no HTTP listener and no app passwords to admit.
    expect(ids(["core"])).not.toContain("webdav");
    expect(ids(["core", "web"])).toEqual(
      expect.arrayContaining(["auth-service", "webdav"]),
    );
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
