import { fromYaml } from "@brains/utils";
import { isScopedPackageRef } from "./brain-resolver";

/**
 * Extract all scoped package references from a parsed yaml object.
 * Walks all values recursively and collects unique package names.
 */
function extractPackageRefs(data: unknown): string[] {
  const refs = new Set<string>();

  function walk(value: unknown): void {
    if (typeof value === "string" && isScopedPackageRef(value)) {
      refs.add(value);
    } else if (Array.isArray(value)) {
      for (const item of value) {
        walk(item);
      }
    } else if (typeof value === "object" && value !== null) {
      for (const v of Object.values(value)) {
        walk(v);
      }
    }
  }

  walk(data);
  return [...refs];
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
  let parsed: unknown;
  try {
    parsed = fromYaml(yamlContent);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;

  const obj = parsed as Record<string, unknown>;
  const brainPackage = obj["brain"];
  if (typeof brainPackage !== "string") return null;

  // Find all @-prefixed package refs in plugin config
  const pluginsSection = obj["plugins"];
  const packageRefs = pluginsSection ? extractPackageRefs(pluginsSection) : [];

  // Filter out the brain package itself (already imported)
  const extraImports = packageRefs.filter((ref) => ref !== brainPackage);

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
