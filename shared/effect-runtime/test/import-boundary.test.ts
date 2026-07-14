import { describe, expect, it } from "bun:test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dir, "../../..");
const boundaryRoot = "shared/effect-runtime/";

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
  it("keeps direct Effect imports and dependencies in the boundary package", () => {
    const violations = listCandidateFiles()
      .filter((file) => !file.startsWith(boundaryRoot))
      .filter((file) => {
        const source = readFileSync(resolve(repositoryRoot, file), "utf8");
        return file.endsWith("package.json")
          ? /["']effect["']\s*:/.test(source)
          : /(?:from\s+|import\s*\()["']effect(?:\/[^"']*)?["']/.test(source);
      });

    expect(violations).toEqual([]);
  });
});
