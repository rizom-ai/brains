import { describe, expect, it } from "bun:test";
import {
  findInternalDeclarationImports,
  formatDeclarationLeakError,
} from "@brains/build-tools";

describe("declaration bundler policy", () => {
  it("extracts leaked internal @brains import specifiers", () => {
    const declaration = [
      'import type { App } from "@brains/app";',
      'export { SitePackage } from "@brains/site-composition";',
      'declare const loader: typeof import("@brains/deploy-support/origin-ca");',
      "/** Internal package mentioned in generated docs: @brains/theme-base */",
      'import type { App as AppAgain } from "@brains/app";',
    ].join("\n");

    expect(
      findInternalDeclarationImports(declaration, {
        internalPrefixes: ["@brains/"],
      }),
    ).toEqual([
      "@brains/app",
      "@brains/deploy-support/origin-ca",
      "@brains/site-composition",
    ]);
  });

  it("formats actionable internal import leak diagnostics", () => {
    const error = formatDeclarationLeakError(
      "/tmp/brain/interfaces.d.ts",
      ["@brains/site-composition", "@brains/theme-base"],
      "add it to packages/brain-cli/scripts/bundle-declarations.mjs declarationInlinePackages.",
    );

    expect(error).toContain(
      "Generated declaration 'interfaces.d.ts' leaks internal imports:",
    );
    expect(error).toContain("- @brains/site-composition");
    expect(error).toContain("- @brains/theme-base");
    expect(error).toContain("Declaration file: /tmp/brain/interfaces.d.ts");
    expect(error).toContain("declarationInlinePackages");
  });
});
