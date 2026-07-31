import { basename } from "node:path";

export interface DeclarationLeakOptions {
  /** Specifier prefixes that are internal, e.g. ["@brains/"]. */
  internalPrefixes: string[];
  /** Exact specifiers (or specifier roots) that are allowed anyway. */
  allow?: string[];
}

const SPECIFIER_PATTERNS = [
  // import ... from "x" / export ... from "x"
  /\bfrom\s*["']([^"']+)["']/g,
  // import("x") — including inline declaration types
  /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  // bare side-effect import "x"
  /^\s*import\s+["']([^"']+)["']/gm,
];

/**
 * Blank out block and line comments, keeping newlines so the remaining text
 * stays line-aligned. JSDoc `@example` blocks routinely contain import
 * statements that document usage rather than describing this file's own
 * dependencies, and those must not read as leaks.
 */
export function stripDeclarationComments(declaration: string): string {
  return declaration
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (comment) => " ".repeat(comment.length));
}

/**
 * Find internal package specifiers actually imported by a declaration
 * file. Matches import/export specifier positions only, so package
 * names in comments or string literal types do not count.
 */
export function findInternalDeclarationImports(
  declaration: string,
  options: DeclarationLeakOptions,
): string[] {
  const allow = options.allow ?? [];
  const found = new Set<string>();
  const code = stripDeclarationComments(declaration);

  for (const pattern of SPECIFIER_PATTERNS) {
    for (const match of code.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier === undefined) {
        continue;
      }
      const internal = options.internalPrefixes.some((prefix) =>
        specifier.startsWith(prefix),
      );
      const allowed = allow.some(
        (entry) => specifier === entry || specifier.startsWith(`${entry}/`),
      );
      if (internal && !allowed) {
        found.add(specifier);
      }
    }
  }

  return [...found].sort();
}

export function formatDeclarationLeakError(
  declarationPath: string,
  leakedImports: string[],
  hint?: string,
): string {
  const filename = basename(declarationPath);
  const importList = leakedImports
    .map((specifier) => `- ${specifier}`)
    .join("\n");

  return [
    `Generated declaration '${filename}' leaks internal imports:`,
    importList,
    "",
    `Declaration file: ${declarationPath}`,
    ...(hint ? ["", hint] : []),
  ].join("\n");
}
