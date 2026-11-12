import { describe, expect, it } from "bun:test";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runProcess } from "@brains/utils/run-process";

const repositoryRoot = join(import.meta.dir, "../../..");
const fixture = join(import.meta.dir, "fixtures/public-authoring/reminders");
const entry = (name: string): string =>
  join(repositoryRoot, "packages/brain-cli/src/entries", `${name}.ts`);

/**
 * Runs the reminders package's own test from the package's directory, as its
 * author runs it, against this repository's public entries. The package is
 * staged beside a tsconfig that maps those entries, since a package's own
 * tsconfig governs how its imports resolve.
 */
describe("public authoring reminders fixture", () => {
  it("passes its own test on the testing entry", async () => {
    const stage = mkdtempSync(join(import.meta.dir, ".reminders-"));
    try {
      cpSync(join(fixture, "package.json"), join(stage, "package.json"));
      cpSync(join(fixture, "src"), join(stage, "src"), { recursive: true });
      cpSync(join(fixture, "test"), join(stage, "test"), { recursive: true });
      cpSync(
        join(fixture, "test/reminders.exercise.ts"),
        join(stage, "test/reminders.test.ts"),
      );
      writeFileSync(
        join(stage, "tsconfig.json"),
        JSON.stringify({
          compilerOptions: {
            strict: true,
            exactOptionalPropertyTypes: true,
            noUncheckedIndexedAccess: true,
            module: "ESNext",
            moduleResolution: "bundler",
            target: "ES2022",
            lib: ["ES2022", "DOM"],
            skipLibCheck: true,
            noEmit: true,
            // The entries are mapped to source, which carries the runtime's JSX.
            jsx: "react-jsx",
            jsxImportSource: "react",
            types: ["bun"],
            paths: {
              "@rizom/brain": [entry("index")],
              "@rizom/brain/entities": [entry("entities")],
              "@rizom/brain/services": [entry("services")],
              "@rizom/brain/testing": [entry("testing")],
            },
          },
          include: ["src/**/*.ts", "test/**/*.ts"],
        }),
      );
      // The test, its canary and the source they exercise typecheck as staged.
      const compiled = await runProcess(
        ["bunx", "tsc", "-p", "tsconfig.json"],
        { cwd: stage, env: process.env },
      );
      expect(compiled.exitCode, `${compiled.stdout}${compiled.stderr}`).toBe(0);
      const result = await runProcess(
        ["bun", "test", "./test/reminders.test.ts"],
        { cwd: stage, env: process.env },
      );
      const output = `${result.stdout}${result.stderr}`;
      expect(result.exitCode, output).toBe(0);
      expect(output).toContain(" 4 pass");
      expect(output).toContain(" 0 fail");
    } finally {
      rmSync(stage, { recursive: true, force: true });
    }
  }, 90_000);
});
