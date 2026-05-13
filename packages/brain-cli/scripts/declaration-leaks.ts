import { basename } from "node:path";

const internalBrainSpecifierPattern = /@brains\/[\w-]+(?:\/[\w./-]+)?/g;

export function findInternalBrainImports(declaration: string): string[] {
  const imports = new Set<string>();
  for (const match of declaration.matchAll(internalBrainSpecifierPattern)) {
    imports.add(match[0]);
  }
  return [...imports].sort();
}

export function formatDeclarationLeakError(
  declarationPath: string,
  leakedImports: string[],
): string {
  const filename = basename(declarationPath);
  const importList = leakedImports
    .map((specifier) => `- ${specifier}`)
    .join("\n");

  return [
    `Generated declaration '${filename}' leaks internal @brains/* imports:`,
    importList,
    "",
    `Declaration file: ${declarationPath}`,
    "",
    "If this package is part of the public declaration surface, add it to",
    "packages/brain-cli/scripts/bundle-declarations.mjs declarationInlinePackages.",
    "Otherwise, remove the public export path that exposes it.",
  ].join("\n");
}
