import { describe, expect, test } from "bun:test";
import { collectOverridePackageRefs } from "../src/override-package-refs";

describe("collectOverridePackageRefs", () => {
  test("should collect site package ref from site.package", () => {
    const refs = collectOverridePackageRefs({
      site: { package: "@brains/site-default" },
    });
    expect(refs).toContain("@brains/site-default");
  });

  test("should collect plugin config package refs", () => {
    const refs = collectOverridePackageRefs({
      plugins: {
        "site-builder": {
          themeCSS: "@brains/theme-pink",
        },
      },
    });
    expect(refs).toContain("@brains/theme-pink");
  });

  test("should collect both site and plugin refs", () => {
    const refs = collectOverridePackageRefs({
      site: {
        package: "@brains/site-default",
        themeOverride: "@brains/theme-rizom-local",
      },
      plugins: {
        "site-builder": {
          themeCSS: "@brains/theme-override",
        },
      },
    });
    expect(refs).toContain("@brains/site-default");
    expect(refs).toContain("@brains/theme-rizom-local");
    expect(refs).toContain("@brains/theme-override");
  });

  test("should return empty array when no package refs exist", () => {
    const refs = collectOverridePackageRefs({
      logLevel: "debug",
      plugins: {
        webserver: { port: 9090 },
      },
    });
    expect(refs).toEqual([]);
  });

  test("should ignore non-scoped-package strings in site.package", () => {
    const refs = collectOverridePackageRefs({
      site: { package: "not-a-package" },
      plugins: {
        discord: {
          botToken: "some-token",
        },
      },
    });
    expect(refs).toEqual([]);
  });

  test("should handle an empty site block", () => {
    const refs = collectOverridePackageRefs({
      site: {},
    });
    expect(refs).toEqual([]);
  });

  test("should handle missing plugins and site", () => {
    const refs = collectOverridePackageRefs({});
    expect(refs).toEqual([]);
  });
});
