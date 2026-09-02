import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { z } from "@brains/utils/zod";

const repositoryRoot = join(import.meta.dir, "..", "..", "..");
const retiredRuntime = "pre" + "act";
const ignoredSegments = new Set(["node_modules", "dist", ".git", ".turbo"]);

async function repositoryFiles(pattern: string): Promise<string[]> {
  const files: string[] = [];
  for await (const path of new Bun.Glob(pattern).scan({
    cwd: repositoryRoot,
    onlyFiles: true,
  })) {
    if (path.split("/").some((segment) => ignoredSegments.has(segment))) {
      continue;
    }
    files.push(path);
  }
  return files.sort();
}

async function sourceViolations(): Promise<string[]> {
  const moduleSpecifier = new RegExp(
    `["']${retiredRuntime}(?:/[^"']*)?["']|${retiredRuntime}-render-to-string|@jsxImportSource\\s+${retiredRuntime}`,
  );
  const violations: string[] = [];
  for (const path of await repositoryFiles("**/*.{ts,tsx,js,jsx,mjs,cjs}")) {
    const source = await readFile(join(repositoryRoot, path), "utf8");
    if (moduleSpecifier.test(source)) violations.push(path);
  }
  return violations;
}

async function packageViolations(): Promise<string[]> {
  const violations: string[] = [];
  for (const path of await repositoryFiles("**/package.json")) {
    const manifest = z
      .record(z.string(), z.unknown())
      .parse(JSON.parse(await readFile(join(repositoryRoot, path), "utf8")));
    for (const field of [
      "dependencies",
      "devDependencies",
      "peerDependencies",
      "optionalDependencies",
      "publishPeerDependencies",
    ]) {
      const dependencies = manifest[field];
      if (
        dependencies !== null &&
        typeof dependencies === "object" &&
        Object.keys(dependencies).some((name) =>
          name.startsWith(retiredRuntime),
        )
      ) {
        violations.push(`${path}#${field}`);
      }
    }
  }
  return violations;
}

async function jsxConfigViolations(): Promise<string[]> {
  const violations: string[] = [];
  const retiredConfig = new RegExp(
    `"jsxImportSource"\\s*:\\s*"${retiredRuntime}"`,
  );
  for (const path of await repositoryFiles("**/tsconfig*.json")) {
    const config = await readFile(join(repositoryRoot, path), "utf8");
    if (retiredConfig.test(config)) violations.push(path);
  }
  return violations;
}

describe("React runtime consolidation", () => {
  it("contains no imports or JSX pragmas for the retired runtime", async () => {
    expect(await sourceViolations()).toEqual([]);
  });

  it("contains no package dependency on the retired runtime", async () => {
    expect(await packageViolations()).toEqual([]);
  });

  it("uses React as every explicit JSX import source", async () => {
    expect(await jsxConfigViolations()).toEqual([]);
  });

  it("contains no renderer file named for the retired runtime", async () => {
    const paths = await repositoryFiles("**/*");
    expect(
      paths
        .map((path) => relative(repositoryRoot, join(repositoryRoot, path)))
        .filter(
          (path) =>
            path.toLowerCase().includes(retiredRuntime) &&
            path !== "docs/plans/preact-to-react-consolidation.md",
        ),
    ).toEqual([]);
  });
});
