import { existsSync } from "fs";
import { relative, sep } from "path";
import { collectOverridePackageRefs } from "./override-package-refs";
import {
  CONVENTIONAL_SITE_CONTENT_PACKAGE_REF,
  CONVENTIONAL_SITE_PACKAGE_REF,
  CONVENTIONAL_THEME_PACKAGE_REF,
  parseInstanceOverrides,
  type InstanceOverrides,
} from "./instance-overrides";

/**
 * Generate a static entrypoint for a brain model image (no brain.yaml at build time).
 *
 * The brain model package and any extra packages (site themes, etc.) are
 * statically imported so the bundler includes them. At runtime, brain.yaml
 * is read from disk (mounted volume) and configures the instance.
 *
 * @param brainPackage - The brain model package (e.g. "@brains/rover")
 * @param extraPackages - Additional packages to bundle (site themes, etc.)
 * @returns Generated TypeScript code
 */
export function generateModelEntrypoint(
  brainPackage: string,
  extraPackages: string[],
): string {
  const extras = extraPackages.filter((pkg) => pkg !== brainPackage);
  const packageRefs = buildPackageRefLines(extras);
  const appImports = buildAppImports({ hasRefs: extras.length > 0 });

  return buildEntrypointSource({
    brainPackage,
    appImports,
    packageImportLines: packageRefs.importLines,
    registrationLines: packageRefs.registrationLines,
    configOverridesVariable: "overrides",
  });
}

export interface GenerateEntrypointOptions {
  cwd?: string;
}

function toImportPath(fromDir: string, filePath: string): string {
  const normalized = relative(fromDir, filePath).split(sep).join("/");
  return normalized.startsWith(".") ? normalized : `./${normalized}`;
}

function normalizeBrainPackage(rawBrain: string): string {
  return rawBrain.startsWith("@") ? rawBrain : `@brains/${rawBrain}`;
}

function packageImportLine(pkg: string, index: number): string {
  return `import * as __pkg${index} from "${pkg}";`;
}

function packageRegistrationLine(pkg: string, index: number): string {
  return `registerPackage("${pkg}", __pkg${index}.default ?? __pkg${index});`;
}

function buildPackageRefLines(packageRefs: string[]): {
  importLines: string[];
  registrationLines: string[];
} {
  return {
    importLines: packageRefs.map(packageImportLine),
    registrationLines: packageRefs.map(packageRegistrationLine),
  };
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
    appImports.push("applyConventionalSiteRefs");
  }

  return appImports;
}

interface EntrypointSourceOptions {
  brainPackage: string;
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
  }): void => {
    parts.imports.push(options.importLine);
    parts.registrations.push(
      `registerPackage("${options.packageRef}", __pkg${importIndex});`,
    );
    parts.args.push(options.arg);
    importIndex += 1;
  };

  const sitePath = `${cwd}/src/site.ts`;
  if (!overrides.site?.package && existsSync(sitePath)) {
    addConvention({
      packageRef: CONVENTIONAL_SITE_PACKAGE_REF,
      importLine: `import __pkg${importIndex} from "${toImportPath(cwd, sitePath)}";`,
      arg: `sitePackageRef: "${CONVENTIONAL_SITE_PACKAGE_REF}"`,
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
 * - `./src/site.ts` if `site.package` is omitted
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

  const rawBrain = overrides.brain;
  if (typeof rawBrain !== "string") return null;

  // Normalize short names: "rover" → "@brains/rover"
  const brainPackage = normalizeBrainPackage(rawBrain);
  const extraImports = collectOverridePackageRefs(overrides).filter(
    (ref) => ref !== brainPackage,
  );
  const packageRefs = buildPackageRefLines(extraImports);
  const conventions = collectConventionalEntrypointParts(
    options.cwd,
    overrides,
    extraImports.length,
  );
  const hasConventions = conventions.args.length > 0;
  const appImports = buildAppImports({
    hasRefs: extraImports.length > 0 || conventions.registrations.length > 0,
    hasConventions,
  });

  return buildEntrypointSource({
    brainPackage,
    appImports,
    packageImportLines: [...packageRefs.importLines, ...conventions.imports],
    registrationLines: [
      ...packageRefs.registrationLines,
      ...conventions.registrations,
    ],
    configOverridesVariable: hasConventions ? "effectiveOverrides" : "overrides",
    ...(hasConventions && {
      effectiveOverridesLine: `const effectiveOverrides = applyConventionalSiteRefs(overrides, { ${conventions.args.join(", ")} });`,
    }),
  });
}
