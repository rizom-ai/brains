import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateEntrypoint } from "../src/generate-entrypoint";

const temporaryDirectories: string[] = [];

function createPackage(
  root: string,
  name: string,
  manifest: Record<string, unknown>,
): void {
  const directory = join(root, "node_modules", ...name.split("/"));
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    join(directory, "package.json"),
    JSON.stringify({
      name,
      version: "0.1.0",
      type: "module",
      exports: { ".": "./index.js" },
      ...manifest,
    }),
  );
  writeFileSync(join(directory, "index.js"), "export default {};\n");
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

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

  test("should not execute removed external plugin declarations", () => {
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
    expect(code).not.toContain(
      'import * as __pkg0 from "@rizom/brain-plugin-calendar"',
    );
    expect(code).not.toContain(
      'registerPackage("@rizom/brain-plugin-calendar"',
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

  test("registers external brain and definition dependency metadata", () => {
    const root = mkdtempSync(join(tmpdir(), "brain-entrypoint-metadata-"));
    temporaryDirectories.push(root);
    createPackage(root, "@rizom/brain", { version: "0.2.0-alpha.256" });
    createPackage(root, "@fixture/reader-brain", {
      version: "0.2.0",
      dependencies: { "@fixture/reading-service": "0.1.0" },
      peerDependencies: {
        "@rizom/brain": ">=0.2.0-alpha.0 <0.3.0",
      },
    });
    createPackage(root, "@fixture/reading-service", {
      peerDependencies: { "@rizom/brain": ">=0.2.0-alpha.0 <0.3.0" },
    });

    const code = generateEntrypoint("brain: '@fixture/reader-brain'", {
      cwd: root,
    });

    expect(code).toContain(
      'import * as __pkg0 from "@fixture/reading-service"',
    );
    expect(code).toContain(
      'registerPackage("@fixture/reader-brain", definition, { version: "0.2.0" })',
    );
    expect(code).toContain(
      'registerPackage("@fixture/reading-service", __pkg0.default ?? __pkg0, { version: "0.1.0" })',
    );
  });
});
