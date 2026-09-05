import { describe, expect, it } from "bun:test";
import { runProcessOrThrow } from "../src/run-process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dir, "../../..");
const productionBoundary = "shared/utils/src/effect.ts";
const testBoundary = "shared/utils/src/effect-test.ts";
const dependencyBoundary = "shared/utils/package.json";

async function listCandidateFiles(): Promise<string[]> {
  const listed = await runProcessOrThrow(
    [
      "git",
      "ls-files",
      "--cached",
      "--others",
      "--exclude-standard",
      "--",
      "*.ts",
      "package.json",
    ],
    { cwd: repositoryRoot },
  );
  return listed
    .split(/\r?\n/)
    .map((file) => file.trim())
    .filter(Boolean);
}

describe("Effect import boundary", () => {
  it("keeps direct Effect imports and dependencies in the utility boundary", async () => {
    const violations = (await listCandidateFiles())
      .filter((file) => existsSync(resolve(repositoryRoot, file)))
      .filter(
        (file) =>
          file !== productionBoundary &&
          file !== testBoundary &&
          file !== dependencyBoundary,
      )
      .filter((file) => {
        const source = readFileSync(resolve(repositoryRoot, file), "utf8");
        return file.endsWith("package.json")
          ? /["']effect["']\s*:/.test(source)
          : /(?:from\s+|import\s*\()["']effect(?:\/[^"']*)?["']/.test(source);
      });

    expect(violations).toEqual([]);
  });
});
