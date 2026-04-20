import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { getPackage, registerPackage } from "../src/package-registry";
import type { InstanceOverrides } from "../src/instance-overrides";
import {
  CONVENTIONAL_SITE_CONTENT_PACKAGE_REF,
  CONVENTIONAL_SITE_PACKAGE_REF,
  CONVENTIONAL_THEME_PACKAGE_REF,
  registerConventionalSiteTheme,
} from "../src/register-conventional-site-theme";

function clearRegistryEntries(): void {
  registerPackage(CONVENTIONAL_SITE_PACKAGE_REF, undefined);
  registerPackage(CONVENTIONAL_THEME_PACKAGE_REF, undefined);
  registerPackage(CONVENTIONAL_SITE_CONTENT_PACKAGE_REF, undefined);
}

describe("registerConventionalSiteTheme", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `app-conventional-site-${Date.now()}`);
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
      site: { variant: "editorial" },
    };

    const result = await registerConventionalSiteTheme(testDir, overrides);

    expect(result.site).toEqual({
      variant: "editorial",
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

  test("registers ./src/site-content.ts when site-content definitions are omitted", async () => {
    writeFileSync(
      join(testDir, "src/site-content.ts"),
      `export default { namespace: "landing-page", sections: {} };
`,
    );

    const result = await registerConventionalSiteTheme(testDir, {});

    expect(result.plugins).toEqual({
      "site-content": {
        definitions: CONVENTIONAL_SITE_CONTENT_PACKAGE_REF,
      },
    });
    expect(getPackage(CONVENTIONAL_SITE_CONTENT_PACKAGE_REF)).toEqual({
      namespace: "landing-page",
      sections: {},
    });
  });
});
