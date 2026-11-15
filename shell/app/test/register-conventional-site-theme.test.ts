import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createTemplate, withSiteRuntime } from "@brains/plugins";
import { createPluginHarness, installSiteRuntime } from "@brains/plugins/test";
import { z } from "@brains/utils/zod";
import { getPackage, registerPackage } from "../src/package-registry";
import type { InstanceOverrides } from "../src/instance-overrides";
import { sitePackageSchema } from "../src/site-package";
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
  let testSequence = 0;

  beforeEach(() => {
    testDir = join(
      tmpdir(),
      `app-conventional-site-${Date.now()}-${testSequence++}`,
    );
    mkdirSync(join(testDir, "src"), { recursive: true });
    clearRegistryEntries();
  });

  afterEach(() => {
    clearRegistryEntries();
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  test("registers ./src/site.tsx when site.package is omitted", async () => {
    writeFileSync(
      join(testDir, "src/site.tsx"),
      `export default {
        layouts: {},
        routes: [],
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

  test("composes ./src/site.tsx over an explicit base site package", async () => {
    // The base site's templates read its config, as its plugin did.
    registerPackage(
      "@brains/site-explicit",
      withSiteRuntime(
        {
          layouts: { default: () => null },
          routes: [{ id: "home", path: "/", sections: [] }],
          entityDisplay: { post: { label: "Post" } },
        },
        {
          id: "base-site",
          config: z.object({ source: z.string(), variant: z.string() }),
          templates: ({ config }) => ({
            home: createTemplate({
              name: "home",
              description: `${config.source}/${config.variant}`,
              schema: z.object({}),
              requiredPermission: "public",
            }),
          }),
        },
      ),
    );
    writeFileSync(
      join(testDir, "src/site.tsx"),
      `export default {
        layouts: { default: () => null },
        routes: [{ id: "home", path: "/", sections: [{ id: "hero", template: "local:hero" }] }],
        entityDisplay: { post: { label: "Essay" } },
        pluginConfig: { source: "local" },
      };
      `,
    );

    const result = await registerConventionalSiteTheme(testDir, {
      site: {
        package: "@brains/site-explicit",
        theme: "@brains/theme-explicit",
        variant: "editorial",
      },
    });

    expect(result.site).toEqual({
      package: CONVENTIONAL_SITE_PACKAGE_REF,
      theme: "@brains/theme-explicit",
      variant: "editorial",
    });
    const composedSite = sitePackageSchema.parse(
      getPackage(CONVENTIONAL_SITE_PACKAGE_REF),
    );
    expect(composedSite).toMatchObject({
      routes: [
        {
          id: "home",
          sections: [{ id: "hero", template: "local:hero" }],
        },
      ],
      entityDisplay: { post: { label: "Essay" } },
    });
    expect(composedSite.layouts["default"]).toBeFunction();
    // The local site's pluginConfig reaches the base's runtime, under
    // brain.yaml's site settings.
    const harness = createPluginHarness();
    installSiteRuntime(harness, composedSite, {
      packageName: CONVENTIONAL_SITE_PACKAGE_REF,
      settings: { variant: "editorial" },
    });
    expect(harness.getTemplates().get("base-site:home")?.description).toBe(
      "local/editorial",
    );
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
