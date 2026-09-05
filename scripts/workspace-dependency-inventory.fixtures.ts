/**
 * Sources the workspace-dependency scanner reads in its unit cases.
 *
 * Outside `*.test.ts` because the scanner's repository-wide sweep reads every
 * tracked file: fixtures written inline would be imports of this package.
 */

/** Static, bare, and dynamic imports, plus a deep subpath. */
export const realImports: string = [
  `import { a } from "@brains/alpha";`,
  `import type { B } from "@brains/beta/deep/subpath";`,
  `import {`,
  `  c,`,
  `} from "@rizom/gamma";`,
  `export { d } from "@brains/delta";`,
  `import "@brains/epsilon";`,
  `const { f } = await import("@brains/zeta");`,
].join("\n");

/**
 * Import statements that are data, not dependencies.
 *
 * Taken from `build-tools/test/declaration-leaks.test.ts`, which tests an
 * import scanner and so is full of import statements inside string literals.
 */
export const importsInsideStrings: string = [
  `const cases = [`,
  `  'import type { B } from "@rizom/other";',`,
  `  "@rizom/other",`,
  `  '// import { Sneaky } from "@brains/line-comment";',`,
  `  '/** @example import { A } from "@brains/doc-only"; */',`,
  `];`,
].join("\n");

/** Imports a reader would skip, and so should the scanner. */
export const importsInComments: string = [
  `// import { Skipped } from "@brains/commented-out";`,
  `/* import { Also } from "@brains/block-comment"; */`,
  `/**`,
  ` * @example import { Doc } from "@brains/jsdoc";`,
  ` */`,
  `import { real } from "@brains/kept";`,
].join("\n");

/**
 * Generated code held in a template literal.
 *
 * `brain-cli`'s `init` command scaffolds a site file this way, so a line
 * beginning `import … from "@rizom/site"` is output rather than an import.
 */
export const importsInsideTemplate: string = [
  'const scaffold = `import { defineSite } from "@rizom/site";',
  "",
  "export default defineSite({});",
  "`;",
  `import { real } from "@brains/kept";`,
].join("\n");

/**
 * A multi-line import followed by `import.meta` in a later argument.
 *
 * The scan must stop at the statement it began in, or it runs on to whatever
 * `from "…"` appears next.
 */
export const importFollowedByImportMeta: string = [
  `import {`,
  `  thing,`,
  `} from "@brains/first";`,
  ``,
  `const root = join(`,
  `  import.meta.dir,`,
  `  "..",`,
  `);`,
].join("\n");

/** Packages outside the workspace scopes are not this scanner's business. */
export const externalImports: string = [
  `import { z } from "zod";`,
  `import { readFileSync } from "node:fs";`,
  `import { thing } from "@modelcontextprotocol/server";`,
].join("\n");
