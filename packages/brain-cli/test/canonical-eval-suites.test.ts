import { afterEach, describe, expect, test } from "bun:test";
import { App, resolve, resolveBundleSelection } from "@brains/app";
import {
  EvalHandlerRegistry,
  resolveEvalSelection,
  YAMLLoader,
  type EvalSelection,
  type SuccessCriteria,
  type TestCase,
} from "@brains/ai-evaluation";
import { internalFullScope } from "@brains/plugins";
import { parseYamlDocument } from "@brains/utils/yaml";
import { z } from "@brains/utils/zod";
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
import { canonicalBundles } from "../src/model/canonical-bundles";
import { canonicalBrain } from "../src/model/canonical-brain";

const manifestPath = join(import.meta.dir, "..", "brain.eval.yaml");
const packageDirectory = join(import.meta.dir, "..");
const testCasesDirectory = join(packageDirectory, "test-cases");
// Loose: resolveEvalSelection reads manifest keys beyond the ones asserted here.
const manifestSchema = z.looseObject({
  plugins: z.record(z.string(), z.record(z.string(), z.unknown())),
  bundleContract: z.string(),
  anchor: z.enum(["person", "team", "organization"]),
  kind: z.string(),
  suites: z.record(z.string(), z.unknown()),
});

const manifestResult = parseYamlDocument(
  readFileSync(manifestPath, "utf8"),
  manifestSchema,
);
if (!manifestResult.ok) {
  throw new Error(`invalid brain.eval.yaml: ${manifestResult.error}`);
}
const rawManifest = manifestResult.data;
const suiteNames = ["headless", "personal", "professional", "team"] as const;
type SuiteName = (typeof suiteNames)[number];

const catalogIds = [
  ...canonicalBrain.capabilities.map(([id]) => id),
  ...canonicalBrain.interfaces.map(([id]) => id),
];
const expectedMembers: Record<SuiteName, string> = {
  headless:
    "a2a agents directory-sync link mcp note profile prompt style-guide topics unified-inbox",
  personal:
    "a2a admin agents auth-service chat conversation-memory dashboard directory-sync document email image link mcp note notifications profile prompt studio style-guide topics unified-inbox web-chat webserver",
  professional:
    "a2a admin agents analytics atproto atproto-registry auth-service blog chat content-pipeline conversation-memory dashboard decks directory-sync document email image link mcp newsletter note notifications onboarding playbook playbooks portfolio profile prompt series site-builder site-content site-info social-media stock-photo studio style-guide topics unified-inbox web-chat webserver",
  team: "a2a admin agents analytics auth-service chat conversation-memory dashboard directory-sync docs document email image link mcp note notifications onboarding playbook playbooks profile prompt site-builder site-content site-info studio style-guide topics unified-inbox web-chat webserver",
};
const expectedCaseCounts: Record<SuiteName, number> = {
  headless: 17,
  personal: 20,
  professional: 85,
  team: 38,
};
const tempDirectories: string[] = [];

function suiteSelection(name: SuiteName): EvalSelection {
  return resolveEvalSelection(rawManifest, { suite: name });
}

function seedContentPath(selection: EvalSelection): string {
  const value = selection.plugins?.["directory-sync"]?.["seedContentPath"];
  if (typeof value !== "string") {
    throw new Error(
      "Canonical eval suite has no directory-sync seedContentPath",
    );
  }
  return resolvePath(packageDirectory, value);
}

function createTempDirectory(name: string): string {
  const directory = mkdtempSync(
    join(tmpdir(), `brain-canonical-eval-${name}-`),
  );
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
): { app: App; evalHandlers: EvalHandlerRegistry } {
  const directory = createTempDirectory(name);
  const basePlugins = rawManifest.plugins;
  const plugins = {
    ...basePlugins,
    ...(selection.plugins ?? {}),
    "directory-sync": {
      ...(basePlugins["directory-sync"] ?? {}),
      ...(selection.plugins?.["directory-sync"] ?? {}),
      seedContent: true,
      seedContentPath: seedDirectory,
      strictSeedEntityTypes: true,
      initialSync: true,
      autoSync: false,
      deleteOnFileRemoval: false,
    },
  };
  const evalHandlers = EvalHandlerRegistry.createFresh();
  const resolved = resolve(
    canonicalBrain,
    { AI_API_KEY: "placeholder-canonical-eval-test" },
    {
      bundleContract: rawManifest.bundleContract,
      anchor: selection.anchor ?? rawManifest.anchor,
      kind: selection.kind ?? rawManifest.kind,
      bundles: selection.bundles,
      ...(selection.add ? { add: selection.add } : {}),
      ...(selection.remove ? { remove: selection.remove } : {}),
      mode: "eval",
      plugins,
    },
  );

  return {
    app: App.create({
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
        evalHandlerRegistry: evalHandlers,
      },
    }),
    evalHandlers,
  };
}

function allCriteria(testCase: TestCase): SuccessCriteria[] {
  if (testCase.type === "plugin") return [];
  return [
    testCase.successCriteria,
    ...testCase.turns.flatMap((turn) =>
      turn.successCriteria ? [turn.successCriteria] : [],
    ),
    ...Object.values(testCase.permissions ?? {}).filter(
      (criteria): criteria is SuccessCriteria => criteria !== undefined,
    ),
  ];
}

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("canonical eval recipe ladder", () => {
  test("stages the explicit suite names, selections, and inheritance chain", () => {
    expect(Object.keys(rawManifest.suites)).toEqual([...suiteNames]);
    expect(suiteSelection("headless")).toMatchObject({
      bundles: ["core"],
      tags: ["recipe-headless"],
    });
    expect(suiteSelection("personal")).toMatchObject({
      bundles: ["core", "media", "web", "chat"],
      tags: ["recipe-personal"],
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
      tags: ["recipe-professional"],
    });
    expect(suiteSelection("team")).toMatchObject({
      anchor: "team",
      kind: "team",
      bundles: ["core", "media", "automation", "web", "chat", "site", "team"],
      add: ["docs"],
      tags: ["recipe-team"],
    });
  });

  test("keeps Git disabled for in-process eval boot", () => {
    expect(rawManifest.plugins["directory-sync"]?.["git"]).toBeUndefined();
  });

  test("resolves every suite to its exact canonical member set", () => {
    for (const name of suiteNames) {
      const selection = suiteSelection(name);
      const resolution = resolveBundleSelection({
        catalogIds,
        definitions: canonicalBundles,
        selected: selection.bundles ?? [],
        ...(selection.add ? { add: selection.add } : {}),
        ...(selection.remove ? { remove: selection.remove } : {}),
      });
      expect([...resolution.activeMembers].sort().join(" ")).toBe(
        expectedMembers[name],
      );
    }
  });

  test("boots every categorized suite with compatible cases and imported fixtures", async () => {
    const testCases = await YAMLLoader.createFresh({
      directory: testCasesDirectory,
      recursive: true,
    }).loadTestCases();
    expect(testCases.length).toBe(194);
    for (const testCase of testCases) {
      expect(
        testCase.tags?.filter(
          (tag) => tag.startsWith("recipe-") || tag.startsWith("requires-"),
        ),
      ).toHaveLength(1);
      expect(
        testCase.tags?.some((tag) => tag.startsWith("posture-")) ?? false,
      ).toBe(false);
    }

    for (const name of suiteNames) {
      const selection = suiteSelection(name);
      const seedDirectory = seedContentPath(selection);
      const { app, evalHandlers } = createSuiteApp(
        name,
        selection,
        seedDirectory,
      );
      try {
        await app.initialize();
        const shell = app.getShell();
        const entityService = shell.getEntityService();
        for (const entityType of seededEntityTypes(seedDirectory)) {
          expect(entityService.hasEntityType(entityType)).toBe(true);
          const imported = await entityService.listEntities({
            entityType,
            options: {
              filter: {
                visibilityScope: internalFullScope(
                  "canonical eval fixture import verification",
                ),
              },
            },
          });
          expect(imported.length).toBeGreaterThan(0);
        }

        const selectedTags = new Set(selection.tags ?? []);
        const selectedCases = testCases.filter((testCase) =>
          testCase.tags?.some((tag) => selectedTags.has(tag)),
        );
        expect(selectedCases.length).toBe(expectedCaseCounts[name]);
        const availableTools = new Set(
          shell
            .getMCPService()
            .listAgentToolsForPermissionLevel("admin")
            .map((entry) => entry.tool.name),
        );

        for (const testCase of selectedCases) {
          expect(
            testCase.tags?.some((tag) => tag.startsWith("requires-")) ?? false,
          ).toBe(false);
          if (testCase.type === "plugin") {
            expect(evalHandlers.has(testCase.plugin, testCase.handler)).toBe(
              true,
            );
            continue;
          }

          for (const criteria of allCriteria(testCase)) {
            for (const expectedTool of criteria.expectedTools ?? []) {
              if (!expectedTool.shouldBeCalled) continue;
              expect(availableTools.has(expectedTool.toolName)).toBe(true);
              const entityType = expectedTool.argsContain?.["entityType"];
              if (typeof entityType === "string") {
                expect(entityService.hasEntityType(entityType)).toBe(true);
              }
            }
            for (const expectedAnyTool of criteria.expectedAnyTool ?? []) {
              if (!expectedAnyTool.shouldBeCalled) continue;
              expect(
                expectedAnyTool.toolNames.some((toolName) =>
                  availableTools.has(toolName),
                ),
              ).toBe(true);
            }
          }
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
    const { app } = createSuiteApp("headless", selection, seedDirectory);
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
