import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  getPackage,
  registerPackage,
  type InstanceOverrides,
} from "@brains/app";
import {
  registerConventionalSiteTheme,
  CONVENTIONAL_SITE_PACKAGE_REF,
  CONVENTIONAL_THEME_PACKAGE_REF,
} from "../src/lib/register-conventional-site-theme";

function clearRegistryEntries(): void {
  registerPackage(CONVENTIONAL_SITE_PACKAGE_REF, undefined);
  registerPackage(CONVENTIONAL_THEME_PACKAGE_REF, undefined);
}

describe("registerConventionalSiteTheme", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `brain-conventional-site-${Date.now()}`);
    mkdirSync(join(testDir, "src"), { recursive: true });
    clearRegistryEntries();
  });

  afterEach(() => {
    clearRegistryEntries();
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  test("registers ./src/site.ts when site.package is omitted", async () => {
    writeFileSync(
      join(testDir, "src/site.ts"),
      `export default {
        layouts: {},
        routes: [],
        plugin() {
          return {
            id: "test-site",
            version: "1.0.0",
            description: "test site",
            packageName: "@test/site",
            type: "service",
            async register() {
              return { tools: [], resources: [] };
            },
          };
        },
        entityDisplay: {},
      };
      `,
    );

    const overrides: InstanceOverrides = {
      site: { variant: "foundation" },
    };

    const result = await registerConventionalSiteTheme(testDir, overrides);

    expect(result.site).toEqual({
      variant: "foundation",
      package: CONVENTIONAL_SITE_PACKAGE_REF,
    });
    expect(getPackage(CONVENTIONAL_SITE_PACKAGE_REF)).toBeDefined();
  });

  test("registers ./src/theme.css as a local theme override layer", async () => {
    const themeCss = ":root { --color-brand: hotpink; }";
    writeFileSync(join(testDir, "src/theme.css"), themeCss);

    const result = await registerConventionalSiteTheme(testDir, {});

    expect(result.site).toEqual({
      themeOverride: CONVENTIONAL_THEME_PACKAGE_REF,
    });
    expect(getPackage(CONVENTIONAL_THEME_PACKAGE_REF)).toBe(themeCss);
  });

  test("explicit site.package still wins, while local theme.css layers after explicit site.theme", async () => {
    writeFileSync(
      join(testDir, "src/site.ts"),
      "export default { layouts: {}, routes: [], plugin() { return { id: 'x', version: '1.0.0', description: 'x', packageName: '@x/x', type: 'service', async register() { return { tools: [], resources: [] }; } }; }, entityDisplay: {} };",
    );
    writeFileSync(
      join(testDir, "src/theme.css"),
      ":root { --color-brand: cyan; }",
    );

    const overrides: InstanceOverrides = {
      site: {
        package: "@brains/site-explicit",
        theme: "@brains/theme-explicit",
        variant: "work",
      },
    };

    const result = await registerConventionalSiteTheme(testDir, overrides);

    expect(result).toEqual({
      site: {
        package: "@brains/site-explicit",
        theme: "@brains/theme-explicit",
        themeOverride: CONVENTIONAL_THEME_PACKAGE_REF,
        variant: "work",
      },
    });
    expect(getPackage(CONVENTIONAL_SITE_PACKAGE_REF)).toBeUndefined();
    expect(getPackage(CONVENTIONAL_THEME_PACKAGE_REF)).toBe(
      ":root { --color-brand: cyan; }",
    );
  });

  test("only registers the missing half when one explicit site field is present", async () => {
    const themeCss = ":root { --color-brand: lime; }";
    writeFileSync(join(testDir, "src/theme.css"), themeCss);

    const overrides: InstanceOverrides = {
      site: {
        package: "@brains/site-explicit",
        variant: "ai",
      },
    };

    const result = await registerConventionalSiteTheme(testDir, overrides);

    expect(result.site).toEqual({
      package: "@brains/site-explicit",
      variant: "ai",
      themeOverride: CONVENTIONAL_THEME_PACKAGE_REF,
    });
    expect(getPackage(CONVENTIONAL_SITE_PACKAGE_REF)).toBeUndefined();
    expect(getPackage(CONVENTIONAL_THEME_PACKAGE_REF)).toBe(themeCss);
  });

  test("explicit site.themeOverride suppresses the local theme convention", async () => {
    writeFileSync(
      join(testDir, "src/theme.css"),
      ":root { --color-brand: chartreuse; }",
    );

    const overrides: InstanceOverrides = {
      site: {
        themeOverride: "body { color: rebeccapurple; }",
      },
    };

    const result = await registerConventionalSiteTheme(testDir, overrides);

    expect(result).toEqual(overrides);
    expect(getPackage(CONVENTIONAL_THEME_PACKAGE_REF)).toBeUndefined();
  });
});
