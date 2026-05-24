import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative, sep } from "path";

const packageRoot = join(import.meta.dir, "..");
const packageJsonPath = join(packageRoot, "package.json");
const allowedReactDir = `${join("ui-react")}${sep}`;
const sourceExtensions = [".ts", ".tsx", ".js", ".jsx"];

function listSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];

  for (const entry of entries) {
    if (entry === "node_modules" || entry === "dist") continue;
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      files.push(...listSourceFiles(path));
      continue;
    }
    if (sourceExtensions.some((extension) => path.endsWith(extension))) {
      files.push(path);
    }
  }

  return files;
}

function importsReact(content: string): boolean {
  const packageName = ["re", "act"].join("");
  return (
    content.includes(`from "${packageName}"`) ||
    content.includes(`from '${packageName}'`) ||
    content.includes(`import("${packageName}")`) ||
    content.includes(`import('${packageName}')`) ||
    content.includes(`@jsxImportSource ${packageName}`)
  );
}

describe("React containment", () => {
  it("publishes the built UI asset directory", () => {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as {
      files: string[];
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts["build"]).toBe("bun scripts/build-ui.ts");
    expect(packageJson.files).toContain("dist");
    expect(packageJson.files).toContain("src");
  });

  it("keeps React and React DOM on the same declared range", () => {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as {
      dependencies: Record<string, string>;
    };

    const reactVersion = packageJson.dependencies["react"];
    const reactDomVersion = packageJson.dependencies["react-dom"];

    if (!reactVersion || !reactDomVersion) {
      throw new Error("web-chat must declare react and react-dom dependencies");
    }

    expect(reactVersion).toBe(reactDomVersion);
  });

  it("keeps React imports inside ui-react", () => {
    const violations = listSourceFiles(packageRoot)
      .map((file) => ({ file, relativePath: relative(packageRoot, file) }))
      .filter((entry) => !entry.relativePath.startsWith(allowedReactDir))
      .filter((entry) => importsReact(readFileSync(entry.file, "utf-8")))
      .map((entry) => entry.relativePath);

    expect(violations).toEqual([]);
  });
});
