import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseInstanceOverrides } from "@brains/app";
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

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

const recipeExpectations: Record<
  BrainRecipeName,
  ReturnType<typeof expandBrainRecipe>
> = {
  minimal: {
    bundles: ["core"],
  },
  personal: {
    anchor: "person",
    bundles: ["core", "site", "publishing"],
    site: {
      package: "@brains/site-default",
      theme: "@rizom/theme-default",
    },
    plugins: {
      "directory-sync": { seedContentPath: "./seed-content" },
    },
  },
  team: {
    anchor: "team",
    bundles: ["core", "site", "team"],
    site: {
      package: "@brains/site-default",
      theme: "@brains/theme-rizom",
    },
    plugins: {
      "directory-sync": { seedContentPath: "./seed-content" },
    },
  },
  commerce: {
    anchor: "organization",
    bundles: ["core", "site"],
    add: ["products"],
    site: {
      package: "@rizom/site-rizom",
      theme: "@brains/theme-rizom",
    },
    plugins: {
      "directory-sync": { seedContentPath: "./seed-content" },
      discord: { captureUrls: true },
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
  expect(parsed.plugins?.["directory-sync"]?.["seedContentPath"]).toBe(
    "./seed-content",
  );
}

describe("brain recipe preparation", () => {
  test("expands fixed recipes to explicit runtime selections", () => {
    for (const recipe of ["minimal", "personal", "team", "commerce"] as const) {
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
    expectMigrationSelection("rover", "core", {
      bundles: ["core"],
      anchor: "person",
    });
    expectMigrationSelection("rover", "default", {
      bundles: ["core", "site", "publishing"],
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
    });
    expectMigrationSelection("rover", "full", {
      bundles: ["core", "site", "publishing"],
      add: ["obsidian-vault"],
      anchor: "person",
    });
    expectMigrationSelection("relay", "core", {
      bundles: ["core", "team"],
      anchor: "team",
    });
    expectMigrationSelection("relay", "default", {
      bundles: ["core", "site", "team"],
      anchor: "team",
    });
    expectMigrationSelection("relay", "full", {
      bundles: ["core", "site", "team"],
      anchor: "team",
    });
    expectMigrationSelection("ranger", "default", {
      bundles: ["core", "site"],
      add: ["products"],
      anchor: "organization",
    });
  });

  test("preserves comments, overrides, external packages, and secret references", () => {
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
  # Keep this external plugin note
  calendar:
    package: "@example/calendar" # Keep this package note
    config:
      apiKey: \${CALENDAR_API_KEY}
permissions:
  trusted:
    - "discord:123"
`;
    const result = previewBrainConfigMigration(input);
    const parsed = parseInstanceOverrides(result.output);

    expect(result.output).toContain("# Keep this operator note");
    expect(result.output).toContain("# legacy model");
    expect(result.output).toContain("# keep selection rationale");
    expect(result.output).toContain("# Keep this external plugin note");
    expect(result.output).toContain("# Keep this package note");
    expect(result.output).toContain("${GIT_SYNC_TOKEN}");
    expect(result.output).toContain("${SETUP_EMAIL_API_KEY}");
    expect(result.output).toContain("${SETUP_EMAIL_FROM}");
    expect(result.output).toContain("${CALENDAR_API_KEY}");
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
    expect(parsed.plugins?.["calendar"]).toMatchObject({
      package: "@example/calendar",
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

    expect(parsed.add).toEqual(["products"]);
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

  test("is deterministic and leaves canonical input byte-for-byte unchanged", () => {
    const migrated = previewBrainConfigMigration(
      "brain: '@brains/rover'\npreset: full\n",
    );
    const repeated = previewBrainConfigMigration(migrated.output);

    expect(repeated.changed).toBe(false);
    expect(repeated.output).toBe(migrated.output);

    const canonical = `# already migrated
brain: brain
bundles: [core]
`;
    expect(previewBrainConfigMigration(canonical)).toEqual({
      changed: false,
      output: canonical,
      source: { model: "brain", preset: undefined },
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
