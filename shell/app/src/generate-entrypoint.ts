import { existsSync } from "fs";
import { relative, sep } from "path";
import { resolveBrainPackageName } from "./brain-package";
import {
  resolveBrainDefinitionDependencies,
  resolveInstalledPackageManifest,
  type InstalledPackageManifest,
} from "./installed-package-metadata";
import { collectOverridePackageRefs } from "./override-package-refs";
import {
  CONVENTIONAL_SITE_CONTENT_PACKAGE_REF,
  CONVENTIONAL_SITE_PACKAGE_REF,
  CONVENTIONAL_THEME_PACKAGE_REF,
  parseInstanceOverrides,
  type InstanceOverrides,
} from "./instance-overrides";

export interface GenerateEntrypointOptions {
  cwd?: string;
}

function toImportPath(fromDir: string, filePath: string): string {
  const normalized = relative(fromDir, filePath).split(sep).join("/");
  return normalized.startsWith(".") ? normalized : `./${normalized}`;
}

function packageImportLine(pkg: string, index: number): string {
  return `import * as __pkg${index} from "${pkg}";`;
}

interface PackageRefMetadata {
  ref: string;
  version?: string | undefined;
}

function packageRegistrationLine(
  pkg: PackageRefMetadata,
  index: number,
): string {
  const options = pkg.version
    ? `, { version: ${JSON.stringify(pkg.version)} }`
    : "";
  return `registerPackage("${pkg.ref}", __pkg${index}.default ?? __pkg${index}${options});`;
}

function buildPackageRefLines(packageRefs: PackageRefMetadata[]): {
  importLines: string[];
  registrationLines: string[];
} {
  return {
    importLines: packageRefs.map(({ ref }, index) =>
      packageImportLine(ref, index),
    ),
    registrationLines: packageRefs.map(packageRegistrationLine),
  };
}

function tryResolvePackageManifest(
  packageRef: string,
  cwd: string | undefined,
): InstalledPackageManifest | undefined {
  if (!cwd) return undefined;
  try {
    return resolveInstalledPackageManifest(packageRef, cwd);
  } catch {
    return undefined;
  }
}

function collectDefinitionDependencies(
  brainPackage: string,
  cwd: string | undefined,
): InstalledPackageManifest[] {
  if (!cwd || brainPackage === "@rizom/brain/model") return [];
  return resolveBrainDefinitionDependencies(brainPackage, cwd);
}

function buildAppImports(options: {
  hasRefs: boolean;
  hasConventions?: boolean;
}): string[] {
  const appImports = ["resolve", "handleCLI", "parseInstanceOverrides"];

  if (options.hasRefs) {
    appImports.push("registerPackage");
  }
  if (options.hasConventions) {
    appImports.push(
      "applyConventionalSiteRefs",
      "registerConventionalSitePackage",
    );
  }

  return appImports;
}

interface EntrypointSourceOptions {
  brainPackage: string;
  brainRegistrationLine?: string | undefined;
  appImports: string[];
  packageImportLines: string[];
  registrationLines: string[];
  configOverridesVariable: string;
  effectiveOverridesLine?: string;
}

function buildEntrypointSource(options: EntrypointSourceOptions): string {
  return [
    `import definition from "${options.brainPackage}";`,
    `import { ${options.appImports.join(", ")} } from "@brains/app";`,
    `import { readFileSync } from "fs";`,
    `import { join } from "path";`,
    ...options.packageImportLines,
    "",
    ...(options.brainRegistrationLine ? [options.brainRegistrationLine] : []),
    ...options.registrationLines,
    "",
    `const yaml = readFileSync(join(process.cwd(), "brain.yaml"), "utf-8");`,
    `const overrides = parseInstanceOverrides(yaml);`,
    ...(options.effectiveOverridesLine ? [options.effectiveOverridesLine] : []),
    `const config = resolve(definition, process.env, ${options.configOverridesVariable});`,
    `await handleCLI(config);`,
    "",
  ].join("\n");
}

interface ConventionalEntrypointParts {
  imports: string[];
  registrations: string[];
  args: string[];
}

function collectConventionalEntrypointParts(
  cwd: string | undefined,
  overrides: InstanceOverrides,
  startIndex: number,
): ConventionalEntrypointParts {
  const parts: ConventionalEntrypointParts = {
    imports: [],
    registrations: [],
    args: [],
  };

  if (!cwd) return parts;

  let importIndex = startIndex;
  const addConvention = (options: {
    packageRef: string;
    importLine: string;
    arg: string;
    registrationLine?: string;
  }): void => {
    parts.imports.push(options.importLine);
    parts.registrations.push(
      options.registrationLine ??
        `registerPackage("${options.packageRef}", __pkg${importIndex});`,
    );
    parts.args.push(options.arg);
    importIndex += 1;
  };

  const sitePath = `${cwd}/src/site.tsx`;
  if (existsSync(sitePath)) {
    const basePackageRef = overrides.site?.package;
    addConvention({
      packageRef: CONVENTIONAL_SITE_PACKAGE_REF,
      importLine: `import __pkg${importIndex} from "${toImportPath(cwd, sitePath)}";`,
      arg: `sitePackageRef: "${CONVENTIONAL_SITE_PACKAGE_REF}"`,
      registrationLine: `registerConventionalSitePackage(__pkg${importIndex}, ${basePackageRef === undefined ? "undefined" : JSON.stringify(basePackageRef)});`,
    });
  }

  const themePath = `${cwd}/src/theme.css`;
  if (!overrides.site?.themeOverride && existsSync(themePath)) {
    addConvention({
      packageRef: CONVENTIONAL_THEME_PACKAGE_REF,
      importLine: `import __pkg${importIndex} from "${toImportPath(cwd, themePath)}" with { type: "text" };`,
      arg: `themeOverrideRef: "${CONVENTIONAL_THEME_PACKAGE_REF}"`,
    });
  }

  const siteContentPath = `${cwd}/src/site-content.ts`;
  const siteContentConfig = overrides.plugins?.["site-content"];
  if (
    siteContentConfig?.["definitions"] === undefined &&
    existsSync(siteContentPath)
  ) {
    addConvention({
      packageRef: CONVENTIONAL_SITE_CONTENT_PACKAGE_REF,
      importLine: `import __pkg${importIndex} from "${toImportPath(cwd, siteContentPath)}";`,
      arg: `siteContentDefinitionsRef: "${CONVENTIONAL_SITE_CONTENT_PACKAGE_REF}"`,
    });
  }

  return parts;
}

/**
 * Generate a static entrypoint for the bundler from brain.yaml content.
 *
 * Scans the yaml for @-prefixed package references and generates static
 * imports so the bundler can include them. At runtime, resolvePackageRefs
 * in brain-resolver.ts will match these by package name.
 *
 * When `cwd` is provided, conventional local authoring files are also
 * bundled:
 * - `./src/site.tsx`, composed over `site.package` when one is explicit
 * - `./src/theme.css` as an additive theme override layer when
 *   `site.themeOverride` is omitted
 * - `./src/site-content.ts` if `plugins.site-content.definitions` is omitted
 *
 * @param yamlContent - Raw brain.yaml content
 * @returns Generated TypeScript code, or null if yaml is invalid
 */
export function generateEntrypoint(
  yamlContent: string,
  options: GenerateEntrypointOptions = {},
): string | null {
  let overrides;
  try {
    overrides = parseInstanceOverrides(yamlContent);
  } catch {
    return null;
  }

  let brainPackage: string;
  try {
    brainPackage = resolveBrainPackageName(overrides.brain);
  } catch {
    return null;
  }
  if (
    brainPackage === "@rizom/brain/model" &&
    overrides.bundles === undefined
  ) {
    return null;
  }
  const dependencyManifests = collectDefinitionDependencies(
    brainPackage,
    options.cwd,
  );
  const dependencyMetadata = new Map(
    dependencyManifests.map((manifest) => [manifest.name, manifest]),
  );
  const extraImports = [
    ...new Set([
      ...dependencyManifests.map(({ name }) => name),
      ...collectOverridePackageRefs(overrides).filter(
        (ref) => ref !== brainPackage,
      ),
    ]),
  ];
  const packageRefs = buildPackageRefLines(
    extraImports.map((ref) => ({
      ref,
      version:
        dependencyMetadata.get(ref)?.version ??
        tryResolvePackageManifest(ref, options.cwd)?.version,
    })),
  );
  const brainManifest = tryResolvePackageManifest(brainPackage, options.cwd);
  const brainRegistrationLine = brainManifest
    ? `registerPackage(${JSON.stringify(brainManifest.name)}, definition, { version: ${JSON.stringify(brainManifest.version)} });`
    : undefined;
  const conventions = collectConventionalEntrypointParts(
    options.cwd,
    overrides,
    extraImports.length,
  );
  const hasConventions = conventions.args.length > 0;
  const appImports = buildAppImports({
    hasRefs:
      brainRegistrationLine !== undefined ||
      extraImports.length > 0 ||
      conventions.registrations.length > 0,
    hasConventions,
  });

  return buildEntrypointSource({
    brainPackage,
    brainRegistrationLine,
    appImports,
    packageImportLines: [...packageRefs.importLines, ...conventions.imports],
    registrationLines: [
      ...packageRefs.registrationLines,
      ...conventions.registrations,
    ],
    configOverridesVariable: hasConventions
      ? "effectiveOverrides"
      : "overrides",
    ...(hasConventions && {
      effectiveOverridesLine: `const effectiveOverrides = applyConventionalSiteRefs(overrides, { ${conventions.args.join(", ")} });`,
    }),
  });
}
