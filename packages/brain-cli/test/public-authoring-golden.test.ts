import { describe, expect, it } from "bun:test";
import { runProcess } from "@brains/utils/run-process";
import {
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, relative } from "node:path";

const fixtureRoot = join(import.meta.dir, "fixtures", "public-authoring");
const repositoryRoot = join(import.meta.dir, "../../..");
const ledgerPath = join(fixtureRoot, "export-ledger.json");
const stableLedgerDocumentPath = join(
  repositoryRoot,
  "docs/public-release/AUTHORING_API_0.2.md",
);

// Each package retains the first published release containing the contract it
// exercises. All floors remain pre-stable until coordinated stable nomination.
const nominatedBrainPeerRange = ">=0.2.0-alpha.272 <0.3.0";
const accountSettingsBrainPeerRange = ">=0.2.0-alpha.304 <0.3.0";
const operatorCompositionBrainPeerRange = ">=0.2.0-alpha.339 <0.3.0";
const nominatedSiteVersion = "0.2.0-alpha.233";
// The first release that publishes the component library. It versions with
// @rizom/brain, so its floor is a Brain release number.
const nominatedBrainUiVersion = "0.2.0-alpha.649";

const categories = [
  "stable",
  "advanced-with-consumer",
  "internal/removable",
] as const;

type Category = (typeof categories)[number];

interface LedgerEntry extends Record<Category, string[]> {
  source: string;
}

interface ExportLedger {
  version: number;
  categories: readonly Category[];
  entries: Record<string, LedgerEntry>;
}

interface GoldenPackageExpectation {
  directory: string;
  packageName: string;
  publicEntryPoints: string[];
  requiredVocabulary: string[];
}

const phase0ProposalDirectories = [
  "account-settings-interface",
  "operator-surface",
] as const;

const goldenPackages: GoldenPackageExpectation[] = [
  {
    directory: "entity",
    packageName: "@fixture/reading-entities",
    publicEntryPoints: ["@rizom/brain/entities"],
    requiredVocabulary: [
      "defineEntity",
      "defineEntityPackage",
      "defineProjection",
      "EntityOf",
      "z",
    ],
  },
  {
    directory: "service",
    packageName: "@fixture/reading-insights",
    publicEntryPoints: ["@rizom/brain/entities", "@rizom/brain/services"],
    requiredVocabulary: [
      "defineEntity",
      "defineJob",
      "defineServicePlugin",
      "defineTool",
      "entities: [readingRequest]",
      "z",
    ],
  },
  {
    directory: "profile-steward",
    packageName: "@fixture/reader-profile",
    publicEntryPoints: ["@rizom/brain/entities", "@rizom/brain/services"],
    requiredVocabulary: [
      "defineBusContract",
      "entities: [readerProfile]",
      "answer(fillReaderProfile",
      "sender",
    ],
  },
  {
    directory: "profile-import",
    packageName: "@fixture/reader-import",
    publicEntryPoints: ["@rizom/brain/services"],
    requiredVocabulary: [
      "messaging.request(fillReaderProfile",
      "entities.get(readerProfile",
      "accountSettings.claim(",
      "accountSettings.redeem(",
    ],
  },
  {
    directory: "reminders",
    packageName: "@fixture/reminders",
    publicEntryPoints: [
      "@rizom/brain",
      "@rizom/brain/entities",
      "@rizom/brain/services",
      "@rizom/brain/testing",
    ],
    requiredVocabulary: [
      "entities: [reminder]",
      "runtimeState(",
      "answer(dueCount",
      "fireReminder.handle(",
      "defineRoute(",
      "templates.format(",
      "startTestBrain({ plugins: [use(reminders)] })",
      "brain.jobs.wait(fireReminder",
      "brain.request(dueCount",
    ],
  },
  {
    directory: "site",
    packageName: "@fixture/reading-site",
    publicEntryPoints: ["@rizom/site", "@rizom/brain-ui"],
    requiredVocabulary: [
      "defineSection",
      "defineSite",
      "sectionGroup",
      "z",
      "<Card",
      "<CardTitle",
      "<CardMetadata",
      "<TagsList",
      "<MarkdownContent",
      "formatDate(",
    ],
  },
  {
    directory: "interface",
    packageName: "@fixture/reading-webhook",
    publicEntryPoints: ["@rizom/brain/interfaces"],
    requiredVocabulary: [
      "defineDaemon",
      "defineInterface",
      "defineRoute",
      "protocol",
      "runtimeState(",
      'new SdkError("conflict"',
      "z",
    ],
  },
  {
    directory: "message-interface",
    packageName: "@fixture/campfire-interface",
    publicEntryPoints: ["@rizom/brain/interfaces"],
    requiredVocabulary: [
      "defineMessageInterface",
      "defineMessageInterfacePackage",
      "runtimeState(",
      "read: (): Promise<Uint8Array>",
      "z",
    ],
  },
  {
    directory: "brain-definition",
    packageName: "@fixture/reader-brain",
    publicEntryPoints: ["@rizom/brain"],
    requiredVocabulary: ["defineBrain", "defineBundle", "use"],
  },
];

function listSourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return listSourceFiles(path);
    return /\.tsx?$/u.test(path) ? [path] : [];
  });
}

function packageSource(directory: string): string {
  return listSourceFiles(join(fixtureRoot, directory))
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/\/\/.*$/gmu, "");
}

function exportedNames(sourcePath: string): string[] {
  const source = stripComments(readFileSync(sourcePath, "utf8"));
  const names: string[] = [];

  for (const match of source.matchAll(
    /export\s+(?:type\s+)?\{([^}]*)\}(?:\s+from\s+["'][^"']+["'])?\s*;/gu,
  )) {
    for (const part of (match[1] ?? "").split(",")) {
      const candidate = part.trim();
      if (!candidate) continue;
      names.push(candidate.split(/\s+as\s+/u).at(-1) ?? candidate);
    }
  }

  for (const match of source.matchAll(
    /export\s+(?:declare\s+)?(?:interface|type|function|class|const|let|var|enum)\s+([A-Za-z_$][\w$]*)/gu,
  )) {
    if (match[1]) names.push(match[1]);
  }

  return [...new Set(names)].sort();
}

function publicNamedImports(source: string): Map<string, string[]> {
  const imports = new Map<string, string[]>();

  for (const match of source.matchAll(
    /import\s+\{([^}]*)\}\s+from\s+["'](@rizom\/(?:brain-ui|brain(?:\/[\w-]+)?|site(?:-sections)?))["'];/gu,
  )) {
    const specifier = match[2];
    if (!specifier) continue;
    const names = (match[1] ?? "")
      .split(",")
      .map((part) => part.trim().replace(/^type\s+/u, ""))
      .filter(Boolean)
      .map((part) => part.split(/\s+as\s+/u)[0] ?? part);
    imports.set(specifier, [...(imports.get(specifier) ?? []), ...names]);
  }

  return imports;
}

function readLedger(): ExportLedger {
  const ledger: ExportLedger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  return ledger;
}

describe("public authoring 0.2 golden packages", () => {
  it("checks in the five extension packages and root canary", () => {
    const directories = readdirSync(fixtureRoot)
      .filter((entry) => statSync(join(fixtureRoot, entry)).isDirectory())
      .sort();

    expect(directories).toEqual(
      [
        ...goldenPackages.map((fixture) => fixture.directory),
        ...phase0ProposalDirectories,
      ].sort(),
    );
  });

  it("keeps the operator-surface Phase 1 contract public-only", () => {
    const directory = join(fixtureRoot, "operator-surface");
    const manifestSource = readFileSync(
      join(directory, "package.json"),
      "utf8",
    );
    const manifest = JSON.parse(manifestSource);
    const tsconfig = JSON.parse(
      readFileSync(join(directory, "tsconfig.json"), "utf8"),
    );
    const source = packageSource("operator-surface");
    const ports = readFileSync(join(directory, "PORTS.md"), "utf8");

    expect(manifest.name).toBe("@fixture/reading-operator");
    expect(manifest.type).toBe("module");
    expect(manifestSource).not.toContain("workspace:");
    expect(manifest.peerDependencies?.["@rizom/brain"]).toBe(
      operatorCompositionBrainPeerRange,
    );
    expect(tsconfig.extends).toBeUndefined();
    expect([...publicNamedImports(source).keys()].sort()).toEqual([
      "@rizom/brain/entities",
      "@rizom/brain/services",
    ]);

    for (const symbol of [
      "entities: [queuedReading]",
      "entities.create(queuedReading",
      "launch: { origins: [READING_PROVIDER] }",
      "accountSettings.claim(",
      "accountSettings.redeem(",
      "returnTo: readingWorkspace",
      "accountSettings.read()",
      "accessToken.reveal()",
      "defineAccountSettings",
      "defineStudioWorkspace",
      "defineDashboardWidget",
      "defineServicePlugin",
      "defineWorkspaceAction",
      "primaryAction",
      "query: tagQuery",
      "compact:",
      ".bind(context",
      "z",
    ]) {
      expect(source).toContain(symbol);
    }

    for (const forbidden of [
      "@brains/",
      'from "zod',
      "pluginId",
      "rendererName",
      "registerWidget",
      "registerStudioWorkspace",
      "workspace: readingWorkspace",
      "managementUrl",
      "process.env",
      'from "react',
    ]) {
      expect(source).not.toContain(forbidden);
    }

    for (const heading of [
      "## Directory Sync",
      "## Site",
      "## Email Triage",
      "## Publishing",
      "## Account-settings ownership finding",
    ]) {
      expect(ports).toContain(heading);
    }
    expect(ports).toContain("does **not** fit the first generic contract");
    expect(ports).toContain("Moving mailbox intake into a service");
    expect(ports).toContain("connected-channel ownership decision");
  });

  it("compiles the entity, service, interface and site canaries and the approved Phase 1 operator contract fixtures", async () => {
    const cases = [
      {
        directory: "entity",
        paths: {
          "@rizom/brain/entities": [
            "./packages/brain-cli/src/entries/entities.ts",
          ],
        },
      },
      {
        directory: "service",
        paths: {
          "@rizom/brain/entities": [
            "./packages/brain-cli/src/entries/entities.ts",
          ],
          "@rizom/brain/services": [
            "./packages/brain-cli/src/entries/services.ts",
          ],
          "@fixture/reading-entities": [
            "./packages/brain-cli/test/fixtures/public-authoring/entity/src/index.ts",
          ],
        },
      },
      {
        directory: "reminders",
        paths: {
          "@rizom/brain": ["./packages/brain-cli/src/entries/index.ts"],
          "@rizom/brain/entities": [
            "./packages/brain-cli/src/entries/entities.ts",
          ],
          "@rizom/brain/services": [
            "./packages/brain-cli/src/entries/services.ts",
          ],
          "@rizom/brain/testing": [
            "./packages/brain-cli/src/entries/testing.ts",
          ],
        },
      },
      {
        directory: "profile-steward",
        paths: {
          "@rizom/brain/entities": [
            "./packages/brain-cli/src/entries/entities.ts",
          ],
          "@rizom/brain/services": [
            "./packages/brain-cli/src/entries/services.ts",
          ],
        },
      },
      {
        directory: "profile-import",
        paths: {
          "@rizom/brain/entities": [
            "./packages/brain-cli/src/entries/entities.ts",
          ],
          "@rizom/brain/services": [
            "./packages/brain-cli/src/entries/services.ts",
          ],
          "@fixture/reader-profile": [
            "./packages/brain-cli/test/fixtures/public-authoring/profile-steward/src/index.ts",
          ],
        },
      },
      {
        directory: "operator-surface",
        paths: {
          "@rizom/brain/entities": [
            "./packages/brain-cli/src/entries/entities.ts",
          ],
          "@rizom/brain/services": [
            "./packages/brain-cli/src/entries/services.ts",
          ],
          "@fixture/reading-entities": [
            "./packages/brain-cli/test/fixtures/public-authoring/entity/src/index.ts",
          ],
          "@fixture/reading-insights": [
            "./packages/brain-cli/test/fixtures/public-authoring/service/src/index.tsx",
          ],
        },
      },
      {
        directory: "account-settings-interface",
        paths: {
          "@rizom/brain/interfaces": [
            "./packages/brain-cli/src/entries/interfaces.ts",
          ],
        },
      },
      {
        directory: "interface",
        paths: {
          "@rizom/brain/entities": [
            "./packages/brain-cli/src/entries/entities.ts",
          ],
          "@rizom/brain/services": [
            "./packages/brain-cli/src/entries/services.ts",
          ],
          "@rizom/brain/interfaces": [
            "./packages/brain-cli/src/entries/interfaces.ts",
          ],
          "@fixture/reading-entities": [
            "./packages/brain-cli/test/fixtures/public-authoring/entity/src/index.ts",
          ],
          "@fixture/reading-insights": [
            "./packages/brain-cli/test/fixtures/public-authoring/service/src/index.tsx",
          ],
        },
      },
      {
        directory: "message-interface",
        paths: {
          "@rizom/brain/interfaces": [
            "./packages/brain-cli/src/entries/interfaces.ts",
          ],
        },
      },
      {
        directory: "site",
        paths: {
          "@rizom/site": ["./packages/site/src/index.ts"],
          "@rizom/brain-ui": ["./packages/ui/src/index.ts"],
        },
      },
      {
        directory: "brain-definition",
        paths: {
          "@rizom/brain": ["./packages/brain-cli/src/entries/index.ts"],
          "@rizom/brain/entities": [
            "./packages/brain-cli/src/entries/entities.ts",
          ],
          "@rizom/brain/services": [
            "./packages/brain-cli/src/entries/services.ts",
          ],
          "@rizom/brain/interfaces": [
            "./packages/brain-cli/src/entries/interfaces.ts",
          ],
          "@rizom/site": ["./packages/site/src/index.ts"],
          "@rizom/brain-ui": ["./packages/ui/src/index.ts"],
          "@fixture/reading-entities": [
            "./packages/brain-cli/test/fixtures/public-authoring/entity/src/index.ts",
          ],
          "@fixture/reading-insights": [
            "./packages/brain-cli/test/fixtures/public-authoring/service/src/index.tsx",
          ],
          "@fixture/reading-webhook": [
            "./packages/brain-cli/test/fixtures/public-authoring/interface/src/index.ts",
          ],
          "@fixture/campfire-interface": [
            "./packages/brain-cli/test/fixtures/public-authoring/message-interface/src/index.ts",
          ],
          "@fixture/reading-site": [
            "./packages/brain-cli/test/fixtures/public-authoring/site/src/index.tsx",
          ],
        },
      },
    ] as const;

    // Each case is a whole tsc run over the public entries, and none reads
    // another's tsconfig, so they run side by side; the bound covers the
    // slowest CI runner rather than the sum of the cases.
    const compiled = await Promise.all(
      cases.map(async (fixture) => {
        const tsconfigPath = join(
          repositoryRoot,
          `.public-authoring-${fixture.directory}.tsconfig.json`,
        );
        try {
          writeFileSync(
            tsconfigPath,
            JSON.stringify({
              extends: `./packages/brain-cli/test/fixtures/public-authoring/${fixture.directory}/tsconfig.json`,
              compilerOptions: {
                rootDir: ".",
                declaration: false,
                jsx: "react-jsx",
                jsxImportSource: "react",
                types: ["bun"],
                noUnusedLocals: false,
                noUnusedParameters: false,
                paths: fixture.paths,
              },
              include: [
                `./packages/brain-cli/test/fixtures/public-authoring/${fixture.directory}/src/**/*.ts`,
                `./packages/brain-cli/test/fixtures/public-authoring/${fixture.directory}/src/**/*.tsx`,
                // A package's own tests and their canaries compile with it.
                `./packages/brain-cli/test/fixtures/public-authoring/${fixture.directory}/test/**/*.ts`,
              ],
            }),
          );
          const result = await runProcess(
            ["bunx", "tsc", "--noEmit", "-p", tsconfigPath],
            {
              cwd: repositoryRoot,
              env: process.env,
            },
          );
          return { directory: fixture.directory, result };
        } finally {
          rmSync(tsconfigPath, { force: true });
        }
      }),
    );
    for (const { directory, result } of compiled) {
      expect(
        result.exitCode,
        `${directory} failed to compile:\n${result.stdout}${result.stderr}`,
      ).toBe(0);
    }
  }, 120_000);

  it("keeps the account-settings interface contract lifecycle-owned", () => {
    const directory = join(fixtureRoot, "account-settings-interface");
    const manifestSource = readFileSync(
      join(directory, "package.json"),
      "utf8",
    );
    const manifest = JSON.parse(manifestSource);
    const tsconfig = JSON.parse(
      readFileSync(join(directory, "tsconfig.json"), "utf8"),
    );
    const source = packageSource("account-settings-interface");

    expect(manifest.name).toBe("@fixture/mailbox-connection");
    expect(manifest.type).toBe("module");
    expect(manifestSource).not.toContain("workspace:");
    expect(manifest.peerDependencies?.["@rizom/brain"]).toBe(
      accountSettingsBrainPeerRange,
    );
    expect(tsconfig.extends).toBeUndefined();
    expect([...publicNamedImports(source).keys()]).toEqual([
      "@rizom/brain/interfaces",
    ]);

    for (const symbol of [
      "defineAccountSettings",
      "defineDaemon",
      "defineInterface",
      "forAccounts: mailboxSettings",
      "account.settings.password",
      "z",
    ]) {
      expect(source).toContain(symbol);
    }

    for (const forbidden of [
      "@brains/",
      'from "zod',
      "MessageInterfacePlugin",
      "process.env",
      "registerDescriptor",
      "receiveAuthenticated",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  for (const fixture of goldenPackages) {
    it(`${fixture.directory} is a standalone canonical package`, () => {
      const directory = join(fixtureRoot, fixture.directory);
      const manifestSource = readFileSync(
        join(directory, "package.json"),
        "utf8",
      );
      const manifest = JSON.parse(manifestSource);
      const tsconfig = JSON.parse(
        readFileSync(join(directory, "tsconfig.json"), "utf8"),
      );
      const source = packageSource(fixture.directory);
      const publicImports = [...publicNamedImports(source).keys()];

      expect(manifest.name).toBe(fixture.packageName);
      expect(manifest.type).toBe("module");
      expect(manifest.exports?.["."]).toEqual({
        types: "./dist/index.d.ts",
        import: "./dist/index.js",
      });
      expect(manifestSource).not.toContain("workspace:");
      expect(manifest.peerDependencies?.["@rizom/brain"]).toBe(
        nominatedBrainPeerRange,
      );
      if (fixture.directory === "site") {
        expect(manifest.dependencies?.["@rizom/site"]).toBe(
          nominatedSiteVersion,
        );
        expect(manifest.dependencies?.["@rizom/brain-ui"]).toBe(
          nominatedBrainUiVersion,
        );
      }
      expect(
        tsconfig.extends,
        `${fixture.directory} tsconfig must be self-contained`,
      ).toBeUndefined();
      expect(manifest.dependencies?.zod).toBeUndefined();
      expect(manifest.devDependencies?.zod).toBeUndefined();
      expect(manifest.peerDependencies?.zod).toBeUndefined();
      // An import inventory, independent of source file traversal order.
      expect(publicImports.sort()).toEqual(
        [...fixture.publicEntryPoints].sort(),
      );

      for (const symbol of fixture.requiredVocabulary) {
        expect(source).toContain(symbol);
      }
    });
  }

  it("keeps runtime plumbing and alpha adapters out of golden source", () => {
    const source = goldenPackages
      .map((fixture) => packageSource(fixture.directory))
      .join("\n");

    for (const forbidden of [
      "@brains/",
      "@rizom/brain/site",
      "@rizom/brain-ui/internal",
      "@rizom/site-sections",
      'from "zod',
      "package.json",
      "PLUGIN_API_VERSION",
      "createTool(",
      "toolSuccess(",
      "registerHandler(",
      "getWebRoutes(",
      "extends EntityPlugin",
      "extends ServicePlugin",
      "extends InterfacePlugin",
      "extends MessageInterfacePlugin",
      "process.env",
      "public: true",
      "packageName:",
    ]) {
      expect(source).not.toContain(forbidden);
    }

    expect(source).not.toMatch(/\sas\s+(?:any|const|unknown|[A-Z][\w$]*)/u);
  });

  it("uses typed definitions rather than strings and tuple factories at the root", () => {
    const source = packageSource("brain-definition");

    expect(source).toContain(
      "members: [entities, insights, webhook, messages]",
    );
    expect(source).toContain(
      "plugins: [entities, insights, webhook, messages]",
    );
    expect(source).not.toContain("capabilities:");
    expect(source).not.toContain("interfaces:");
    expect(source).not.toContain("version:");
    expect(source).not.toContain("model:");
  });

  it("covers the accepted domain behavior without duplicate contracts", () => {
    const entity = packageSource("entity");
    const service = packageSource("service");
    const genericInterface = packageSource("interface");
    const messages = packageSource("message-interface");
    const site = packageSource("site");

    expect(entity).toContain("type Bookmark = EntityOf<typeof bookmark>");
    expect(entity).toContain("source: bookmark");
    expect(entity).toContain("target: readingDigest");

    for (const capability of [
      "instructions:",
      "resources:",
      "prompts:",
      "templates:",
      "renderers:",
      "jobs:",
      "tools:",
      "subscriptions:",
      "routes:",
    ]) {
      expect(service).toContain(capability);
    }
    expect(service).toContain("entities.get(bookmark");
    expect(service).toContain("jobs.enqueue(compileReadingDigest, input)");

    expect(genericInterface).toContain('security: { kind: "public" }');
    expect(genericInterface).toContain("security: protocol(");
    expect(genericInterface).toContain("body: compileReadingDigest.input");
    expect(genericInterface).not.toContain("const digestWebhook");

    expect(site).not.toContain("plugin:");
    expect(messages).toContain("messages.receiveAuthenticated(");
    expect(messages).toContain("async edit(");
    expect(messages).not.toContain("supportsMessageEditing");
    expect(messages).not.toContain("registerDescriptor");
    expect(messages).not.toContain("registerProvider");
  });
});

describe("public authoring 0.2 export ledger", () => {
  it("exposes only Studio-named workspace authoring contracts", () => {
    const exports = exportedNames(
      join(repositoryRoot, "packages/brain-sdk/src/services.ts"),
    );

    expect(exports).toEqual(
      expect.arrayContaining([
        "defineStudioWorkspace",
        "StudioWorkspaceDefinition",
        "StudioWorkspaceView",
        "StudioWorkspaceViewBlock",
      ]),
    );
    expect(exports.some((name) => name.includes("Cms"))).toBe(false);
  });

  it("classifies every current authoring export exactly once", () => {
    const ledger = readLedger();

    expect(ledger.version).toBe(1);
    expect(ledger.categories).toEqual(categories);

    for (const [specifier, entry] of Object.entries(ledger.entries)) {
      const classified = categories.flatMap((category) => entry[category]);
      expect(
        new Set(classified).size,
        `${specifier} has duplicate entries`,
      ).toBe(classified.length);

      const current = exportedNames(join(repositoryRoot, entry.source));
      const missing = current.filter((name) => !classified.includes(name));
      expect(missing, `${specifier} has unclassified current exports`).toEqual(
        [],
      );
      const listed = [...entry.stable, ...entry["advanced-with-consumer"]];
      expect(
        listed.filter((name) => !current.includes(name)),
        `${specifier} lists exports its source does not have`,
      ).toEqual([]);
      const removable = current.filter((name) =>
        entry["internal/removable"].includes(name),
      );
      expect(
        removable,
        `${specifier} still exports internal/removable symbols`,
      ).toEqual([]);
    }
  });

  it("classifies every golden public import as stable", () => {
    const ledger = readLedger();

    for (const fixture of [
      ...goldenPackages,
      ...phase0ProposalDirectories.map((directory) => ({ directory })),
    ]) {
      const imports = publicNamedImports(packageSource(fixture.directory));
      for (const [specifier, names] of imports) {
        const entry = ledger.entries[specifier];
        expect(entry, `${specifier} is absent from the ledger`).toBeDefined();
        const unsupported = names.filter(
          (name) => !entry?.stable.includes(name),
        );
        expect(
          unsupported,
          `${fixture.directory} imports non-stable ${specifier} symbols`,
        ).toEqual([]);
      }
    }
  });

  it("uses only named exports the scanner can classify in ledger sources", () => {
    const ledger = readLedger();

    for (const entry of Object.values(ledger.entries)) {
      const source = stripComments(
        readFileSync(join(repositoryRoot, entry.source), "utf8"),
      );
      expect(
        source,
        `${entry.source} uses export * or export default, which exportedNames cannot classify`,
      ).not.toMatch(/export\s+(?:type\s+)?\*|export\s+default/u);
    }
  });

  it("removes deprecated site authoring entry points", () => {
    const ledger = readLedger();
    const brainManifest = JSON.parse(
      readFileSync(
        join(repositoryRoot, "packages/brain-cli/package.json"),
        "utf8",
      ),
    );

    expect(ledger.entries["@rizom/brain/site"]).toBeUndefined();
    expect(ledger.entries["@rizom/site-sections"]).toBeUndefined();
    expect(brainManifest.exports["./site"]).toBeUndefined();
    expect(brainManifest.exports["./plugins"]).toBeUndefined();
    expect(brainManifest.exports["./templates"]).toBeUndefined();
    expect(
      existsSync(join(repositoryRoot, "packages/site-sections")),
    ).toBeFalse();
  });

  it("records intentional alpha removals", () => {
    const ledger = readLedger();

    expect(ledger.entries["@rizom/brain"]?.["internal/removable"]).toEqual(
      expect.arrayContaining([
        "CapabilityEntry",
        "InterfaceEntry",
        "PLUGIN_API_VERSION",
        "PluginFactory",
        "ZodError",
        "ZodSchema",
        "ZodType",
        "z",
      ]),
    );
    // The class API's subpaths are gone, with everything they carried.
    expect(ledger.entries["@rizom/brain/plugins"]).toBeUndefined();
    expect(ledger.entries["@rizom/brain/templates"]).toBeUndefined();
    expect(
      ledger.entries["@rizom/brain/entities"]?.["internal/removable"],
    ).toContain("BaseEntity");
    expect(
      ledger.entries["@rizom/brain/interfaces"]?.["internal/removable"],
    ).toContain("WebRouteDefinition");
    expect(ledger.entries["@rizom/brain/site"]).toBeUndefined();
    expect(ledger.entries["@rizom/site-sections"]).toBeUndefined();
  });

  it("publishes every stable symbol in the release ledger", () => {
    const ledger = readLedger();
    const document = readFileSync(stableLedgerDocumentPath, "utf8");

    for (const [specifier, entry] of Object.entries(ledger.entries)) {
      if (entry.stable.length === 0) continue;
      expect(document).toContain(`## \`${specifier}\``);
      for (const symbol of entry.stable) {
        expect(document, `${specifier} is missing ${symbol}`).toContain(
          `\`${symbol}\``,
        );
      }
    }
  });

  it("points every ledger entry at a repository source", () => {
    const ledger = readLedger();

    for (const entry of Object.values(ledger.entries)) {
      const path = join(repositoryRoot, entry.source);
      expect(
        statSync(path).isFile(),
        `${relative(repositoryRoot, path)} is not a source file`,
      ).toBeTrue();
    }
  });
});
