import { describe, expect, it } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dir, "../../..");
const productionBoundary = "shared/utils/src/effect.ts";
const testBoundary = "shared/utils/src/effect-test.ts";
const dependencyBoundary = "shared/utils/package.json";

function listCandidateFiles(): string[] {
  return execFileSync(
    "git",
    [
      "ls-files",
      "--cached",
      "--others",
      "--exclude-standard",
      "--",
      "*.ts",
      "package.json",
    ],
    { cwd: repositoryRoot, encoding: "utf8" },
  )
    .split(/\r?\n/)
    .map((file) => file.trim())
    .filter(Boolean);
}

describe("Effect import boundary", () => {
  it("keeps direct Effect imports and dependencies in the utility boundary", () => {
    const violations = listCandidateFiles()
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
