import { describe, expect, it } from "bun:test";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runProcess } from "@brains/utils/run-process";

const repositoryRoot = join(import.meta.dir, "../../..");
const fixture = join(
  import.meta.dir,
  "fixtures/public-authoring/reminders/src/index.ts",
);
const exercise = join(
  import.meta.dir,
  "fixtures/reminders-exercise/reminders.exercise.ts",
);

/**
 * Runs the reminders fixture's own source against this repository's public
 * entries. The source is staged beside a tsconfig that maps those entries,
 * since a package's own tsconfig governs how its imports resolve.
 */
describe("public authoring reminders fixture", () => {
  it("passes its scenarios against the repository's public entries", async () => {
    const stage = mkdtempSync(join(import.meta.dir, ".reminders-"));
    try {
      cpSync(fixture, join(stage, "src/index.ts"));
      cpSync(exercise, join(stage, "reminders.test.ts"));
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
            types: ["bun"],
            paths: {
              "@rizom/brain/entities": [
                join(
                  repositoryRoot,
                  "packages/brain-cli/src/entries/entities.ts",
                ),
              ],
              "@rizom/brain/services": [
                join(
                  repositoryRoot,
                  "packages/brain-cli/src/entries/services.ts",
                ),
              ],
            },
          },
          include: ["src/**/*.ts", "reminders.test.ts"],
        }),
      );
      // The scenarios and the source they exercise both typecheck as staged.
      const compiled = await runProcess(
        ["bunx", "tsc", "-p", "tsconfig.json"],
        { cwd: stage, env: process.env },
      );
      expect(compiled.exitCode, `${compiled.stdout}${compiled.stderr}`).toBe(0);
      const result = await runProcess(["bun", "test", "./reminders.test.ts"], {
        cwd: stage,
        env: process.env,
      });
      const output = `${result.stdout}${result.stderr}`;
      expect(result.exitCode, output).toBe(0);
      expect(output).toContain(" 4 pass");
      expect(output).toContain(" 0 fail");
    } finally {
      rmSync(stage, { recursive: true, force: true });
    }
  }, 60_000);
});
