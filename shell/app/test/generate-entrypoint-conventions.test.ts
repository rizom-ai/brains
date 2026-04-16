import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { generateEntrypoint } from "../src/generate-entrypoint";
import {
  CONVENTIONAL_SITE_PACKAGE_REF,
  CONVENTIONAL_THEME_PACKAGE_REF,
} from "../src/instance-overrides";

describe("generateEntrypoint conventions", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `generate-entrypoint-conventions-${Date.now()}`);
    mkdirSync(join(testDir, "src"), { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  test("bundles ./src/site.ts when brain.yaml omits site.package", () => {
    writeFileSync(join(testDir, "src/site.ts"), "export default {};\n");

    const code = generateEntrypoint('brain: "@brains/rover"', { cwd: testDir });

    expect(code).not.toBeNull();
    expect(code).toContain('import __pkg0 from "./src/site.ts"');
    expect(code).toContain(
      `registerPackage("${CONVENTIONAL_SITE_PACKAGE_REF}", __pkg0);`,
    );
    expect(code).toContain(
      `applyConventionalSiteRefs(overrides, { sitePackageRef: "${CONVENTIONAL_SITE_PACKAGE_REF}"`,
    );
  });

  test("bundles ./src/theme.css as a local theme override layer", () => {
    writeFileSync(join(testDir, "src/theme.css"), ":root {}\n");

    const code = generateEntrypoint('brain: "@brains/rover"', { cwd: testDir });

    expect(code).not.toBeNull();
    expect(code).toContain(
      'import __pkg0 from "./src/theme.css" with { type: "text" };',
    );
    expect(code).toContain(
      `registerPackage("${CONVENTIONAL_THEME_PACKAGE_REF}", __pkg0);`,
    );
    expect(code).toContain(
      `applyConventionalSiteRefs(overrides, { themeOverrideRef: "${CONVENTIONAL_THEME_PACKAGE_REF}"`,
    );
  });

  test("explicit site.package suppresses only the site import; local theme override still bundles", () => {
    writeFileSync(join(testDir, "src/site.ts"), "export default {};\n");
    writeFileSync(join(testDir, "src/theme.css"), ":root {}\n");

    const code = generateEntrypoint(
      `brain: "@brains/rover"
site:
  package: "@brains/site-default"
  theme: "@brains/theme-default"
`,
      { cwd: testDir },
    );

    expect(code).not.toBeNull();
    expect(code).not.toContain("./src/site.ts");
    expect(code).toContain("./src/theme.css");
    expect(code).not.toContain(CONVENTIONAL_SITE_PACKAGE_REF);
    expect(code).toContain(CONVENTIONAL_THEME_PACKAGE_REF);
  });
});
