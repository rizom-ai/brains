import { describe, expect, test } from "bun:test";
import {
  findInternalDeclarationImports,
  formatDeclarationLeakError,
} from "../src/declaration-leaks";

const OPTS = { internalPrefixes: ["@brains/", "@rizom/"] };

describe("findInternalDeclarationImports", () => {
  test("finds import and export specifiers", () => {
    const declaration = [
      'import { A } from "@brains/utils";',
      'import type { B } from "@rizom/other";',
      'export { C } from "@brains/templates";',
      'declare const d: import("@rizom/inline").D;',
      'import "@brains/side-effect";',
    ].join("\n");

    expect(findInternalDeclarationImports(declaration, OPTS)).toEqual([
      "@brains/side-effect",
      "@brains/templates",
      "@brains/utils",
      "@rizom/inline",
      "@rizom/other",
    ]);
  });

  test("ignores package names in comments and string literal types", () => {
    const declaration = [
      "/** Mirrors types from @brains/site-composition on purpose. */",
      'export declare const label = "@rizom/site-rizom";',
      'import { X } from "preact";',
    ].join("\n");

    expect(findInternalDeclarationImports(declaration, OPTS)).toEqual([]);
  });

  test("ignores import statements written inside JSDoc examples", () => {
    const declaration = [
      "/**",
      " * Build a brain definition.",
      " *",
      " * @example",
      " * ```ts",
      ' * import { defineBrain } from "@brains/app";',
      ' * import { notePlugin } from "@brains/note";',
      " * ```",
      " */",
      "export declare function defineBrain(definition: unknown): unknown;",
      '// import { Sneaky } from "@brains/line-comment";',
    ].join("\n");

    expect(findInternalDeclarationImports(declaration, OPTS)).toEqual([]);
  });

  test("still finds real imports next to commented ones", () => {
    const declaration = [
      '/** @example import { A } from "@brains/doc-only"; */',
      'import { B } from "@brains/real";',
    ].join("\n");

    expect(findInternalDeclarationImports(declaration, OPTS)).toEqual([
      "@brains/real",
    ]);
  });

  test("respects the allow list", () => {
    const declaration = 'import { A } from "@rizom/ui";';
    expect(
      findInternalDeclarationImports(declaration, {
        ...OPTS,
        allow: ["@rizom/ui"],
      }),
    ).toEqual([]);
    expect(findInternalDeclarationImports(declaration, OPTS)).toEqual([
      "@rizom/ui",
    ]);
  });
});

describe("formatDeclarationLeakError", () => {
  test("names the file and the leaked specifiers", () => {
    const message = formatDeclarationLeakError("/tmp/dist/index.d.ts", [
      "@brains/utils",
    ]);
    expect(message).toContain("index.d.ts");
    expect(message).toContain("@brains/utils");
  });
});
