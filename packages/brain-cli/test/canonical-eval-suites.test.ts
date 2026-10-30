import { afterEach, describe, expect, test } from "bun:test";
import { App, resolveBundleSelection } from "@brains/app";
import { caughtError, waitUntil } from "@brains/test-utils";
import {
  EvalHandlerRegistry,
  resolveEvalSelection,
  resolveEvalConfig,
  YAMLLoader,
  type EvalSelection,
  type SuccessCriteria,
  type TestCase,
} from "@brains/ai-evaluation";
import { internalFullScope } from "@brains/plugins";
import { parseYamlDocument } from "@brains/utils/yaml";
import { computeContentHash } from "@brains/utils/hash";
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

const STARTUP_IMPORT_JOB = "directory-sync:directory-import";

/**
 * Boot, then let the queued startup import finish. The eval runner drains every
 * job, but here embedding and topic jobs call the AI provider with a
 * placeholder key: they only fail, and waiting on them ties these tests to
 * network latency and machine load. The assertions need the imported entities.
 */
async function initializeImported(app: App): Promise<void> {
  await app.initialize();
  const jobs = app.getShell().getJobQueueService();
  await waitUntil(
    async () =>
      (await jobs.getRecentJobs([STARTUP_IMPORT_JOB], 1)).length > 0 &&
      (await jobs.getActiveJobs([STARTUP_IMPORT_JOB])).length === 0,
    "the startup import to finish",
    { timeoutMs: 60_000, intervalMs: 50 },
  );
}
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
const suiteNames = [
  "headless",
  "personal",
  "professional",
  "providers",
  "team",
] as const;
type SuiteName = (typeof suiteNames)[number];

const catalogIds = [
  ...canonicalBrain.capabilities.map(([id]) => id),
  ...canonicalBrain.interfaces.map(([id]) => id),
];
const expectedMembers: Record<SuiteName, string> = {
  headless:
    "a2a agents directory-sync link mcp note profile prompt style-guide topics unified-inbox",
  personal:
    "a2a admin agents ask-content auth-service chat conversation-memory dashboard directory-sync document email faq image link mcp note notifications profile prompt studio style-guide topics unified-inbox web-chat webserver",
  professional:
    "a2a admin agents analytics ask-content atproto atproto-registry auth-service blog chat content-pipeline conversation-memory dashboard decks directory-sync document email faq image link mcp newsletter note notifications onboarding playbook playbooks portfolio profile prompt series site-builder site-content site-info social-media stock-photo studio style-guide topics unified-inbox web-chat webserver",
  providers:
    "a2a admin agents analytics ask-content atproto atproto-registry auth-service blog chat content-pipeline conversation-memory dashboard decks directory-sync document email faq image link mcp newsletter note notifications onboarding playbook playbooks portfolio profile prompt series site-builder site-content site-info social-media stock-photo studio style-guide topics unified-inbox web-chat webserver",
  team: "a2a action-board admin agents analytics ask-content auth-service chat conversation-memory dashboard directory-sync docs document email faq image link mcp note notifications onboarding playbook playbooks profile prompt site-builder site-content site-info studio style-guide topics unified-inbox web-chat webserver",
};
const expectedCaseCounts: Record<SuiteName, number> = {
  headless: 19,
  personal: 27,
  professional: 96,
  providers: 2,
  team: 37,
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
  includeMcp = false,
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
  const environment = { AI_API_KEY: "placeholder-canonical-eval-test" };
  const overrides = {
    bundleContract: rawManifest.bundleContract,
    anchor: selection.anchor ?? rawManifest.anchor,
    kind: selection.kind ?? rawManifest.kind,
    bundles: selection.bundles,
    ...(selection.add ? { add: selection.add } : {}),
    ...(selection.remove ? { remove: selection.remove } : {}),
    plugins,
  };
  const resolved = resolveEvalConfig(
    canonicalBrain,
    environment,
    { ...overrides, mode: "eval" },
    includeMcp,
  );
  if (includeMcp) {
    expect(resolved.plugins?.some(({ id }) => id === "webserver")).toBe(false);
    expect(
      resolved.plugins?.find(({ id }) => id === "mcp")?.getWebRoutes?.(),
    ).toEqual([]);
  }

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
    expect(suiteSelection("providers")).toMatchObject({
      bundles: suiteSelection("professional").bundles,
      tags: ["recipe-providers"],
      plugins: {
        newsletter: { provider: { type: "buttondown" } },
        "stock-photo": { apiKey: expect.any(String) },
      },
    });
    expect(suiteSelection("team")).toMatchObject({
      anchor: "team",
      kind: "team",
      bundles: ["core", "media", "automation", "web", "chat", "site", "team"],
      add: ["docs", "action-board"],
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
    expect(testCases.length).toBe(215);
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
        await initializeImported(app);
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

          if (
            testCase.tags?.includes("long-note-update") ||
            testCase.id === "mcp-long-note-update"
          ) {
            const entity = await entityService.getEntity({
              entityType: "note",
              id: testCase.id,
            });
            expect(entity?.content).toBe(
              readFileSync(join(seedDirectory, `${testCase.id}.md`), "utf8"),
            );
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

  test("the onboarding playbook's anchor-profile shape is a valid profile", async () => {
    // The playbook tells the model exactly which frontmatter to write; if that
    // shape and the profile schema drift apart, every onboarding save fails.
    const selection = suiteSelection("professional");
    const { app } = createSuiteApp(
      "professional",
      selection,
      seedContentPath(selection),
    );
    try {
      await initializeImported(app);
      const service = app.getShell().getEntityService();
      const playbookRequest = {
        entityType: "playbook",
        id: "onboarding",
        visibilityScope: internalFullScope("onboarding playbook shape check"),
      };
      // Onboarding seeds its playbook once startup content settles, after the
      // import job has finished.
      await waitUntil(
        async () => (await service.getEntity(playbookRequest)) !== null,
        "the onboarding playbook to be seeded",
        { timeoutMs: 60_000, intervalMs: 50 },
      );
      const playbook = await service.getEntity(playbookRequest);
      if (!playbook) throw new Error("Missing onboarding playbook");
      const instruction = playbook.content
        .split("\n")
        .find((line) =>
          line.includes("Use this exact frontmatter shape for anchor-profile"),
        );
      if (!instruction) throw new Error("Missing anchor-profile shape");
      const keys = [...instruction.matchAll(/`([a-z]+):(?: [^`]*)?`/g)].map(
        (match) => match[1] ?? "",
      );
      expect(keys).toContain("name");
      const markdown = [
        "---",
        ...keys.map((key) =>
          key === "expertise"
            ? "expertise:\n  - resilient software"
            : `${key}: sample`,
        ),
        "---",
        "",
      ].join("\n");
      const profile = await service.getEntity({
        entityType: "anchor-profile",
        id: "anchor-profile",
        visibilityScope: internalFullScope("onboarding playbook shape check"),
      });
      if (!profile) throw new Error("Missing anchor profile");
      // The same save system_update performs when the operator approves.
      await service.updateEntity({ entity: { ...profile, content: markdown } });
    } finally {
      await app.stop();
    }
  }, 120_000);

  test.each(["content", "edits"])(
    "persists a note title/body %s update exactly after approval",
    async (mode) => {
      const selection = suiteSelection("personal");
      const { app } = createSuiteApp(
        "personal",
        selection,
        seedContentPath(selection),
      );
      try {
        await initializeImported(app);
        const shell = app.getShell();
        const service = shell.getEntityService();
        const id = "long-note-update-title-and-body";
        const original = await service.getEntity({ entityType: "note", id });
        if (!original) throw new Error("Missing seeded note");
        const expected = original.content
          .replace("# Working Plan", "# Approved Plan")
          .replace("monthly.", "weekly.");
        const tool = shell
          .getMCPService()
          .listAgentToolsForPermissionLevel("admin")
          .find((entry) => entry.tool.name === "system_update")?.tool;
        if (!tool) throw new Error("Missing update tool");
        const context = {
          interfaceType: "mcp",
          userPermissionLevel: "admin",
          actor: { kind: "user", userId: "patch-regression" },
        } as const;
        const proposal = await tool.handler(
          {
            entityType: "note",
            id,
            operation:
              mode === "content"
                ? { kind: "content", content: expected }
                : {
                    kind: "edits",
                    edits: [
                      { oldText: "# Working Plan", newText: "# Approved Plan" },
                      {
                        oldText: "Review cadence: monthly.",
                        newText: "Review cadence: weekly.",
                      },
                    ],
                  },
          },
          context,
        );
        const approval = z
          .object({
            needsConfirmation: z.literal(true),
            args: z.record(z.string(), z.unknown()),
          })
          .parse(proposal);
        expect(
          (await service.getEntity({ entityType: "note", id }))?.content,
        ).toBe(original.content);
        expect(await tool.handler(approval.args, context)).toMatchObject({
          success: true,
        });
        const saved = await service.getEntity({ entityType: "note", id });
        expect(saved?.content).toBe(expected);
        expect(saved?.metadata["title"]).toBe("Approved Plan");
      } finally {
        await app.stop();
      }
    },
    120_000,
  );

  test("persists a 17 KB user-message source through the real note and conversation services", async () => {
    const selection = suiteSelection("personal");
    const { app } = createSuiteApp(
      "personal",
      selection,
      seedContentPath(selection),
    );
    const testCase = await YAMLLoader.createFresh({
      directory: testCasesDirectory,
    }).loadTestCase(
      join(testCasesDirectory, "personal/multi-turn/mcp-verbatim-create.yaml"),
    );
    if (testCase.type !== "multi_turn")
      throw new Error("Expected multi-turn eval");
    const request = testCase.turns[0]?.userMessage;
    if (!request) throw new Error("Missing source request");
    const startAfter = "BEGIN EXACT CONTENT";
    const endBefore = "END EXACT CONTENT";
    const content = request.slice(
      request.indexOf(`${startAfter}\n`) + startAfter.length + 1,
      request.lastIndexOf(endBefore),
    );
    expect(Buffer.byteLength(content)).toBe(17_000);
    try {
      await initializeImported(app);
      const shell = app.getShell();
      const conversations = shell.getConversationService();
      const conversationId = await conversations.startConversation({
        sessionId: "verbatim-create-regression",
        channelId: "verbatim-create-regression",
        interfaceType: "mcp",
        metadata: {
          channelName: "Verbatim create regression",
          interfaceType: "mcp",
          channelId: "verbatim-create-regression",
        },
      });
      await conversations.addMessage({
        conversationId,
        role: "user",
        content: request,
        metadata: { userPermissionLevel: "admin" },
      });
      const tool = shell
        .getMCPService()
        .listAgentToolsForPermissionLevel("admin")
        .find((entry) => entry.tool.name === "system_create")?.tool;
      if (!tool) throw new Error("Missing create tool");
      const context = {
        interfaceType: "mcp",
        userPermissionLevel: "admin",
        actor: { kind: "user", userId: "verbatim-create-regression" },
        conversationId,
      } as const;
      const proposal = await tool.handler(
        {
          entityType: "note",
          title: "MCP verbatim create",
          visibility: "restricted",
          source: {
            kind: "user-message",
            boundaryMode: "lines",
            startAfter,
            endBefore,
          },
        },
        context,
      );
      const approval = z
        .object({
          needsConfirmation: z.literal(true),
          args: z.record(z.string(), z.unknown()),
        })
        .parse(proposal);
      expect(approval.args).toMatchObject({
        source: { contentHash: computeContentHash(content) },
      });
      const entityRef = {
        entityType: "note",
        id: "mcp-verbatim-create",
        visibilityScope: internalFullScope(
          "verbatim creation persistence verification",
        ),
      };
      expect(await shell.getEntityService().getEntity(entityRef)).toBeNull();
      await conversations.addMessage({
        conversationId,
        role: "user",
        content: "Yes, save it.",
        metadata: { userPermissionLevel: "admin" },
      });
      expect(await tool.handler(approval.args, context)).toMatchObject({
        success: true,
      });
      const saved = await shell.getEntityService().getEntity(entityRef);
      expect(saved?.content).toBe(
        `---\nvisibility: restricted\n---\n${content}`,
      );
      expect(saved?.metadata["title"]).toBe("MCP verbatim create");
      expect(saved?.visibility).toBe("restricted");
    } finally {
      await app.stop();
    }
  }, 120_000);

  // Agents select the block either by its marker lines or by the literal
  // markers with their line breaks. The literal pair leaves out the block's
  // final line break, which the stored Markdown restores, so both store the
  // same document.
  test.each([
    [
      "line",
      {
        boundaryMode: "lines",
        startAfter: "BEGIN EXACT CONTENT",
        endBefore: "END EXACT CONTENT",
      },
    ],
    [
      "literal",
      { startAfter: "BEGIN EXACT CONTENT\n", endBefore: "\nEND EXACT CONTENT" },
    ],
  ] as const)(
    "replaces a note body from a user-message source under its stored frontmatter with %s boundaries",
    async (mode, boundaries) => {
      const selection = suiteSelection("personal");
      const { app } = createSuiteApp(
        "personal",
        selection,
        seedContentPath(selection),
      );
      const testCase = await YAMLLoader.createFresh({
        directory: testCasesDirectory,
      }).loadTestCase(
        join(
          testCasesDirectory,
          "personal/multi-turn/mcp-verbatim-update.yaml",
        ),
      );
      if (testCase.type !== "multi_turn")
        throw new Error("Expected multi-turn eval");
      const request = testCase.turns[0]?.userMessage;
      if (!request) throw new Error("Missing source request");
      const startAfter = "BEGIN EXACT CONTENT";
      const endBefore = "END EXACT CONTENT";
      const content = request.slice(
        request.indexOf(`${startAfter}\n`) + startAfter.length + 1,
        request.lastIndexOf(endBefore),
      );
      // Seeding stores canonical Markdown, without the fixture's blank line
      // after frontmatter.
      const original = readFileSync(
        join(
          packageDirectory,
          "eval-content/recipes/personal/mcp-verbatim-update.md",
        ),
        "utf8",
      ).replace("---\n\n", "---\n");
      try {
        await initializeImported(app);
        const shell = app.getShell();
        const conversations = shell.getConversationService();
        const conversationId = await conversations.startConversation({
          sessionId: "verbatim-update-regression",
          channelId: "verbatim-update-regression",
          interfaceType: "mcp",
          metadata: {
            channelName: "Verbatim update regression",
            interfaceType: "mcp",
            channelId: "verbatim-update-regression",
          },
        });
        await conversations.addMessage({
          conversationId,
          role: "user",
          content: request,
          metadata: { userPermissionLevel: "admin" },
        });
        const tool = shell
          .getMCPService()
          .listAgentToolsForPermissionLevel("admin")
          .find((entry) => entry.tool.name === "system_update")?.tool;
        if (!tool) throw new Error("Missing update tool");
        const context = {
          interfaceType: "mcp",
          userPermissionLevel: "admin",
          actor: { kind: "user", userId: "verbatim-update-regression" },
          conversationId,
        } as const;
        const entityRef = {
          entityType: "note",
          id: "mcp-verbatim-update",
          visibilityScope: internalFullScope(
            "verbatim update persistence verification",
          ),
        };
        expect(
          (await shell.getEntityService().getEntity(entityRef))?.content,
        ).toBe(original);
        const proposal = await tool.handler(
          {
            entityType: "note",
            id: "mcp-verbatim-update",
            operation: {
              kind: "source",
              source: {
                kind: "user-message",
                ...boundaries,
              },
            },
          },
          context,
        );
        const approval = z
          .object({
            needsConfirmation: z.literal(true),
            args: z.record(z.string(), z.unknown()),
          })
          .parse(proposal);
        expect(approval.args).toMatchObject({
          operation: {
            kind: "source",
            source: {
              contentHash: computeContentHash(
                mode === "line" ? content : content.replace(/\n$/, ""),
              ),
            },
          },
        });
        expect(approval.args).not.toHaveProperty(["operation", "content"]);
        await conversations.addMessage({
          conversationId,
          role: "user",
          content: "Yes, apply it.",
          metadata: { userPermissionLevel: "admin" },
        });
        expect(await tool.handler(approval.args, context)).toMatchObject({
          success: true,
        });
        const saved = await shell.getEntityService().getEntity(entityRef);
        expect(saved?.content).toBe(
          `---\nvisibility: restricted\n---\n${content}`,
        );
        expect(saved?.visibility).toBe("restricted");
      } finally {
        await app.stop();
      }
    },
    120_000,
  );

  test.each(["headless", "personal"] as const)(
    "exposes chat-only basic MCP at every canonical permission level in %s",
    async (name) => {
      const selection = suiteSelection(name);
      const { app } = createSuiteApp(
        name,
        selection,
        seedContentPath(selection),
        true,
      );

      try {
        await initializeImported(app);
        const mcpService = app.getShell().getMCPService();

        for (const level of ["public", "trusted", "admin"] as const) {
          expect(
            mcpService
              .listProtocolToolsForPermissionLevel(level, "basic")
              .map(({ tool }) => tool.name)
              .sort(),
          ).toEqual(["chat", "confirm"]);
        }

        const adminDebugTools = mcpService
          .listProtocolToolsForPermissionLevel("admin", "debug")
          .map(({ tool }) => tool.name);
        for (const toolName of [
          "chat",
          "confirm",
          "system_search",
          "system_get",
          "system_list",
          "system_create",
        ]) {
          expect(adminDebugTools).toContain(toolName);
        }
      } finally {
        await app.stop();
      }
    },
    120_000,
  );

  test.each([
    ["professional", []],
    [
      "providers",
      ["newsletter_subscribers", "stock-photo_search", "stock-photo_select"],
    ],
  ] as const)(
    "exposes optional-provider tools to Admin agents only in %s",
    async (name, adminProviderTools) => {
      const providerTools = [
        "newsletter_signup",
        "newsletter_subscribers",
        "stock-photo_search",
        "stock-photo_select",
      ];
      const selection = suiteSelection(name);
      const { app } = createSuiteApp(
        name,
        selection,
        seedContentPath(selection),
      );
      try {
        await initializeImported(app);
        const mcpService = app.getShell().getMCPService();
        const exposed = (level: "public" | "trusted" | "admin"): string[] =>
          mcpService
            .listAgentToolsForPermissionLevel(level)
            .map(({ tool }) => tool.name)
            .filter((toolName) => providerTools.includes(toolName))
            .sort();

        expect(exposed("public")).toEqual([]);
        expect(exposed("trusted")).toEqual([]);
        expect(exposed("admin")).toEqual([...adminProviderTools]);
      } finally {
        await app.stop();
      }
    },
    120_000,
  );

  test("fails startup when a suite seeds an unregistered entity type", async () => {
    const seedDirectory = createTempDirectory("invalid-seed");
    mkdirSync(join(seedDirectory, "image"));
    writeFileSync(join(seedDirectory, "image", "not-in-core.md"), "# Image\n");
    const selection = suiteSelection("headless");
    const { app } = createSuiteApp("headless", selection, seedDirectory);
    let initializationError: unknown;
    try {
      await initializeImported(app);
    } catch (error) {
      initializationError = error;
    } finally {
      await app.stop();
    }
    expect(caughtError(initializationError).message).toContain(
      "Seed content contains unregistered entity types: image",
    );
  }, 120_000);
});
