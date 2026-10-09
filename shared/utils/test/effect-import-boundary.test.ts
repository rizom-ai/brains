import { describe, expect, it } from "bun:test";
import { runProcessOrThrow } from "../src/run-process";
import { isRecord } from "../src/is-record";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dir, "../../..");
const importBoundaries = new Set([
  "shared/utils/src/effect.ts",
  "shared/utils/src/effect-test.ts",
  "shared/utils/src/effect-rpc.ts",
  "shared/utils/src/effect-bun.ts",
]);
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
        (file) => !importBoundaries.has(file) && file !== dependencyBoundary,
      )
      .filter((file) => {
        const source = readFileSync(resolve(repositoryRoot, file), "utf8");
        if (!file.endsWith("package.json")) {
          return /(?:from\s+|import\s*\()["'](?:effect(?:\/[^"']*)?|@effect\/[^"']+)["']/.test(
            source,
          );
        }
        const manifest: unknown = JSON.parse(source);
        if (!isRecord(manifest))
          throw new Error(`Invalid package manifest: ${file}`);
        // Root overrides pin transitive versions; they are not direct imports.
        return [
          "dependencies",
          "devDependencies",
          "peerDependencies",
          "optionalDependencies",
        ].some((field) => {
          const dependencies = manifest[field];
          return (
            isRecord(dependencies) &&
            Object.keys(dependencies).some(
              (name) => name === "effect" || name.startsWith("@effect/"),
            )
          );
        });
      });

    expect(violations).toEqual([]);
  });
});
