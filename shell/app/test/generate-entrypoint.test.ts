import { describe, expect, test } from "bun:test";
import { generateEntrypoint } from "../src/generate-entrypoint";

describe("generateEntrypoint", () => {
  test("should generate basic entrypoint from brain.yaml", () => {
    const yaml = `brain: brain
bundles: [core]`;
    const code = generateEntrypoint(yaml);

    expect(code).not.toBeNull();
    expect(code).toContain('import definition from "@rizom/brain/model"');
    expect(code).toContain("parseInstanceOverrides");
    expect(code).toContain("resolve(definition");
    expect(code).toContain("handleCLI(config)");
  });

  test("should include static imports for @-prefixed plugin values", () => {
    const yaml = `
brain: brain
bundles: [core]
plugins:
  site-builder:
    themeCSS: "@rizom/theme-default"
`;
    const code = generateEntrypoint(yaml);

    expect(code).not.toBeNull();
    expect(code).toContain('import * as __pkg0 from "@rizom/theme-default"');
    expect(code).toContain(
      'registerPackage("@rizom/theme-default", __pkg0.default ?? __pkg0)',
    );
  });

  test("should handle multiple package refs across plugins", () => {
    const yaml = `
brain: brain
bundles: [core]
plugins:
  site-builder:
    themeCSS: "@brains/theme-pink"
    layout: "@brains/site-personal"
`;
    const code = generateEntrypoint(yaml);

    expect(code).not.toBeNull();
    expect(code).toContain('import * as __pkg0 from "@brains/theme-pink"');
    expect(code).toContain('import * as __pkg1 from "@brains/site-personal"');
    expect(code).toContain(
      'registerPackage("@brains/theme-pink", __pkg0.default ?? __pkg0)',
    );
    expect(code).toContain(
      'registerPackage("@brains/site-personal", __pkg1.default ?? __pkg1)',
    );
  });

  test("should include static imports for external plugin declarations", () => {
    const yaml = `
brain: brain
bundles: [core]
plugins:
  calendar:
    package: "@rizom/brain-plugin-calendar"
    config:
      timezone: UTC
`;
    const code = generateEntrypoint(yaml);

    expect(code).not.toBeNull();
    expect(code).toContain(
      'import * as __pkg0 from "@rizom/brain-plugin-calendar"',
    );
    expect(code).toContain(
      'registerPackage("@rizom/brain-plugin-calendar", __pkg0.default ?? __pkg0)',
    );
  });

  test("should not duplicate brain package in imports", () => {
    const yaml = `
brain: brain
bundles: [core]
plugins:
  a2a:
    someRef: "@rizom/brain/model"
`;
    const code = generateEntrypoint(yaml);

    expect(code).not.toBeNull();
    // Brain package imported once as definition, not again as __pkg
    const definitionImports =
      code?.match(/import definition from "@rizom\/brain\/model"/g) ?? [];
    expect(definitionImports).toHaveLength(1);
    expect(code).not.toContain("__pkg0");
  });

  test("should not generate package imports when no refs exist", () => {
    const yaml = `
brain: brain
bundles: [core]
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
brain: brain
bundles: [core]
site:
  package: "@brains/site-default"
`;
    const code = generateEntrypoint(yaml);

    expect(code).not.toBeNull();
    expect(code).toContain('import * as __pkg0 from "@brains/site-default"');
    expect(code).toContain(
      'registerPackage("@brains/site-default", __pkg0.default ?? __pkg0)',
    );
  });

  test("should include both site and plugin package refs", () => {
    const yaml = `
brain: brain
bundles: [core]
site:
  package: "@brains/site-default"
plugins:
  site-builder:
    themeCSS: "@brains/theme-override"
`;
    const code = generateEntrypoint(yaml);

    expect(code).not.toBeNull();
    expect(code).toContain('import * as __pkg0 from "@brains/site-default"');
    expect(code).toContain('import * as __pkg1 from "@brains/theme-override"');
  });

  test("should include a static import for site.theme package refs", () => {
    const yaml = `
brain: brain
bundles: [core]
site:
  package: "@brains/site-default"
  theme: "@rizom/theme-default"
`;
    const code = generateEntrypoint(yaml);

    expect(code).not.toBeNull();
    expect(code).toContain('import * as __pkg1 from "@rizom/theme-default"');
    expect(code).toContain(
      'registerPackage("@rizom/theme-default", __pkg1.default ?? __pkg1)',
    );
  });

  test("should import registerPackage from @brains/app", () => {
    const yaml = `
brain: brain
bundles: [core]
plugins:
  site-builder:
    themeCSS: "@brains/theme-test"
`;
    const code = generateEntrypoint(yaml);

    expect(code).toContain("registerPackage");
    expect(code).toContain('from "@brains/app"');
  });
});
