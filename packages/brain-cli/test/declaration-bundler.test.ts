import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  findInternalBrainImports,
  formatDeclarationLeakError,
} from "../scripts/declaration-leaks";

const pkgDir = join(import.meta.dir, "..");

describe("declaration bundler policy", () => {
  it("names the declaration inline allowlist explicitly", () => {
    const source = readFileSync(
      join(pkgDir, "scripts", "bundle-declarations.mjs"),
      "utf-8",
    );

    expect(source).toContain("const declarationInlinePackages");
    expect(source).toContain("public type surface");
    expect(source).not.toContain("const publicPackages");
  });

  it("includes the required internal packages for public declarations", () => {
    const source = readFileSync(
      join(pkgDir, "scripts", "bundle-declarations.mjs"),
      "utf-8",
    );

    for (const packageName of [
      "@brains/app",
      "@brains/plugins",
      "@brains/site-composition",
    ]) {
      expect(source).toContain(`name: "${packageName}"`);
    }
  });

  it("extracts leaked internal @brains import specifiers", () => {
    const declaration = [
      'import type { App } from "@brains/app";',
      'export { SitePackage } from "@brains/site-composition";',
      'declare const loader: typeof import("@brains/deploy-support/origin-ca");',
      "/** Internal package mentioned in generated docs: @brains/theme-base */",
      'import type { App as AppAgain } from "@brains/app";',
    ].join("\n");

    expect(findInternalBrainImports(declaration)).toEqual([
      "@brains/app",
      "@brains/deploy-support/origin-ca",
      "@brains/site-composition",
      "@brains/theme-base",
    ]);
  });

  it("formats actionable internal import leak diagnostics", () => {
    const error = formatDeclarationLeakError("/tmp/brain/interfaces.d.ts", [
      "@brains/site-composition",
      "@brains/theme-base",
    ]);

    expect(error).toContain(
      "Generated declaration 'interfaces.d.ts' leaks internal @brains/* imports:",
    );
    expect(error).toContain("- @brains/site-composition");
    expect(error).toContain("- @brains/theme-base");
    expect(error).toContain("Declaration file: /tmp/brain/interfaces.d.ts");
    expect(error).toContain("declarationInlinePackages");
  });
});
