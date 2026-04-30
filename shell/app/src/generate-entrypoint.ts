import { existsSync } from "fs";
import { relative, sep } from "path";
import { collectOverridePackageRefs } from "./override-package-refs";
import {
  CONVENTIONAL_SITE_CONTENT_PACKAGE_REF,
  CONVENTIONAL_SITE_PACKAGE_REF,
  CONVENTIONAL_THEME_PACKAGE_REF,
  parseInstanceOverrides,
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

  const packageImportLines = extras.map(
    (pkg, i) => `import * as __pkg${i} from "${pkg}";`,
  );

  const registrationLines = extras.map(
    (pkg, i) => `registerPackage("${pkg}", __pkg${i}.default ?? __pkg${i});`,
  );

  const hasRefs = extras.length > 0;

  return [
    `import definition from "${brainPackage}";`,
    `import { resolve, handleCLI, parseInstanceOverrides } from "@brains/app";`,
    ...(hasRefs ? [`import { registerPackage } from "@brains/app";`] : []),
    `import { readFileSync } from "fs";`,
    `import { join } from "path";`,
    ...packageImportLines,
    "",
    ...registrationLines,
    "",
    `const yaml = readFileSync(join(process.cwd(), "brain.yaml"), "utf-8");`,
    `const overrides = parseInstanceOverrides(yaml);`,
    `const config = resolve(definition, process.env, overrides);`,
    `await handleCLI(config);`,
    "",
  ].join("\n");
}

export interface GenerateEntrypointOptions {
  cwd?: string;
}

function toImportPath(fromDir: string, filePath: string): string {
  const normalized = relative(fromDir, filePath).split(sep).join("/");
  return normalized.startsWith(".") ? normalized : `./${normalized}`;
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
  const brainPackage = rawBrain.startsWith("@")
    ? rawBrain
    : `@brains/${rawBrain}`;

  const extraImports = collectOverridePackageRefs(overrides).filter(
    (ref) => ref !== brainPackage,
  );

  const packageImportLines = extraImports.map(
    (pkg, i) => `import * as __pkg${i} from "${pkg}";`,
  );
  const registrationLines = extraImports.map(
    (pkg, i) => `registerPackage("${pkg}", __pkg${i}.default ?? __pkg${i});`,
  );

  const conventionalImports: string[] = [];
  const conventionalRegistrations: string[] = [];
  const conventionalArgs: string[] = [];
  let importIndex = extraImports.length;

  if (options.cwd) {
    const sitePath = `${options.cwd}/src/site.ts`;
    if (!overrides.site?.package && existsSync(sitePath)) {
      conventionalImports.push(
        `import __pkg${importIndex} from "${toImportPath(options.cwd, sitePath)}";`,
      );
      conventionalRegistrations.push(
        `registerPackage("${CONVENTIONAL_SITE_PACKAGE_REF}", __pkg${importIndex});`,
      );
      conventionalArgs.push(
        `sitePackageRef: "${CONVENTIONAL_SITE_PACKAGE_REF}"`,
      );
      importIndex += 1;
    }

    const themePath = `${options.cwd}/src/theme.css`;
    if (!overrides.site?.themeOverride && existsSync(themePath)) {
      conventionalImports.push(
        `import __pkg${importIndex} from "${toImportPath(options.cwd, themePath)}" with { type: "text" };`,
      );
      conventionalRegistrations.push(
        `registerPackage("${CONVENTIONAL_THEME_PACKAGE_REF}", __pkg${importIndex});`,
      );
      conventionalArgs.push(
        `themeOverrideRef: "${CONVENTIONAL_THEME_PACKAGE_REF}"`,
      );
      importIndex += 1;
    }

    const siteContentPath = `${options.cwd}/src/site-content.ts`;
    const siteContentConfig = overrides.plugins?.["site-content"];
    if (
      siteContentConfig?.["definitions"] === undefined &&
      existsSync(siteContentPath)
    ) {
      conventionalImports.push(
        `import __pkg${importIndex} from "${toImportPath(options.cwd, siteContentPath)}";`,
      );
      conventionalRegistrations.push(
        `registerPackage("${CONVENTIONAL_SITE_CONTENT_PACKAGE_REF}", __pkg${importIndex});`,
      );
      conventionalArgs.push(
        `siteContentDefinitionsRef: "${CONVENTIONAL_SITE_CONTENT_PACKAGE_REF}"`,
      );
      importIndex += 1;
    }
  }

  const hasRefs =
    extraImports.length > 0 || conventionalRegistrations.length > 0;
  const hasConventions = conventionalArgs.length > 0;
  const appImports = ["resolve", "handleCLI", "parseInstanceOverrides"];

  if (hasRefs) {
    appImports.push("registerPackage");
  }
  if (hasConventions) {
    appImports.push("applyConventionalSiteRefs");
  }

  return [
    `import definition from "${brainPackage}";`,
    `import { ${appImports.join(", ")} } from "@brains/app";`,
    `import { readFileSync } from "fs";`,
    `import { join } from "path";`,
    ...packageImportLines,
    ...conventionalImports,
    "",
    ...registrationLines,
    ...conventionalRegistrations,
    "",
    `const yaml = readFileSync(join(process.cwd(), "brain.yaml"), "utf-8");`,
    `const overrides = parseInstanceOverrides(yaml);`,
    ...(hasConventions
      ? [
          `const effectiveOverrides = applyConventionalSiteRefs(overrides, { ${conventionalArgs.join(", ")} });`,
        ]
      : []),
    `const config = resolve(definition, process.env, ${hasConventions ? "effectiveOverrides" : "overrides"});`,
    `await handleCLI(config);`,
    "",
  ].join("\n");
}
