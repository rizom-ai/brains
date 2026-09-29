import { describe, expect, it } from "bun:test";
import { writeAuthoringTestConsumer } from "./helpers/authoring-test-consumer";
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
    const testingTypes = readFileSync(
      join(pkgDir, "dist", "testing.d.ts"),
      "utf-8",
    );
    // Entities were the one authoring entry this never read, which is how
    // the entity service reached its declarations unnoticed.
    const entitiesTypes = readFileSync(
      join(pkgDir, "dist", "entities.d.ts"),
      "utf-8",
    );
    /**
     * What an author can actually import from a declaration file.
     *
     * The bundler carries whole modules rather than only what is reachable,
     * so a private interface can sit in the file while being unreachable —
     * the entity service is in the entity declarations for that reason and
     * cannot be named. This checks directly exported names only; the authoring
     * test consumer below also checks capabilities reachable through callbacks.
     */
    const exportedNamesOf = (source: string): Set<string> => {
      const names = new Set<string>();
      for (const block of source.matchAll(/export \{([\s\S]*?)\};/gu)) {
        for (const part of (block[1] ?? "").split(",")) {
          const name = part
            .trim()
            .replace(/^type\s+/u, "")
            .split(/\s+as\s+/u)
            .pop();
          if (name) names.add(name.trim());
        }
      }
      return names;
    };

    for (const privateType of [
      "IShell",
      "PluginManager",
      "EntityService",
      "JobQueue",
      "DashboardWidgetRegistration",
      "StudioWorkspaceRegistration",
    ]) {
      for (const declarations of [
        servicesTypes,
        interfacesTypes,
        entitiesTypes,
      ]) {
        expect([...exportedNamesOf(declarations)]).not.toContain(privateType);
      }
      // The testing entry wraps the runtime’s own harness, which hands out
      // the mock shell and the plugin contexts. Narrowing it is the whole
      // point, so the same rule applies here.
      expect(testingTypes).not.toContain(privateType);
    }
    expect(testingTypes).not.toContain("MockShell");
    expect(testingTypes).toContain("createBrainTestHarness");
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

  /**
   * Every name the ledger promises, imported the way an author would.
   *
   * The ledger's own check reads the entry *sources*, which catches a promise
   * nobody can import but not a name the build fails to emit. This compiles a
   * consumer against the generated declarations and then runs it, so a value
   * that types but does not exist at runtime fails here rather than in
   * somebody's install.
   */
  it("imports every promised name from the generated declarations", async () => {
    const ledger = JSON.parse(
      readFileSync(
        join(
          pkgDir,
          "test",
          "fixtures",
          "public-authoring",
          "export-ledger.json",
        ),
        "utf-8",
      ),
    );

    // The entries this package publishes as declarations; @rizom/site and
    // @rizom/brain-ui are separate packages with their own surfaces.
    const specifiers = Object.keys(ledger.entries).filter(
      (specifier) =>
        specifier === "@rizom/brain" || specifier.startsWith("@rizom/brain/"),
    );

    const typeImports: string[] = [];
    const valueImports: string[] = [];
    const runtimeChecks: string[] = [];
    const runtimeConsumer: string[] = ["const missing = [];"];
    let index = 0;

    for (const specifier of specifiers) {
      const entry = ledger.entries[specifier];
      const promised = [...entry.stable, ...entry["advanced-with-consumer"]];
      if (promised.length === 0) continue;
      const subpath = specifier.replace("@rizom/brain", "") || "/index";
      const source = readFileSync(
        join(pkgDir, "dist", `${subpath.slice(1)}.d.ts`),
        "utf-8",
      );
      // A name is a value when the declaration declares it as one; the rest
      // are types, and importing a type as a value does not compile.
      const values = promised.filter((name: string) =>
        new RegExp(
          `declare (?:const|function|class|enum) \\b${name}\\b`,
          "u",
        ).test(source),
      );
      const types = promised.filter((name: string) => !values.includes(name));
      const alias = `entry${index}`;
      index += 1;
      if (types.length > 0) {
        // Aliased per entry: a name may be promised on more than one, which
        // is legitimate — `AnchorProfile` is authoring vocabulary for both
        // services and plugins — and one file cannot bind it twice.
        typeImports.push(
          `import type { ${types
            .map((name: string) => `${name} as ${alias}_${name}`)
            .join(", ")} } from "${specifier}";`,
        );
      }
      if (values.length > 0) {
        valueImports.push(`import * as ${alias} from "${specifier}";`);
        runtimeConsumer.push(
          `import * as ${alias} from "../dist/${subpath.slice(1)}.js";`,
          ...values.map(
            (name: string) =>
              `if (${alias}["${name}"] === undefined) missing.push("${specifier}: ${name}");`,
          ),
        );
        runtimeChecks.push(
          ...values.map(
            (name: string) =>
              `if (${alias}["${name}"] === undefined) missing.push("${specifier}: ${name}");`,
          ),
        );
      }
      // The import statement is the assertion: a name the declarations do
      // not export fails to resolve. Referencing each one as well would mean
      // supplying type arguments for every generic, which tests the test.
    }

    runtimeConsumer.push(
      "if (missing.length > 0) {",
      "  throw new Error(`Promised but absent at runtime: ${missing.join(', ')}`);",
      "}",
    );

    const tempDir = mkdtempSync(join(pkgDir, ".tmp-packed-consumer-"));
    try {
      writeFileSync(
        join(tempDir, "consumer.ts"),
        [
          "const missing: string[] = [];",
          ...typeImports,
          ...valueImports,
          ...runtimeChecks,
          "if (missing.length > 0) {",
          "  throw new Error(`Promised but absent at runtime: ${missing.join(', ')}`);",
          "}",
          "console.log('ok');",
        ].join("\n"),
      );
      writeFileSync(
        join(tempDir, "tsconfig.json"),
        JSON.stringify({
          compilerOptions: {
            strict: true,
            skipLibCheck: true,
            module: "esnext",
            moduleResolution: "bundler",
            target: "es2022",
            lib: ["es2022", "dom"],
            jsx: "react-jsx",
            jsxImportSource: "react",
            types: [],
            noEmit: true,
            paths: Object.fromEntries(
              specifiers.map((specifier) => [
                specifier,
                [
                  `../dist${specifier.replace("@rizom/brain", "") || "/index"}.d.ts`,
                ],
              ]),
            ),
          },
          include: ["consumer.ts"],
        }),
      );

      const compiled = await runProcess(
        ["bun", "x", "tsc", "--noEmit", "-p", "tsconfig.json"],
        { cwd: tempDir },
      );
      expect(compiled.exitCode, `${compiled.stdout}\n${compiled.stderr}`).toBe(
        0,
      );

      // Compiling proves the declarations promise these names. Running proves
      // the build emitted them: a value that types but is absent at runtime
      // fails on somebody's install rather than here.
      writeFileSync(join(tempDir, "runtime.ts"), runtimeConsumer.join("\n"));
      const ran = await runProcess(["bun", "run", "runtime.ts"], {
        cwd: tempDir,
      });
      expect(ran.exitCode, `${ran.stdout}\n${ran.stderr}`).toBe(0);
    } finally {
      rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it("compiles and runs the SDK author tests through the built public entries", async () => {
    const tempDir = mkdtempSync(join(pkgDir, ".tmp-authoring-tests-"));
    try {
      await writeAuthoringTestConsumer(tempDir);
      const compiled = await runProcess(
        ["bun", "x", "tsc", "-p", "tsconfig.authoring.json"],
        { cwd: tempDir },
      );
      expect(compiled.exitCode, `${compiled.stdout}\n${compiled.stderr}`).toBe(
        0,
      );
      const ran = await runProcess(["bun", "test", "authoring.test.ts"], {
        cwd: tempDir,
      });
      expect(ran.exitCode, `${ran.stdout}\n${ran.stderr}`).toBe(0);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
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

  it("keeps storage dependencies out of ordinary authoring declarations", () => {
    for (const entry of ["entities", "services", "interfaces", "testing"]) {
      const source = stripDeclarationComments(
        readFileSync(join(pkgDir, "dist", `${entry}.d.ts`), "utf8"),
      );
      expect(source).not.toContain("drizzle-orm");
      expect(source).not.toContain("@libsql/");
      expect(source).not.toMatch(
        /\b(?:class|interface) (?:EntityService|EntityPluginContext|ProjectionStore)\b/u,
      );
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
