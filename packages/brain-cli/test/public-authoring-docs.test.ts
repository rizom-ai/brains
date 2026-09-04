import { describe, expect, it } from "bun:test";
import { runProcess } from "@brains/utils/run-process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

const repositoryRoot = join(import.meta.dir, "../../..");
const documents = [
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
  "external-template-service",
  "external-theme-definition",
  "migration-brain-composition",
  "plugin-system-brain-composition",
  "plugin-system-service-import",
  "quick-brain-composition",
  "quick-service-definition",
  "quick-service-import",
  "quick-template-flow",
];
const examplePattern =
  /<!-- public-authoring-example: ([a-z0-9-]+)(?: source=([^ ]+))? -->\s*```(ts|tsx|typescript)\n([\s\S]*?)\n```/gu;
const typedFencePattern = /^```(?:ts|tsx|typescript)\s*$/gmu;

interface AuthoringExample {
  readonly id: string;
  readonly language: string;
  readonly sourcePath?: string | undefined;
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
      const language = match[3];
      const code = match[4];
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
    const examples = (await readExamples()).filter(
      ({ sourcePath }) => sourcePath === undefined,
    );
    const temporaryDirectory = await mkdtemp(
      join(repositoryRoot, ".public-authoring-docs-"),
    );

    try {
      await writeSupportModules(temporaryDirectory);
      const sourceFiles: string[] = [];
      for (const example of examples) {
        const extension = example.language === "tsx" ? "tsx" : "ts";
        const sourcePath = join(
          temporaryDirectory,
          `${example.id}.${extension}`,
        );
        await writeFile(sourcePath, `${example.code}\n`);
        sourceFiles.push(`./${relative(temporaryDirectory, sourcePath)}`);
      }

      const calendarPath = "./support/calendar.ts";
      const demoPath = "./support/demo.ts";
      const repositoryPath = (path: string): string =>
        relative(temporaryDirectory, join(repositoryRoot, path));
      const tsconfigPath = join(temporaryDirectory, "tsconfig.json");
      await writeFile(
        tsconfigPath,
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
                  repositoryPath(
                    "packages/brain-cli/src/entries/interfaces.ts",
                  ),
                ],
                "@rizom/site": [repositoryPath("packages/site/src/index.ts")],
                "@example/calendar": [calendarPath],
                "@example/demo": [demoPath],
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

      const result = await runProcess(
        ["bunx", "tsc", "--noEmit", "-p", tsconfigPath],
        {
          cwd: repositoryRoot,
          env: process.env,
        },
      );
      expect(
        result.exitCode,
        `Documented TypeScript examples failed to compile:\n${result.stdout}${result.stderr}`,
      ).toBe(0);
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  }, 30_000);
});
