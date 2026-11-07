import { describe, expect, it } from "bun:test";
import { runProcess } from "@brains/utils/run-process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

const repositoryRoot = join(import.meta.dir, "../../..");
const documents = [
  "docs/package-quickstart.md",
  "docs/plugin-quick-reference.md",
  "docs/plugin-system.md",
  "docs/external-plugin-authoring.md",
  "docs/external-site-authoring.md",
  "docs/public-release/AUTHORING_0.2_MIGRATION.md",
];
const expectedExampleIds = [
  "external-calendar-brain",
  "external-calendar-service",
  "external-site-definition",
  "external-site-ui-section",
  "external-template-service",
  "external-theme-definition",
  "migration-brain-composition",
  "plugin-system-brain-composition",
  "plugin-system-service-import",
  "quick-brain-composition",
  "quick-service-definition",
  "quick-service-import",
  "quick-template-flow",
  "quickstart-brain",
  "quickstart-package",
  "quickstart-test",
];
const examplePattern =
  /<!-- public-authoring-example: ([a-z0-9-]+)(?: source=([^ ]+))?(?: file=([^ ]+))? -->\s*```(ts|tsx|typescript)\n([\s\S]*?)\n```/gu;
const typedFencePattern = /^```(?:ts|tsx|typescript)\s*$/gmu;

interface AuthoringExample {
  readonly id: string;
  readonly language: string;
  readonly sourcePath?: string | undefined;
  /** Where the example lives in the package it describes, as `src/index.ts`. */
  readonly file?: string | undefined;
  readonly code: string;
}

function normalizedExcerpt(source: string): string {
  return source.replace(/,\s*([)\]}])/gu, "$1").replace(/\s+/gu, "");
}

async function readExamples(): Promise<AuthoringExample[]> {
  const examples: AuthoringExample[] = [];
  for (const documentPath of documents) {
    const markdown = await readFile(join(repositoryRoot, documentPath), "utf8");
    const typedFenceCount = [...markdown.matchAll(typedFencePattern)].length;
    const documentExamples: AuthoringExample[] = [];
    for (const match of markdown.matchAll(examplePattern)) {
      const id = match[1];
      const language = match[4];
      const code = match[5];
      if (!id || !language || !code) {
        throw new Error(
          `Invalid public authoring example marker in ${documentPath}`,
        );
      }
      documentExamples.push({
        id,
        language,
        code,
        ...(match[2] ? { sourcePath: match[2] } : {}),
        ...(match[3] ? { file: match[3] } : {}),
      });
    }
    expect(
      documentExamples.length,
      `${documentPath} must inventory every TypeScript fence`,
    ).toBe(typedFenceCount);
    examples.push(...documentExamples);
  }
  return examples;
}

async function writeSupportModules(directory: string): Promise<void> {
  const supportDirectory = join(directory, "support");
  await mkdir(supportDirectory, { recursive: true });
  await writeFile(
    join(supportDirectory, "calendar.ts"),
    [
      'import { defineServicePlugin, z } from "@rizom/brain/services";',
      "",
      "export default defineServicePlugin({",
      '  id: "calendar",',
      '  config: z.object({ timezone: z.string().default("UTC") }),',
      "});",
      "",
    ].join("\n"),
  );
  await writeFile(
    join(supportDirectory, "demo.ts"),
    [
      'import { defineServicePlugin, z } from "@rizom/brain/services";',
      "",
      "export default defineServicePlugin({",
      '  id: "demo",',
      '  config: z.object({ greeting: z.string().default("Hello") }),',
      "});",
      "",
    ].join("\n"),
  );
}

describe("public authoring documentation", () => {
  it("inventories every stable TypeScript example", async () => {
    const examples = await readExamples();
    expect(examples.map(({ id }) => id).sort()).toEqual(expectedExampleIds);
    expect(new Set(examples.map(({ id }) => id)).size).toBe(examples.length);

    for (const example of examples) {
      if (!example.sourcePath) continue;
      const fixtureSource = await readFile(
        join(repositoryRoot, example.sourcePath),
        "utf8",
      );
      expect(
        normalizedExcerpt(fixtureSource),
        `${example.id} must remain an exact checked-source excerpt`,
      ).toContain(normalizedExcerpt(example.code));
    }
  });

  it("typechecks every standalone stable TypeScript example", async () => {
    const temporaryDirectory = await stageExamples();
    try {
      const result = await runProcess(
        ["bunx", "tsc", "--noEmit", "-p", "tsconfig.json"],
        { cwd: temporaryDirectory, env: process.env },
      );
      expect(
        result.exitCode,
        `Documented TypeScript examples failed to compile:\n${result.stdout}${result.stderr}`,
      ).toBe(0);
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  }, 30_000);

  it("runs the quickstart package's own test on the runtime", async () => {
    const temporaryDirectory = await stageExamples();
    try {
      // The quickstart's manifest, with a range this repository's Brain meets.
      await writeFile(
        join(temporaryDirectory, "package.json"),
        `${JSON.stringify({
          name: "@example/memos",
          version: "0.1.0",
          type: "module",
          peerDependencies: { "@rizom/brain": ">=0.2.0-alpha.0 <0.3.0" },
        })}\n`,
      );
      const result = await runProcess(["bun", "test", "./test/memos.test.ts"], {
        cwd: temporaryDirectory,
        env: process.env,
      });
      const output = `${result.stdout}${result.stderr}`;
      expect(result.exitCode, output).toBe(0);
      expect(output).toContain(" 1 pass");
      expect(output).toContain(" 0 fail");
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  }, 60_000);
});

/**
 * Write every standalone example where its package keeps it, beside support
 * modules and a tsconfig that maps the public entries to this repository's.
 * Bun reads the same mapping, so a staged test runs against them too.
 */
async function stageExamples(): Promise<string> {
  const examples = (await readExamples()).filter(
    ({ sourcePath }) => sourcePath === undefined,
  );
  const temporaryDirectory = await mkdtemp(
    join(repositoryRoot, ".public-authoring-docs-"),
  );
  await writeSupportModules(temporaryDirectory);
  const sourceFiles: string[] = [];
  for (const example of examples) {
    const extension = example.language === "tsx" ? "tsx" : "ts";
    const sourcePath = join(
      temporaryDirectory,
      example.file ?? `${example.id}.${extension}`,
    );
    await mkdir(dirname(sourcePath), { recursive: true });
    await writeFile(sourcePath, `${example.code}\n`);
    sourceFiles.push(`./${relative(temporaryDirectory, sourcePath)}`);
  }

  const repositoryPath = (path: string): string =>
    relative(temporaryDirectory, join(repositoryRoot, path));
  await writeFile(
    join(temporaryDirectory, "tsconfig.json"),
    `${JSON.stringify(
      {
        compilerOptions: {
          strict: true,
          noEmit: true,
          skipLibCheck: true,
          module: "ESNext",
          moduleResolution: "bundler",
          target: "ES2022",
          lib: ["ES2022", "DOM"],
          jsx: "react-jsx",
          jsxImportSource: "react",
          types: ["bun"],
          paths: {
            "@rizom/brain": [
              repositoryPath("packages/brain-cli/src/entries/index.ts"),
            ],
            "@rizom/brain/entities": [
              repositoryPath("packages/brain-cli/src/entries/entities.ts"),
            ],
            "@rizom/brain/services": [
              repositoryPath("packages/brain-cli/src/entries/services.ts"),
            ],
            "@rizom/brain/interfaces": [
              repositoryPath("packages/brain-cli/src/entries/interfaces.ts"),
            ],
            "@rizom/brain/testing": [
              repositoryPath("packages/brain-cli/src/entries/testing.ts"),
            ],
            "@rizom/brain-ui": [repositoryPath("packages/ui/src/index.ts")],
            "@rizom/site": [repositoryPath("packages/site/src/index.ts")],
            "@example/calendar": ["./support/calendar.ts"],
            "@example/demo": ["./support/demo.ts"],
            "@example/memos": ["./src/index.ts"],
            "@example/reading-entities": [
              repositoryPath(
                "packages/brain-cli/test/fixtures/public-authoring/entity/src/index.ts",
              ),
            ],
          },
        },
        files: sourceFiles,
      },
      null,
      2,
    )}\n`,
  );
  return temporaryDirectory;
}
