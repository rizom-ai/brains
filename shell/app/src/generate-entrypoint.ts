import { collectOverridePackageRefs } from "./override-package-refs";
import { parseInstanceOverrides } from "./instance-overrides";

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
    (pkg, i) => `import __pkg${i} from "${pkg}";`,
  );

  const registrationLines = extras.map(
    (pkg, i) => `registerPackage("${pkg}", __pkg${i});`,
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

/**
 * Generate a static entrypoint for the bundler from brain.yaml content.
 *
 * Scans the yaml for @-prefixed package references and generates static
 * imports so the bundler can include them. At runtime, resolvePackageRefs
 * in brain-resolver.ts will match these by package name.
 *
 * @param yamlContent - Raw brain.yaml content
 * @returns Generated TypeScript code, or null if yaml is invalid
 */
export function generateEntrypoint(yamlContent: string): string | null {
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

  // Find all @-prefixed package refs in the validated override shape.
  // TODO: Currently only supports workspace packages. Eventually site/plugin
  // refs should resolve to git repos, npm packages, or URLs.
  const extraImports = collectOverridePackageRefs(overrides).filter(
    (ref) => ref !== brainPackage,
  );

  // Generate static imports for package refs so the bundler includes them
  const packageImportLines = extraImports.map(
    (pkg, i) => `import __pkg${i} from "${pkg}";`,
  );

  // Register them via the same package registry used in dev mode
  const registrationLines = extraImports.map(
    (pkg, i) => `registerPackage("${pkg}", __pkg${i});`,
  );

  const hasRefs = extraImports.length > 0;

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
