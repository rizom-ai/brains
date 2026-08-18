import { afterEach, describe, expect, test } from "bun:test";
import {
  App,
  resolve,
  resolveBundleSelection,
  type BrainDefinition,
} from "@brains/app";
import {
  resolveEvalSelection,
  type EvalSelection,
} from "@brains/ai-evaluation";
import { fromYaml } from "@brains/utils/yaml";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve as resolvePath } from "node:path";
import { canonicalBrain } from "../src/model/canonical-brain";
import { targetCanonicalBundles } from "../src/model/target-bundles";

const manifestPath = join(import.meta.dir, "..", "brain.target.eval.yaml");
const packageDirectory = join(import.meta.dir, "..");
const rawManifest = fromYaml<Record<string, unknown>>(
  readFileSync(manifestPath, "utf8"),
);
const suiteNames = [
  "headless",
  "personal",
  "professional",
  "team",
  "commerce",
] as const;
type SuiteName = (typeof suiteNames)[number];

const targetBrain: BrainDefinition = {
  ...canonicalBrain,
  bundles: targetCanonicalBundles,
};
const catalogIds = [
  ...targetBrain.capabilities.map(([id]) => id),
  ...targetBrain.interfaces.map(([id]) => id),
];
const expectedMembers: Record<SuiteName, string> = {
  headless:
    "a2a agents directory-sync link mcp note profile prompt style-guide topics unified-inbox",
  personal:
    "a2a account admin agents auth-service chat cms conversation-memory dashboard directory-sync document email image link mcp note notifications profile prompt style-guide topics unified-inbox web-chat webserver",
  professional:
    "a2a account admin agents analytics atproto atproto-registry auth-service blog chat cms content-pipeline conversation-memory dashboard decks directory-sync document email image link mcp newsletter note notifications onboarding playbook playbooks portfolio profile prompt series site-builder site-content site-info social-media stock-photo style-guide topics unified-inbox web-chat webserver",
  team: "a2a account admin agents analytics auth-service chat cms conversation-memory dashboard directory-sync docs document email image link mcp note notifications onboarding playbook playbooks profile prompt site-builder site-content site-info style-guide topics unified-inbox web-chat webserver",
  commerce:
    "a2a account admin agents analytics auth-service cms dashboard directory-sync document image link mcp note products profile prompt site-builder site-content site-info style-guide topics unified-inbox webserver",
};
const tempDirectories: string[] = [];

function suiteSelection(name: SuiteName): EvalSelection {
  return resolveEvalSelection(rawManifest, { suite: name });
}

function seedContentPath(selection: EvalSelection): string {
  const value = selection.plugins?.["directory-sync"]?.["seedContentPath"];
  if (typeof value !== "string") {
    throw new Error("Target eval suite has no directory-sync seedContentPath");
  }
  return resolvePath(packageDirectory, value);
}

function createTempDirectory(name: string): string {
  const directory = mkdtempSync(join(tmpdir(), `brain-target-eval-${name}-`));
  tempDirectories.push(directory);
  return directory;
}

function seededEntityTypes(seedDirectory: string): string[] {
  const entries = readdirSync(seedDirectory, { withFileTypes: true });
  const types = entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => entry.name);
  if (entries.some((entry) => entry.isFile() && entry.name.endsWith(".md"))) {
    types.push("note");
  }
  return [...new Set(types)].sort();
}

function createSuiteApp(
  name: SuiteName,
  selection: EvalSelection,
  seedDirectory: string,
): App {
  const directory = createTempDirectory(name);
  const plugins = {
    ...(selection.plugins ?? {}),
    "directory-sync": {
      ...(selection.plugins?.["directory-sync"] ?? {}),
      seedContent: true,
      seedContentPath: seedDirectory,
      strictSeedEntityTypes: true,
      initialSync: true,
      autoSync: false,
      deleteOnFileRemoval: false,
    },
  };
  const resolved = resolve(
    targetBrain,
    { AI_API_KEY: "placeholder-target-eval-test" },
    {
      anchor:
        selection.anchor ??
        (rawManifest["anchor"] as "person" | "team" | "organization"),
      kind: selection.kind ?? String(rawManifest["kind"]),
      bundles: selection.bundles,
      ...(selection.add ? { add: selection.add } : {}),
      ...(selection.remove ? { remove: selection.remove } : {}),
      mode: "eval",
      plugins,
    },
  );

  return App.create({
    ...resolved,
    database: undefined,
    shellConfig: {
      ...resolved.shellConfig,
      database: { url: `file:${join(directory, "brain.db")}` },
      jobQueueDatabase: { url: `file:${join(directory, "jobs.db")}` },
      conversationDatabase: {
        url: `file:${join(directory, "conversation.db")}`,
      },
      embeddingDatabase: { url: `file:${join(directory, "embeddings.db")}` },
      runtimeStateDatabase: {
        url: `file:${join(directory, "runtime-state.db")}`,
      },
      dataDir: join(directory, "brain-data"),
    },
  });
}

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("target eval recipe ladder", () => {
  test("stages the explicit suite names, selections, and inheritance chain", () => {
    expect(Object.keys(rawManifest["suites"] as object)).toEqual([
      ...suiteNames,
    ]);
    expect(suiteSelection("headless")).toMatchObject({
      bundles: ["core"],
      tags: ["recipe-headless"],
    });
    expect(suiteSelection("personal")).toMatchObject({
      bundles: ["core", "media", "web", "chat"],
      tags: ["recipe-headless", "recipe-personal"],
    });
    expect(suiteSelection("professional")).toMatchObject({
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
      tags: [
        "recipe-headless",
        "recipe-personal",
        "posture-personal",
        "posture-publishing",
      ],
    });
    expect(suiteSelection("team")).toMatchObject({
      anchor: "team",
      kind: "team",
      bundles: ["core", "media", "automation", "web", "chat", "site", "team"],
      add: ["docs"],
      tags: ["recipe-headless", "recipe-personal", "recipe-team"],
    });
    expect(suiteSelection("commerce")).toMatchObject({
      anchor: "organization",
      kind: "organization",
      bundles: ["core", "media", "web", "site"],
      add: ["products"],
      tags: ["recipe-headless", "recipe-personal", "recipe-commerce"],
    });
  });

  test("resolves every suite to its exact target member set", () => {
    for (const name of suiteNames) {
      const selection = suiteSelection(name);
      const resolution = resolveBundleSelection({
        catalogIds,
        definitions: targetCanonicalBundles,
        selected: selection.bundles ?? [],
        ...(selection.add ? { add: selection.add } : {}),
        ...(selection.remove ? { remove: selection.remove } : {}),
      });
      expect([...resolution.activeMembers].sort().join(" ")).toBe(
        expectedMembers[name],
      );
    }
  });

  test("boots every suite and registers every entity type in its seed content", async () => {
    for (const name of suiteNames) {
      const selection = suiteSelection(name);
      const seedDirectory = seedContentPath(selection);
      const app = createSuiteApp(name, selection, seedDirectory);
      try {
        await app.initialize();
        const entityService = app.getShell().getEntityService();
        for (const entityType of seededEntityTypes(seedDirectory)) {
          expect(entityService.hasEntityType(entityType)).toBe(true);
        }
      } finally {
        await app.stop();
      }
    }
  }, 120_000);

  test("fails startup when a suite seeds an unregistered entity type", async () => {
    const seedDirectory = createTempDirectory("invalid-seed");
    mkdirSync(join(seedDirectory, "image"));
    writeFileSync(join(seedDirectory, "image", "not-in-core.md"), "# Image\n");
    const selection = suiteSelection("headless");
    const app = createSuiteApp("headless", selection, seedDirectory);
    let initializationError: unknown;
    try {
      await app.initialize();
    } catch (error) {
      initializationError = error;
    } finally {
      await app.stop();
    }
    expect(initializationError).toBeInstanceOf(Error);
    expect((initializationError as Error).message).toContain(
      "Seed content contains unregistered entity types: image",
    );
  }, 120_000);
});
