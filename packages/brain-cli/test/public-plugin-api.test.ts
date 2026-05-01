import { beforeAll, describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "fs";
import { join, relative } from "path";

const pkgDir = join(import.meta.dir, "..");
const externalPluginFixtureDir = join(
  pkgDir,
  "test",
  "fixtures",
  "external-plugin",
);
const brainDefinitionFixtureDir = join(
  pkgDir,
  "test",
  "fixtures",
  "brain-definition",
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

interface TypedPublicExport {
  specifier: string;
  types: string;
}

function listTypedPublicExports(): TypedPublicExport[] {
  const pkg = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf-8"));

  return Object.entries(pkg.exports).flatMap(([subpath, entry]) => {
    if (typeof entry !== "object" || entry === null || !("types" in entry)) {
      return [];
    }

    const specifier =
      subpath === "." ? "@rizom/brain" : `@rizom/brain/${subpath.slice(2)}`;
    return [{ specifier, types: String(entry.types) }];
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

  it("points every typed package export at generated dist declarations", () => {
    for (const publicExport of listTypedPublicExports()) {
      expect(publicExport.types).toStartWith("./dist/");
      expect(publicExport.types).toEndWith(".d.ts");
      expect(existsSync(join(pkgDir, publicExport.types))).toBeTrue();
    }
  });

  it("keeps published declarations free of internal @brains/* imports", () => {
    for (const publicExport of listTypedPublicExports()) {
      const types = readFileSync(join(pkgDir, publicExport.types), "utf-8");
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

  it("typechecks the package-local brain definition fixture", () => {
    const source = readFileSync(
      join(brainDefinitionFixtureDir, "src", "index.ts"),
      "utf-8",
    );
    expect(source).toContain('from "@rizom/brain"');
    expect(source).toContain("defineBrain");
    expect(source).not.toContain("@brains/");

    const result = spawnSync(
      "bun",
      ["x", "tsc", "--noEmit", "-p", "tsconfig.json"],
      {
        cwd: brainDefinitionFixtureDir,
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

  it("resolves the brain definition fixture against generated root declarations", () => {
    const result = spawnSync(
      "bun",
      ["x", "tsc", "--noEmit", "--traceResolution", "-p", "tsconfig.json"],
      {
        cwd: brainDefinitionFixtureDir,
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
  });

  it("resolves every typed package export against generated dist declarations", () => {
    const publicExports = listTypedPublicExports();
    const tempDir = mkdtempSync(join(pkgDir, ".tmp-public-export-resolution-"));

    try {
      const imports = publicExports
        .map(
          (publicExport, index) =>
            `import type * as Public${index} from "${publicExport.specifier}";`,
        )
        .join("\n");
      const modules = publicExports
        .map((_, index) => `typeof Public${index}`)
        .join(",\n  ");

      writeFileSync(
        join(tempDir, "index.ts"),
        `${imports}\n\nexport type PublicModules = [\n  ${modules},\n];\n`,
      );
      writeFileSync(
        join(tempDir, "tsconfig.json"),
        JSON.stringify(
          {
            extends: "../tsconfig.instance.json",
            compilerOptions: {
              noEmit: true,
              types: ["bun-types"],
              skipLibCheck: true,
            },
            include: ["index.ts"],
          },
          null,
          2,
        ),
      );

      const result = spawnSync(
        "bun",
        ["x", "tsc", "--noEmit", "--traceResolution", "-p", "tsconfig.json"],
        {
          cwd: tempDir,
          encoding: "utf-8",
          maxBuffer: 20 * 1024 * 1024,
        },
      );

      const output = `${result.stdout}\n${result.stderr}`;
      if (result.status !== 0) {
        throw new Error(output);
      }

      for (const publicExport of publicExports) {
        expect(output).toContain(
          `Module name '${publicExport.specifier}' was successfully resolved`,
        );
        expect(output).toContain(publicExport.types.slice("./".length));
      }
    } finally {
      rmSync(tempDir, { force: true, recursive: true });
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
