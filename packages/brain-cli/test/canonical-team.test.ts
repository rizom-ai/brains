import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import relay from "@brains/relay";
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
import { parseYamlDocument } from "@brains/utils/yaml";
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

const teamMembers = [
  "image",
  "note",
  "link",
  "topics",
  "decks",
  "mcp",
  "discord",
  "conversation-memory",
  "docs",
];
const trustedEntityTypes = [
  "note",
  "link",
  "image",
  "doc",
  "deck",
  "decision",
  "action-item",
];
const teamCoreAdditions = [
  "image",
  "document",
  "wishlist",
  "decks",
  "atproto-registry",
  "playbook",
  "playbooks",
  "rover-onboarding",
  "docs",
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

function pluginIds(resolved: AppConfig): string[] {
  return (resolved.plugins ?? []).map((plugin) => plugin.id);
}

function withoutBrain(
  overrides: InstanceOverrides,
): Omit<InstanceOverrides, "brain"> {
  const { brain, ...runtimeOverrides } = overrides;
  void brain;
  return runtimeOverrides;
}

function canonicalTeamOverrides(
  extra: Partial<InstanceOverrides> = {},
): Omit<InstanceOverrides, "brain"> {
  const base = withoutBrain(effectiveFixtureOverrides);
  return {
    ...base,
    ...extra,
    site: extra.site ?? base.site,
    plugins: {
      ...base.plugins,
      ...extra.plugins,
    },
  };
}

function parseFixture<T>(path: string): T {
  const parsed = parseYamlDocument(readFileSync(path, "utf8"));
  if (!parsed.ok) {
    throw new Error(`Invalid fixture ${path}: ${parsed.error}`);
  }
  return parsed.data as T;
}

function permissionRuleLevel(
  resolved: AppConfig,
  pattern: string,
): string | undefined {
  return resolved.permissions?.rules?.find((rule) => rule.pattern === pattern)
    ?.level;
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

function migratedTestAppOverrides(
  testApp: "core" | "default" | "docs" | "full",
): Omit<InstanceOverrides, "brain"> {
  const parsed = parseInstanceOverrides(
    readFileSync(
      join(
        import.meta.dir,
        "../../../brains/relay/test-apps",
        testApp,
        "brain.yaml",
      ),
      "utf8",
    ),
  );
  const { brain, preset, ...instance } = parsed;
  void brain;
  const withSite = preset !== "core";
  const fixture = withoutBrain(effectiveFixtureOverrides);

  return {
    ...instance,
    bundles: withSite ? ["core", "site", "team"] : ["core", "team"],
    ...(withSite ? { site: fixture.site } : {}),
    plugins: {
      ...(withSite ? fixture.plugins : {}),
      ...instance.plugins,
    },
  };
}

describe("canonical team bundle", () => {
  test("defines the fixed team posture in canonical definition order", () => {
    expect(canonicalBrain.bundles).toEqual([
      coreBundle,
      siteBundle,
      publishingBundle,
      teamBundle,
    ]);
    expect(teamBundle.members).toEqual(teamMembers);
  });

  test("parses an instance-owned team fixture without registering the canonical brain", () => {
    expect(fixtureOverrides).toMatchObject({
      brain: "brain",
      anchor: "team",
      bundles: ["team", "site", "core"],
      site: {
        package: "@brains/site-default",
        theme: "@brains/theme-rizom",
      },
      plugins: {
        "directory-sync": {
          seedContentPath: "./seed-content",
          initialSync: true,
        },
      },
    });
    expect(
      effectiveFixtureOverrides.plugins?.["site-content"]?.["definitions"],
    ).toBe("@brains/local-site-content");
  });

  test("composes shared memory, topic capture, docs, and Discord config", () => {
    const canonical = resolve(
      canonicalBrain,
      {},
      canonicalTeamOverrides({
        plugins: { discord: { botToken: "test-token" } },
      }),
    );
    const legacy = resolve(
      relay,
      {},
      {
        preset: "full",
        plugins: { discord: { botToken: "test-token" } },
      },
    );

    for (const id of ["topics", "conversation-memory", "discord"]) {
      expect(configFor(canonical, id)?.config).toEqual(
        configFor(legacy, id)?.config,
      );
    }
    expect(configFor(canonical, "conversation-memory")?.config).toMatchObject({
      memoryVisibility: "shared",
    });
    expect(configFor(canonical, "topics")?.config).toMatchObject({
      extractableStatuses: ["published", "draft"],
    });
    expect(configFor(canonical, "discord")?.config).toMatchObject({
      captureUrls: true,
    });
    expect(configFor(canonical, "site-content")?.config).toMatchObject({
      definitions: {
        namespace: "team-site",
        sections: { overview: expect.any(Object) },
      },
    });
    expect(configFor(canonical, "directory-sync")?.config).toMatchObject({
      seedContentPath: "./seed-content",
    });
    expect(pluginIds(canonical)).toContain("docs");
  });

  test("keeps team instructions model-neutral and non-publishing by default", () => {
    const canonical = resolve(canonicalBrain, {}, canonicalTeamOverrides());
    const instructions = canonical.agentInstructions ?? [];
    const text = instructions.join("\n");

    expect(instructions).toEqual(teamBundle.agentInstructions ?? []);
    expect(text).toContain("collaborative team-memory");
    expect(text).toContain("personal publishing");
    expect(text).not.toMatch(/\bRover\b|\bRelay\b/);
    expect(pluginIds(canonical)).not.toContain("blog");
    expect(pluginIds(canonical)).not.toContain("newsletter");
    expect(pluginIds(canonical)).not.toContain("atproto");
  });

  test("composes publishing and team instructions without selection-order drift", () => {
    const combined = resolve(
      canonicalBrain,
      {},
      canonicalTeamOverrides({
        bundles: ["team", "publishing", "core", "site"],
      }),
    );

    expect(combined.agentInstructions).toEqual([
      ...(publishingBundle.agentInstructions ?? []),
      ...(teamBundle.agentInstructions ?? []),
    ]);
  });

  test("adds trusted team writes while retaining admin extract, publish, and delete", () => {
    const canonical = resolve(canonicalBrain, {}, canonicalTeamOverrides());

    expectTrustedTeamPolicy(canonical);
    expect(permissionRuleLevel(canonical, "mcp:http")).toBe("admin");
    expect(permissionRuleLevel(canonical, "discord:*")).toBe("public");
    expect(permissionRuleLevel(canonical, "web-chat:*")).toBe("admin");
  });

  test("removal closes member-scoped team permission contributions", () => {
    const removed = resolve(
      canonicalBrain,
      {},
      canonicalTeamOverrides({
        remove: ["note", "image", "docs", "conversation-memory", "mcp"],
      }),
    );
    const policy = removed.permissions?.entityActions;

    expect(policy?.["note"]).toBeUndefined();
    expect(policy?.["image"]).toBeUndefined();
    expect(policy?.["doc"]).toBeUndefined();
    expect(policy?.["decision"]).toBeUndefined();
    expect(policy?.["action-item"]).toBeUndefined();
    expect(permissionRuleLevel(removed, "mcp:http")).toBeUndefined();
  });

  test("keeps personal and team posture contributions isolated", () => {
    const personal = resolve(
      canonicalBrain,
      {},
      {
        bundles: ["core", "site", "publishing"],
      },
    );
    const team = resolve(canonicalBrain, {}, canonicalTeamOverrides());

    expect(pluginIds(personal)).not.toContain("conversation-memory");
    expect(pluginIds(personal)).not.toContain("docs");
    expect(personal.permissions?.entityActions?.["note"]).toBeUndefined();
    expect((personal.agentInstructions ?? []).join("\n")).not.toContain(
      "team-memory",
    );

    expect(pluginIds(team)).not.toContain("blog");
    expect((team.agentInstructions ?? []).join("\n")).not.toContain(
      "publishing capabilities",
    );
  });

  test("characterizes the visible Relay core migration", () => {
    const legacy = resolve(relay, {}, { preset: "core" });
    const canonical = resolve(
      canonicalBrain,
      {},
      canonicalTeamOverrides({ bundles: ["core", "team"] }),
    );
    const legacyIds = new Set(pluginIds(legacy));

    expect(pluginIds(canonical).filter((id) => !legacyIds.has(id))).toEqual(
      teamCoreAdditions,
    );
    expect(
      pluginIds(legacy).filter((id) => !pluginIds(canonical).includes(id)),
    ).toEqual([]);
    for (const id of ["topics", "conversation-memory", "discord"]) {
      expect(configFor(canonical, id)?.config).toEqual(
        configFor(legacy, id)?.config,
      );
    }
    expect(permissionRuleLevel(canonical, "mcp:http")).toBe("admin");
    expectTrustedTeamPolicy(canonical);
  });

  test("keeps permission, attribution, and approval-hijack fixtures structurally runnable", () => {
    const relayPermissionFixtures = [
      "admin-singleton-delete-refused",
      "public-peer-call-denied",
      "public-save-note-denied",
      "shared-team-memory-search",
      "trusted-derived-summary-denied",
      "trusted-save-team-note",
      "trusted-shared-agent-context",
    ];
    for (const id of relayPermissionFixtures) {
      const parsed = parseFixture<{ id: string }>(
        join(
          import.meta.dir,
          "../../../brains/relay/test-cases/permissions",
          `${id}.yaml`,
        ),
      );
      expect(parsed.id).toEndWith(id);
    }

    const approvalFixture = parseFixture<{
      id: string;
      turns: Array<{
        context: {
          userPermissionLevel: string;
          actor: { canonicalId: string };
        };
      }>;
    }>(
      join(
        import.meta.dir,
        "../../../brains/rover/test-cases/multi-turn/multi-user-approval-hijack-denied.yaml",
      ),
    );
    expect(approvalFixture.id).toBe("multi-user-approval-hijack-denied");
    expect(
      approvalFixture.turns.map((turn) => [
        turn.context.userPermissionLevel,
        turn.context.actor.canonicalId,
      ]),
    ).toEqual([
      ["admin", "eval-admin-alice"],
      ["public", "eval-public-bob"],
      ["admin", "eval-admin-alice"],
    ]);

    const resolved = resolve(
      canonicalBrain,
      {},
      canonicalTeamOverrides({
        trusted: ["discord:trusted-team-member"],
        spaces: ["discord:shared-team-space"],
      }),
    );
    expect(resolved.permissions?.trusted).toContain(
      "discord:trusted-team-member",
    );
    expect(resolved.spaces).toContain("discord:shared-team-space");
    expect(resolved.permissions?.entityActions?.["note"]?.create).toBe(
      "trusted",
    );
    expect(resolved.permissions?.entityActions?.["summary"]).toBeUndefined();
  });

  test("resolves every migrated Relay test-app posture from one definition", () => {
    const expectedByApp = {
      core: { site: false, ecosystem: false },
      default: { site: true, ecosystem: true },
      docs: { site: true, ecosystem: false },
      full: { site: true, ecosystem: false },
    } as const;

    for (const [testApp, expected] of Object.entries(expectedByApp)) {
      const resolved = resolve(
        canonicalBrain,
        {},
        migratedTestAppOverrides(
          testApp as "core" | "default" | "docs" | "full",
        ),
      );
      const ids = pluginIds(resolved);

      expect(ids.includes("site-builder")).toBe(expected.site);
      expect(ids.includes("site-content")).toBe(expected.site);
      expect(ids.includes("rizom-ecosystem")).toBe(expected.ecosystem);
      expect(ids).toContain("conversation-memory");
      expect(ids).toContain("docs");
      expectTrustedTeamPolicy(resolved);
    }
  });
});
