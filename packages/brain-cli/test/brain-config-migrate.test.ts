import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseInstanceOverrides, resolveBundleSelection } from "@brains/app";
import { parseArgs } from "../src/parse-args";
import { runCommand } from "../src/run-command";
import {
  previewBrainConfigMigration,
  type LegacyBrainModel,
} from "../src/lib/brain-config-migration";
import {
  expandBrainRecipe,
  type BrainRecipeName,
} from "../src/lib/brain-recipes";
import { canonicalBundles } from "../src/model/canonical-bundles";
import { canonicalBrain } from "../src/model/canonical-brain";

const temporaryDirectories: string[] = [];
const catalogIds = [
  ...canonicalBrain.capabilities.map(([id]) => id),
  ...canonicalBrain.interfaces.map(([id]) => id),
];
const legacyCoreMembers = [
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
const legacySiteMembers = [
  "dashboard",
  "site-info",
  "site-content",
  "site-builder",
  "analytics",
];
const legacyPublishingMembers = [
  "blog",
  "series",
  "portfolio",
  "content-pipeline",
  "social-media",
  "newsletter",
  "stock-photo",
  "atproto",
];
const legacyTeamMembers = [
  "image",
  "note",
  "link",
  "topics",
  "decks",
  "mcp",
  "chat",
  "conversation-memory",
  "docs",
];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

const recipeExpectations: Record<
  BrainRecipeName,
  ReturnType<typeof expandBrainRecipe>
> = {
  headless: {
    bundleContract: "capability-bundles-v1",
    bundles: ["core"],
  },
  personal: {
    bundleContract: "capability-bundles-v1",
    anchor: "person",
    kind: "professional",
    bundles: ["core", "media", "web", "chat"],
    plugins: {
      "directory-sync": { seedContentPath: "./seed-content" },
    },
  },
  professional: {
    bundleContract: "capability-bundles-v1",
    anchor: "person",
    kind: "professional",
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
    site: {
      package: "@brains/site-default",
      theme: "@rizom/theme-default",
    },
    plugins: {
      "directory-sync": { seedContentPath: "./seed-content" },
    },
  },
  team: {
    bundleContract: "capability-bundles-v1",
    anchor: "team",
    kind: "team",
    bundles: ["core", "media", "automation", "web", "chat", "site", "team"],
    add: ["docs"],
    site: {
      package: "@brains/site-default",
      theme: "@brains/theme-rizom",
    },
    plugins: {
      "directory-sync": { seedContentPath: "./seed-content" },
    },
  },
  commerce: {
    bundleContract: "capability-bundles-v1",
    anchor: "organization",
    kind: "organization",
    bundles: ["core", "media", "web", "site"],
    add: ["products"],
    site: {
      package: "@rizom/site-rizom",
      theme: "@brains/theme-rizom",
    },
    plugins: {
      "directory-sync": { seedContentPath: "./seed-content" },
    },
  },
};

function expectMigrationSelection(
  model: LegacyBrainModel,
  preset: string,
  expected: {
    bundles: string[];
    add?: string[];
    remove?: string[];
    anchor: "person" | "team" | "organization";
    kind: "professional" | "team" | "organization";
  },
): void {
  const result = previewBrainConfigMigration(
    `brain: ${model}\npreset: ${preset}\n`,
  );
  const parsed = parseInstanceOverrides(result.output);

  expect(result.changed).toBe(true);
  expect(result.source).toEqual({ model, preset });
  expect(parsed.brain).toBe("brain");
  expect(result.output).not.toMatch(/^preset:/m);
  expect(parsed.bundles).toEqual(expected.bundles);
  expect(parsed.add).toEqual(expected.add);
  expect(parsed.remove).toEqual(expected.remove);
  expect(parsed.anchor).toBe(expected.anchor);
  expect(parsed.kind).toBe(expected.kind);
  expect(parsed.plugins?.["directory-sync"]?.["seedContentPath"]).toBe(
    "./seed-content",
  );
}

describe("brain recipe preparation", () => {
  test("expands fixed recipes to explicit runtime selections", () => {
    for (const recipe of [
      "headless",
      "personal",
      "professional",
      "team",
      "commerce",
    ] as const) {
      expect(expandBrainRecipe(recipe)).toEqual(recipeExpectations[recipe]);
    }
  });

  test("returns isolated recipe values without activating brain init", () => {
    const first = expandBrainRecipe("personal");
    first.bundles?.reverse();
    if (first.plugins) {
      first.plugins["directory-sync"] = { seedContentPath: "changed" };
    }

    expect(expandBrainRecipe("personal")).toEqual(recipeExpectations.personal);
  });
});

describe("brain config migration preview", () => {
  test("maps every legacy model and preset to explicit canonical selection", () => {
    const professionalBundles = [
      "core",
      "media",
      "automation",
      "web",
      "chat",
      "site",
      "publishing",
      "federation",
    ];
    const teamBundles = [
      "core",
      "media",
      "automation",
      "web",
      "chat",
      "site",
      "team",
    ];

    expectMigrationSelection("rover", "core", {
      bundles: ["core"],
      anchor: "person",
      kind: "professional",
    });
    expectMigrationSelection("rover", "default", {
      bundles: professionalBundles,
      add: ["obsidian-vault"],
      remove: [
        "series",
        "portfolio",
        "content-pipeline",
        "social-media",
        "newsletter",
        "stock-photo",
      ],
      anchor: "person",
      kind: "professional",
    });
    expectMigrationSelection("rover", "full", {
      bundles: professionalBundles,
      add: ["obsidian-vault"],
      anchor: "person",
      kind: "professional",
    });
    expectMigrationSelection("relay", "core", {
      bundles: ["core", "media", "automation", "web", "chat", "team"],
      add: ["docs"],
      anchor: "team",
      kind: "team",
    });
    expectMigrationSelection("relay", "default", {
      bundles: teamBundles,
      add: ["docs"],
      anchor: "team",
      kind: "team",
    });
    expectMigrationSelection("relay", "full", {
      bundles: teamBundles,
      add: ["docs"],
      anchor: "team",
      kind: "team",
    });
    expectMigrationSelection("ranger", "default", {
      bundles: ["core", "media", "web", "site"],
      add: ["products"],
      anchor: "organization",
      kind: "organization",
    });
  });

  test("records every intentional member delta from the retired taxonomy", () => {
    const defaultPublishingRemovals = new Set([
      "series",
      "portfolio",
      "content-pipeline",
      "social-media",
      "newsletter",
      "stock-photo",
    ]);
    const cases: Array<{
      model: LegacyBrainModel;
      preset: string;
      legacyMembers: string[];
      added: string[];
      removed: string[];
    }> = [
      {
        model: "rover",
        preset: "core",
        legacyMembers: legacyCoreMembers,
        added: ["unified-inbox"],
        removed: [
          "account",
          "admin",
          "assessment",
          "atproto-registry",
          "auth-service",
          "chat",
          "cms",
          "dashboard",
          "decks",
          "document",
          "email",
          "image",
          "notifications",
          "onboarding",
          "playbook",
          "playbooks",
          "web-chat",
          "webserver",
          "wishlist",
        ],
      },
      ...(["default", "full"] as const).map((preset) => ({
        model: "rover" as const,
        preset,
        legacyMembers: [
          ...legacyCoreMembers,
          ...legacySiteMembers,
          ...legacyPublishingMembers.filter(
            (member) =>
              preset === "full" || !defaultPublishingRemovals.has(member),
          ),
          "obsidian-vault",
        ],
        added: ["conversation-memory", "unified-inbox"],
        removed: ["assessment", "wishlist"],
      })),
      ...(["core", "default", "full"] as const).map((preset) => ({
        model: "relay" as const,
        preset,
        legacyMembers: [
          ...legacyCoreMembers,
          ...(preset === "core" ? [] : legacySiteMembers),
          ...legacyTeamMembers,
        ],
        added: ["unified-inbox"],
        removed: ["assessment", "atproto-registry", "decks", "wishlist"],
      })),
      {
        model: "ranger",
        preset: "default",
        legacyMembers: [...legacyCoreMembers, ...legacySiteMembers, "products"],
        added: ["unified-inbox"],
        removed: [
          "assessment",
          "atproto-registry",
          "chat",
          "decks",
          "email",
          "notifications",
          "onboarding",
          "playbook",
          "playbooks",
          "web-chat",
          "wishlist",
        ],
      },
    ];

    for (const migrationCase of cases) {
      const migrated = parseInstanceOverrides(
        previewBrainConfigMigration(
          `brain: ${migrationCase.model}\npreset: ${migrationCase.preset}\n`,
        ).output,
      );
      const members = resolveBundleSelection({
        catalogIds,
        definitions: canonicalBundles,
        selected: migrated.bundles ?? [],
        ...(migrated.add ? { add: migrated.add } : {}),
        ...(migrated.remove ? { remove: migrated.remove } : {}),
      }).activeMembers;
      const legacyMembers = [...new Set(migrationCase.legacyMembers)];

      expect(
        members.filter((member) => !legacyMembers.includes(member)).sort(),
        `${migrationCase.model}/${migrationCase.preset} additions`,
      ).toEqual(migrationCase.added);
      expect(
        legacyMembers.filter((member) => !members.includes(member)).sort(),
        `${migrationCase.model}/${migrationCase.preset} removals`,
      ).toEqual(migrationCase.removed);
    }
  });

  test("preserves comments, overrides, and secret references", () => {
    const input = `# Keep this operator note
brain: rover # legacy model
preset: default # keep selection rationale
kind: professional
add:
  - docs
  - rover-onboarding
remove:
  - dashboard-root
site:
  theme: "@custom/theme"
plugins:
  discord:
    botToken: \${DISCORD_BOT_TOKEN}
    captureUrls: true
  email-resend:
    transport: resend
    apiKey: \${SETUP_EMAIL_API_KEY}
    from: \${SETUP_EMAIL_FROM}
  rover-onboarding:
    enabled: true
  directory-sync:
    git:
      repo: rizom-ai/example-content
      authToken: \${GIT_SYNC_TOKEN}
permissions:
  trusted:
    - "discord:123"
`;
    const result = previewBrainConfigMigration(input);
    const parsed = parseInstanceOverrides(result.output);

    expect(result.output).toContain("# Keep this operator note");
    expect(result.output).toContain("# legacy model");
    expect(result.output).toContain("# keep selection rationale");
    expect(result.output).toContain("${GIT_SYNC_TOKEN}");
    expect(result.output).toContain("${DISCORD_BOT_TOKEN}");
    expect(result.output).toContain("${SETUP_EMAIL_API_KEY}");
    expect(result.output).toContain("${SETUP_EMAIL_FROM}");
    expect(parsed.kind).toBe("professional");
    expect(parsed.add).toEqual(["docs", "onboarding", "obsidian-vault"]);
    expect(parsed.remove).toEqual([
      "dashboard",
      "series",
      "portfolio",
      "content-pipeline",
      "social-media",
      "newsletter",
      "stock-photo",
    ]);
    expect(parsed.site).toEqual({
      package: "@brains/site-default",
      theme: "@custom/theme",
    });
    expect(parsed.plugins?.["chat"]).toEqual({
      adapters: {
        discord: {
          captureUrls: true,
        },
      },
    });
    expect(parsed.plugins?.["discord"]).toBeUndefined();
    expect(parsed.plugins?.["email"]).toEqual({ transport: "resend" });
    expect(parsed.plugins?.["email-resend"]).toBeUndefined();
    expect(parsed.plugins?.["onboarding"]).toEqual({ enabled: true });
    expect(parsed.plugins?.["rover-onboarding"]).toBeUndefined();
    expect(parsed.plugins?.["directory-sync"]).toMatchObject({
      seedContentPath: "./seed-content",
      git: {
        repo: "rizom-ai/example-content",
      },
    });
    expect(parsed.permissions?.trusted).toEqual(["discord:123"]);
  });

  test("preserves explicit site, seed, add, and remove choices", () => {
    const result = previewBrainConfigMigration(`brain: relay
preset: full
add: [products]
remove: [analytics]
site:
  package: "@custom/team-site"
  theme: "@custom/team-theme"
plugins:
  directory-sync:
    seedContentPath: ./custom-seed
  site-content:
    definitions: "@custom/team-content"
`);
    const parsed = parseInstanceOverrides(result.output);

    expect(parsed.add).toEqual(["products", "docs"]);
    expect(parsed.remove).toEqual(["analytics"]);
    expect(parsed.site).toEqual({
      package: "@custom/team-site",
      theme: "@custom/team-theme",
    });
    expect(parsed.plugins?.["directory-sync"]?.["seedContentPath"]).toBe(
      "./custom-seed",
    );
    expect(parsed.plugins?.["site-content"]?.["definitions"]).toBe(
      "@custom/team-content",
    );
  });

  test("migrates canonical CMS selections and plugin config to Studio", () => {
    const input = `brain: brain
bundles: [core]
add:
  - cms # keep member note
  - studio
remove: [cms]
plugins:
  cms:
    routePath: /authoring
`;
    const result = previewBrainConfigMigration(input);
    const parsed = parseInstanceOverrides(result.output);

    expect(result.changed).toBe(true);
    expect(result.source).toEqual({ model: "brain", preset: undefined });
    expect(result.output).toContain("# keep member note");
    expect(parsed.add).toEqual(["studio"]);
    expect(parsed.remove).toEqual(["studio"]);
    expect(parsed.plugins?.["studio"]).toEqual({ routePath: "/authoring" });
    expect(parsed.plugins?.["cms"]).toBeUndefined();
  });

  test("moves the retired CMS route when the plugin key is already Studio", () => {
    const result = previewBrainConfigMigration(`brain: brain
bundles: [core]
plugins:
  studio:
    routePath: /cms # keep route note
`);
    const parsed = parseInstanceOverrides(result.output);

    expect(result.changed).toBe(true);
    expect(result.output).toContain("# keep route note");
    expect(parsed.plugins?.["studio"]).toEqual({ routePath: "/studio" });
  });

  test("rejects conflicting CMS and Studio plugin config", () => {
    expect(() =>
      previewBrainConfigMigration(`brain: brain
bundles: [core]
plugins:
  cms:
    routePath: /cms
  studio:
    routePath: /studio
`),
    ).toThrow(/plugins\.cms.*plugins\.studio.*different config/);
  });

  test("is deterministic and leaves canonical input byte-for-byte unchanged", () => {
    const migrated = previewBrainConfigMigration(
      "brain: '@brains/rover'\npreset: full\n",
    );
    const repeated = previewBrainConfigMigration(migrated.output);

    expect(repeated.changed).toBe(false);
    expect(repeated.output).toBe(migrated.output);

    const canonical = `# already migrated
brain: brain
bundleContract: capability-bundles-v1
bundles: [core]
`;
    expect(previewBrainConfigMigration(canonical)).toEqual({
      changed: false,
      output: canonical,
      source: { model: "brain", preset: undefined },
    });
  });

  test("requires an explicit recipe for overlapping canonical bundle ids", () => {
    const input = `brain: brain
kind: professional
bundles: [core, site, publishing]
add: [obsidian-vault]
plugins:
  directory-sync:
    git:
      repo: rizom-ai/example-content
`;

    expect(() => previewBrainConfigMigration(input)).toThrow(
      /explicitly reviewed --recipe/,
    );

    const result = previewBrainConfigMigration(input, {
      recipe: "professional",
    });
    const parsed = parseInstanceOverrides(result.output);
    expect(parsed.bundleContract).toBe("capability-bundles-v1");
    expect(parsed.bundles).toEqual([
      "core",
      "media",
      "automation",
      "web",
      "chat",
      "site",
      "publishing",
      "federation",
    ]);
    expect(parsed.add).toEqual(["obsidian-vault"]);
    expect(parsed.plugins?.["directory-sync"]?.["git"]).toEqual({
      repo: "rizom-ai/example-content",
    });
  });

  test("rejects unknown models, presets, and mixed canonical selection", () => {
    expect(() =>
      previewBrainConfigMigration("brain: custom\npreset: core\n"),
    ).toThrow('Unsupported legacy brain model "custom"');
    expect(() =>
      previewBrainConfigMigration("brain: rover\npreset: unusual\n"),
    ).toThrow('Unsupported rover preset "unusual"');
    expect(() =>
      previewBrainConfigMigration(
        "brain: rover\npreset: core\nbundles: [core]\n",
      ),
    ).toThrow(/preset.*bundles/i);
    expect(() =>
      previewBrainConfigMigration(`brain: rover
preset: core
plugins:
  rover-onboarding:
    enabled: true
  onboarding:
    enabled: false
`),
    ).toThrow(/already has different config/);
  });

  test("has no checked-in legacy instance configs after crossover", () => {
    const repositoryRoot = join(import.meta.dir, "../../..");
    const legacyConfigs = [
      ...new Bun.Glob("brains/**/brain.yaml").scanSync({
        cwd: repositoryRoot,
      }),
    ];
    expect(legacyConfigs).toEqual([]);
  });

  test("CLI command previews a reviewed canonical recipe without writing", async () => {
    const directory = mkdtempSync(join(tmpdir(), "brain-config-reclassify-"));
    temporaryDirectories.push(directory);
    const path = join(directory, "brain.yaml");
    const original = "brain: brain\nbundles: [core, site, publishing]\n";
    writeFileSync(path, original);

    const result = await runCommand(
      parseArgs(["config", "migrate", "--recipe", "professional"]),
      directory,
    );

    expect(result.success).toBe(true);
    expect(result.message).toContain("bundleContract: capability-bundles-v1");
    expect(result.message).toContain("  - federation");
    expect(readFileSync(path, "utf8")).toBe(original);
  });

  test("CLI command previews without writing brain.yaml", async () => {
    const directory = mkdtempSync(join(tmpdir(), "brain-config-migrate-"));
    temporaryDirectories.push(directory);
    const path = join(directory, "brain.yaml");
    const original = "brain: ranger\npreset: default\n";
    writeFileSync(path, original);

    const result = await runCommand(
      parseArgs(["config", "migrate"]),
      directory,
    );

    expect(result.success).toBe(true);
    expect(result.message).toContain("Preview only; no files were written");
    expect(result.message).toContain("bundles:");
    expect(readFileSync(path, "utf8")).toBe(original);
  });
});
