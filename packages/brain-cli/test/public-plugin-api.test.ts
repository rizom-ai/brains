import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

const pkgDir = join(import.meta.dir, "..");
const subpaths = [
  "plugins",
  "entities",
  "services",
  "interfaces",
  "templates",
  "utils",
] as const;

describe("@rizom/brain public plugin API surface", () => {
  it("declares root and plugin-author subpath exports", () => {
    const pkg = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf-8"));

    expect(pkg.exports?.["."]).toEqual({
      types: "./dist/index.d.ts",
      import: "./dist/index.js",
    });

    for (const subpath of subpaths) {
      expect(pkg.exports?.[`./${subpath}`]).toEqual({
        types: `./dist/${subpath}.d.ts`,
        import: `./dist/${subpath}.js`,
      });
    }
  });

  it("has entry files and hand-written type contracts for every public subpath", () => {
    for (const subpath of ["index", ...subpaths]) {
      expect(
        existsSync(join(pkgDir, "src", "entries", `${subpath}.ts`)),
      ).toBeTrue();
      expect(
        existsSync(join(pkgDir, "src", "types", `${subpath}.d.ts`)),
      ).toBeTrue();
    }
  });

  it("keeps public type contracts free of internal @brains/* imports", () => {
    for (const subpath of ["index", ...subpaths]) {
      const types = readFileSync(
        join(pkgDir, "src", "types", `${subpath}.d.ts`),
        "utf-8",
      );
      expect(types).not.toContain("@brains/");
    }
  });

  it("keeps shell internals out of public plugin types", () => {
    const pluginsTypes = readFileSync(
      join(pkgDir, "src", "types", "plugins.d.ts"),
      "utf-8",
    );

    expect(pluginsTypes).not.toContain("IShell");
    expect(pluginsTypes).not.toContain("PluginManager");
    expect(pluginsTypes).not.toContain("SYSTEM_CHANNELS");
    expect(pluginsTypes).not.toContain("createEntityPluginContext");
    expect(pluginsTypes).not.toContain("createServicePluginContext");
    expect(pluginsTypes).not.toContain("createInterfacePluginContext");
  });

  it("build script includes every public plugin API library entry", () => {
    const src = readFileSync(join(pkgDir, "scripts", "build.ts"), "utf-8");
    const libEntries = src.match(
      /libraryEntries\s*=\s*\[([\s\S]*?)\]\s*as\s+const/,
    );
    expect(libEntries).not.toBeNull();
    const block = libEntries?.[1] ?? "";

    for (const subpath of ["index", ...subpaths]) {
      expect(block).toMatch(new RegExp(`name:\\s*["']${subpath}["']`));
    }
  });
});
