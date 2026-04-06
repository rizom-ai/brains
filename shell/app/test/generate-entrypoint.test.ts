import { describe, expect, test } from "bun:test";
import { generateEntrypoint } from "../src/generate-entrypoint";

describe("generateEntrypoint", () => {
  test("should generate basic entrypoint from brain.yaml", () => {
    const yaml = 'brain: "@brains/rover"';
    const code = generateEntrypoint(yaml);

    expect(code).not.toBeNull();
    expect(code).toContain('import definition from "@brains/rover"');
    expect(code).toContain("parseInstanceOverrides");
    expect(code).toContain("resolve(definition");
    expect(code).toContain("handleCLI(config)");
  });

  test("should include static imports for @-prefixed plugin values", () => {
    const yaml = `
brain: "@brains/rover"
plugins:
  site-builder:
    themeCSS: "@brains/theme-editorial"
`;
    const code = generateEntrypoint(yaml);

    expect(code).not.toBeNull();
    expect(code).toContain('import __pkg0 from "@brains/theme-editorial"');
    expect(code).toContain(
      'registerPackage("@brains/theme-editorial", __pkg0)',
    );
  });

  test("should handle multiple package refs across plugins", () => {
    const yaml = `
brain: "@brains/rover"
plugins:
  site-builder:
    themeCSS: "@brains/theme-pink"
    layout: "@brains/layout-minimal"
`;
    const code = generateEntrypoint(yaml);

    expect(code).not.toBeNull();
    expect(code).toContain('import __pkg0 from "@brains/theme-pink"');
    expect(code).toContain('import __pkg1 from "@brains/layout-minimal"');
    expect(code).toContain('registerPackage("@brains/theme-pink", __pkg0)');
    expect(code).toContain('registerPackage("@brains/layout-minimal", __pkg1)');
  });

  test("should not duplicate brain package in imports", () => {
    const yaml = `
brain: "@brains/rover"
plugins:
  a2a:
    someRef: "@brains/rover"
`;
    const code = generateEntrypoint(yaml);

    expect(code).not.toBeNull();
    // Brain package imported once as definition, not again as __pkg
    const definitionImports =
      code?.match(/import definition from "@brains\/rover"/g) ?? [];
    expect(definitionImports).toHaveLength(1);
    expect(code).not.toContain("__pkg0");
  });

  test("should not generate package imports when no refs exist", () => {
    const yaml = `
brain: "@brains/rover"
plugins:
  webserver:
    port: 9090
`;
    const code = generateEntrypoint(yaml);

    expect(code).not.toBeNull();
    expect(code).not.toContain("__pkg");
    expect(code).not.toContain("registerPackage");
  });

  test("should return null for invalid yaml", () => {
    expect(generateEntrypoint("not: valid: yaml: {{")).toBeNull();
  });

  test("should return null when brain field is missing", () => {
    expect(generateEntrypoint("name: test")).toBeNull();
  });

  test("should include static import for top-level site package ref", () => {
    const yaml = `
brain: "@brains/rover"
site: "@brains/site-default"
`;
    const code = generateEntrypoint(yaml);

    expect(code).not.toBeNull();
    expect(code).toContain('import __pkg0 from "@brains/site-default"');
    expect(code).toContain('registerPackage("@brains/site-default", __pkg0)');
  });

  test("should include both site and plugin package refs", () => {
    const yaml = `
brain: "@brains/rover"
site: "@brains/site-default"
plugins:
  site-builder:
    themeCSS: "@brains/theme-override"
`;
    const code = generateEntrypoint(yaml);

    expect(code).not.toBeNull();
    expect(code).toContain('import __pkg0 from "@brains/theme-override"');
    expect(code).toContain('import __pkg1 from "@brains/site-default"');
  });

  test("should import registerPackage from @brains/app", () => {
    const yaml = `
brain: "@brains/rover"
plugins:
  site-builder:
    themeCSS: "@brains/theme-test"
`;
    const code = generateEntrypoint(yaml);

    expect(code).toContain('import { registerPackage } from "@brains/app"');
  });
});
