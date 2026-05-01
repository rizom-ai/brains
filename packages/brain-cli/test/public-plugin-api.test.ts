import { beforeAll, describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";

const pkgDir = join(import.meta.dir, "..");
const externalPluginFixtureDir = join(
  pkgDir,
  "test",
  "fixtures",
  "external-plugin",
);
const subpaths = [
  "plugins",
  "entities",
  "services",
  "interfaces",
  "templates",
] as const;

function listDeclarationFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      return listDeclarationFiles(path);
    }
    return path.endsWith(".d.ts") ? [path] : [];
  });
}

describe("@rizom/brain public plugin API surface", () => {
  beforeAll(() => {
    const result = spawnSync("bun", ["scripts/build.ts"], {
      cwd: pkgDir,
      encoding: "utf-8",
    });

    if (result.status !== 0) {
      throw new Error(`${result.stdout}\n${result.stderr}`);
    }
  }, 60_000);

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

  it("has entry files and generated declarations for every plugin-author subpath", () => {
    for (const subpath of ["index", ...subpaths]) {
      expect(
        existsSync(join(pkgDir, "src", "entries", `${subpath}.ts`)),
      ).toBeTrue();
      expect(existsSync(join(pkgDir, "dist", `${subpath}.d.ts`))).toBeTrue();
      expect(
        existsSync(join(pkgDir, "src", "types", `${subpath}.d.ts`)),
      ).toBeFalse();
    }
  });

  it("does not leave emitted declarations in source directories", () => {
    const declarations = listDeclarationFiles(join(pkgDir, "src")).map((path) =>
      relative(pkgDir, path),
    );

    expect(declarations).toEqual([]);
  });

  it("keeps published declarations free of internal @brains/* imports", () => {
    const pkg = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf-8"));
    const typeFiles = Object.values(pkg.exports)
      .map((entry) =>
        typeof entry === "object" && entry && "types" in entry
          ? String(entry.types)
          : null,
      )
      .filter((path): path is string => path !== null);

    for (const typeFile of typeFiles) {
      const types = readFileSync(join(pkgDir, typeFile), "utf-8");
      expect(types).not.toContain("@brains/");
    }
  });

  it("keeps shell internals out of public plugin types", () => {
    const pluginsTypes = readFileSync(
      join(pkgDir, "dist", "plugins.d.ts"),
      "utf-8",
    );

    expect(pluginsTypes).toContain("declare abstract class EntityPlugin");
    expect(pluginsTypes).toContain("declare abstract class InterfacePlugin");
    expect(pluginsTypes).toContain(
      "declare abstract class MessageInterfacePlugin",
    );
    expect(pluginsTypes).toContain("declare abstract class ServicePlugin");
    expect(pluginsTypes).toContain("ExtensionMetadataSchema");
    expect(pluginsTypes).toContain("ExtensionMetadata");
    expect(pluginsTypes).not.toContain("IShell");
    expect(pluginsTypes).not.toContain("PluginManager");
    expect(pluginsTypes).not.toContain("PluginRegistrationContext");
    expect(pluginsTypes).not.toContain("PluginCapabilities");
    expect(pluginsTypes).not.toContain("RuntimeInterfacePlugin");
    expect(pluginsTypes).not.toContain("RuntimeMessageInterfacePlugin");
    expect(pluginsTypes).not.toContain("isUploadableTextFile");
    expect(pluginsTypes).not.toContain("isFileSizeAllowed");
    expect(pluginsTypes).not.toContain("formatFileUploadMessage");
    expect(pluginsTypes).not.toContain("extractCaptureableUrls");
    expect(pluginsTypes).not.toContain("captureUrlViaAgent");
    expect(pluginsTypes).not.toContain("InterfacePluginDelegate");
    expect(pluginsTypes).not.toContain("MessageInterfacePluginDelegate");
    expect(pluginsTypes).not.toContain("register(shell");
    expect(pluginsTypes).not.toContain("SYSTEM_CHANNELS");
    expect(pluginsTypes).not.toContain("createEntityPluginContext");
    expect(pluginsTypes).not.toContain("createServicePluginContext");
    expect(pluginsTypes).not.toContain("createInterfacePluginContext");
  });

  it("keeps the external plugin fixture on public @rizom/brain subpaths", () => {
    const source = readFileSync(
      join(externalPluginFixtureDir, "src", "index.ts"),
      "utf-8",
    );
    const packageJson = JSON.parse(
      readFileSync(join(externalPluginFixtureDir, "package.json"), "utf-8"),
    );

    expect(source).toContain('from "@rizom/brain"');
    expect(source).toContain('from "@rizom/brain/plugins"');
    expect(source).toContain('from "@rizom/brain/entities"');
    expect(source).toContain('from "@rizom/brain/interfaces"');
    expect(source).toContain('from "zod"');
    expect(source).not.toContain("@brains/");
    expect(packageJson.peerDependencies?.["@rizom/brain"]).toBeDefined();
    expect(packageJson.peerDependencies?.["zod"]).toBeDefined();
    expect(packageJson.rizomBrain?.pluginApi).toBeUndefined();

    const tsconfig = readFileSync(
      join(externalPluginFixtureDir, "tsconfig.json"),
      "utf-8",
    );
    expect(tsconfig).not.toContain("../../../src");
    expect(tsconfig).not.toContain('"paths"');
  });

  it("typechecks the package-local external plugin fixture", () => {
    const result = spawnSync(
      "bun",
      ["x", "tsc", "--noEmit", "-p", "tsconfig.json"],
      {
        cwd: externalPluginFixtureDir,
        encoding: "utf-8",
      },
    );

    const output = `${result.stdout}\n${result.stderr}`;
    if (result.status !== 0) {
      throw new Error(output);
    }
    expect(output).not.toContain("@brains/");
  });

  it("resolves the external plugin fixture against generated dist declarations", () => {
    const result = spawnSync(
      "bun",
      ["x", "tsc", "--noEmit", "--traceResolution", "-p", "tsconfig.json"],
      {
        cwd: externalPluginFixtureDir,
        encoding: "utf-8",
        maxBuffer: 10 * 1024 * 1024,
      },
    );

    const output = `${result.stdout}\n${result.stderr}`;
    if (result.status !== 0) {
      throw new Error(output);
    }

    expect(output).toContain(
      "Module name '@rizom/brain' was successfully resolved",
    );
    expect(output).toContain("dist/index.d.ts");

    for (const subpath of ["plugins", "entities", "interfaces"]) {
      expect(output).toContain(
        `Module name '@rizom/brain/${subpath}' was successfully resolved`,
      );
      expect(output).toContain(`dist/${subpath}.d.ts`);
    }
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
