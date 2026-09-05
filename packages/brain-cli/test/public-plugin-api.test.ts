import { describe, expect, it } from "bun:test";
import { runProcess } from "@brains/utils/run-process";
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
import {
  findInternalDeclarationImports,
  stripDeclarationComments,
} from "@brains/build-tools";

const pkgDir = join(import.meta.dir, "..");
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

function findEffectDeclarationImports(source: string): string[] {
  const importSpecifiers = [
    ...stripDeclarationComments(source).matchAll(
      /(?:\bfrom\s*|\bimport\s*\(?\s*)["']([^"']+)["']/g,
    ),
  ].map((match) => match[1] ?? "");

  return importSpecifiers.filter(
    (specifier) =>
      specifier === "effect" ||
      specifier.startsWith("effect/") ||
      /\/effect(?:\/|$)/.test(specifier),
  );
}

describe("@rizom/brain public plugin API surface", () => {
  it("declares root and plugin-author subpath exports", async () => {
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

  it("has entry files and generated declarations for every plugin-author subpath", async () => {
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

  it("publishes bundle authoring from the root declaration", async () => {
    const rootTypes = readFileSync(join(pkgDir, "dist", "index.d.ts"), "utf-8");

    expect(rootTypes).toContain("CapabilityBundleDefinition");
    expect(rootTypes).toContain("declare function defineBundle");
  });

  it("ships runtime validation for public bundle definitions", async () => {
    const result = await runProcess(
      [
        "bun",
        "-e",
        `import { defineBundle } from "./dist/index.js";
         defineBundle({ id: "core", members: [] });
         try {
           defineBundle({ id: "Invalid Bundle", members: [] });
           process.exit(1);
         } catch {}`,
      ],
      { cwd: pkgDir },
    );

    expect(result.stdout).toBe("");
    expect(result.exitCode).toBe(0);
  });

  it("does not leave emitted declarations in source directories", async () => {
    const declarations = listDeclarationFiles(join(pkgDir, "src")).map((path) =>
      relative(pkgDir, path),
    );

    expect(declarations).toEqual([]);
  });

  it("points every typed package export at generated dist declarations", async () => {
    for (const publicExport of listTypedPublicExports()) {
      expect(publicExport.types).toStartWith("./dist/");
      expect(publicExport.types).toEndWith(".d.ts");
      expect(existsSync(join(pkgDir, publicExport.types))).toBeTrue();
    }
  });

  it("publishes the accepted operator contracts without runtime internals", async () => {
    const servicesTypes = readFileSync(
      join(pkgDir, "dist", "services.d.ts"),
      "utf-8",
    );
    const interfacesTypes = readFileSync(
      join(pkgDir, "dist", "interfaces.d.ts"),
      "utf-8",
    );

    for (const symbol of [
      "defineAccountSettings",
      "defineStudioWorkspace",
      "defineDashboardWidget",
      "defineWorkspaceAction",
      "OperatorView",
    ]) {
      expect(servicesTypes).toContain(symbol);
    }
    expect(interfacesTypes).toContain("defineAccountSettings");
    expect(interfacesTypes).toContain("forAccounts");
    expect(servicesTypes).not.toContain("getDashboardWidgetLoader");
    expect(servicesTypes).not.toContain("getStudioWorkspaceExecutor");
    expect(servicesTypes).not.toContain("getWorkspaceActionExecutor");
    for (const privateType of [
      "IShell",
      "PluginManager",
      "EntityService",
      "JobQueue",
      "DashboardWidgetRegistration",
      "StudioWorkspaceRegistration",
    ]) {
      expect(servicesTypes).not.toContain(privateType);
      expect(interfacesTypes).not.toContain(privateType);
    }
  });

  it("compiles the Phase 1 fixtures against generated declarations", async () => {
    const tempDir = mkdtempSync(join(pkgDir, ".tmp-operator-declarations-"));
    try {
      writeFileSync(
        join(tempDir, "tsconfig.json"),
        JSON.stringify({
          extends:
            "../test/fixtures/public-authoring/operator-surface/tsconfig.json",
          compilerOptions: {
            rootDir: "..",
            declaration: false,
            jsx: "react-jsx",
            jsxImportSource: "react",
            types: ["bun"],
            noUnusedLocals: false,
            noUnusedParameters: false,
            paths: {
              "@rizom/brain/entities": ["../dist/entities.d.ts"],
              "@rizom/brain/interfaces": ["../dist/interfaces.d.ts"],
              "@rizom/brain/services": ["../dist/services.d.ts"],
              "@fixture/reading-entities": [
                "../test/fixtures/public-authoring/entity/src/index.ts",
              ],
              "@fixture/reading-insights": [
                "../test/fixtures/public-authoring/service/src/index.tsx",
              ],
            },
          },
          include: [
            "../test/fixtures/public-authoring/operator-surface/src/**/*.ts",
            "../test/fixtures/public-authoring/account-settings-interface/src/**/*.ts",
          ],
        }),
      );

      const result = await runProcess(
        ["bun", "x", "tsc", "--noEmit", "-p", "tsconfig.json"],
        { cwd: tempDir },
      );
      expect(result.exitCode, `${result.stdout}\n${result.stderr}`).toBe(0);
    } finally {
      rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it("keeps published declarations free of internal @brains/* imports", async () => {
    for (const publicExport of listTypedPublicExports()) {
      const types = readFileSync(join(pkgDir, publicExport.types), "utf-8");
      // Import positions only. Doc comments legitimately name internal
      // packages — @example blocks show how to import them — and that is not
      // a leak of this file's own dependencies.
      expect(
        findInternalDeclarationImports(types, {
          internalPrefixes: ["@brains/"],
        }),
      ).toEqual([]);
    }
  });

  it("keeps internal HTTP route registry types out of public declarations", async () => {
    for (const publicExport of listTypedPublicExports()) {
      const types = readFileSync(join(pkgDir, publicExport.types), "utf-8");
      expect(types).not.toContain("RegisteredHttpRoute");
      expect(types).not.toContain("HttpRouteManifestEntry");
    }
  });

  it("keeps Effect and private /effect imports out of public declarations", async () => {
    for (const publicExport of listTypedPublicExports()) {
      const types = readFileSync(join(pkgDir, publicExport.types), "utf-8");
      expect(findEffectDeclarationImports(types)).toEqual([]);
    }
  });

  it("keeps shell internals out of public plugin types", async () => {
    const pluginsTypes = readFileSync(
      join(pkgDir, "dist", "plugins.d.ts"),
      "utf-8",
    );

    expect(pluginsTypes).toContain("PluginPackageDefinition");
    expect(pluginsTypes).not.toContain("declare abstract class EntityPlugin");
    expect(pluginsTypes).not.toContain(
      "declare abstract class InterfacePlugin",
    );
    expect(pluginsTypes).not.toContain(
      "declare abstract class MessageInterfacePlugin",
    );
    expect(pluginsTypes).not.toContain("declare abstract class ServicePlugin");
    expect(pluginsTypes).not.toContain("PluginFactory");
    expect(pluginsTypes).not.toContain("declare function toolSuccess");
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
    expect(pluginsTypes).not.toContain("AttachmentRegistry");
    expect(pluginsTypes).not.toContain("IAttachmentsNamespace");
    expect(pluginsTypes).not.toContain("AttachmentProvider");
    expect(pluginsTypes).not.toContain("AttachmentResolveRequest");
    expect(pluginsTypes).not.toContain("themeCSS");
  });

  it("resolves every typed package export against generated dist declarations", async () => {
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

      const result = await runProcess(
        [
          "bun",
          "x",
          "tsc",
          "--noEmit",
          "--traceResolution",
          "-p",
          "tsconfig.json",
        ],
        { cwd: tempDir },
      );

      const output = `${result.stdout}\n${result.stderr}`;
      if (result.exitCode !== 0) {
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

  it("build script includes every public plugin API library entry", async () => {
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
