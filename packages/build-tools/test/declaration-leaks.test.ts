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
