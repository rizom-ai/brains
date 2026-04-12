import { describe, expect, test } from "bun:test";
import { generateModelEntrypoint } from "../src/generate-entrypoint";

describe("generateModelEntrypoint", () => {
  test("should generate entrypoint for brain model", () => {
    const code = generateModelEntrypoint("@brains/rover", []);

    expect(code).toContain('import definition from "@brains/rover"');
    expect(code).toContain("parseInstanceOverrides");
    expect(code).toContain("resolve(definition");
    expect(code).toContain("handleCLI(config)");
  });

  test("should read brain.yaml at runtime", () => {
    const code = generateModelEntrypoint("@brains/rover", []);

    expect(code).toContain('readFileSync(join(process.cwd(), "brain.yaml")');
  });

  test("should register extra packages", () => {
    const code = generateModelEntrypoint("@brains/rover", [
      "@example/site-alpha",
      "@example/site-beta",
    ]);

    expect(code).toContain('import __pkg0 from "@example/site-alpha"');
    expect(code).toContain('import __pkg1 from "@example/site-beta"');
    expect(code).toContain('registerPackage("@example/site-alpha", __pkg0)');
    expect(code).toContain('registerPackage("@example/site-beta", __pkg1)');
  });

  test("should not include registerPackage when no extra packages", () => {
    const code = generateModelEntrypoint("@brains/rover", []);

    expect(code).not.toContain("registerPackage");
    expect(code).not.toContain("__pkg");
  });

  test("should filter out the brain package from extras", () => {
    const code = generateModelEntrypoint("@brains/rover", [
      "@brains/rover",
      "@example/site-alpha",
    ]);

    // Rover imported once as definition, not as __pkg
    const defImports =
      code.match(/import definition from "@brains\/rover"/g) ?? [];
    expect(defImports).toHaveLength(1);

    // Only example site as __pkg0
    expect(code).toContain('import __pkg0 from "@example/site-alpha"');
    expect(code).not.toContain("__pkg1");
  });
});
