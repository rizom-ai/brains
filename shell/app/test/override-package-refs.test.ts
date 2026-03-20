import { describe, expect, test } from "bun:test";
import { collectOverridePackageRefs } from "../src/override-package-refs";

describe("collectOverridePackageRefs", () => {
  test("should collect site package ref from top-level site key", () => {
    const refs = collectOverridePackageRefs({
      site: "@brains/site-mylittlephoney",
    });
    expect(refs).toContain("@brains/site-mylittlephoney");
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
      site: "@brains/site-mylittlephoney",
      plugins: {
        "site-builder": {
          themeCSS: "@brains/theme-override",
        },
      },
    });
    expect(refs).toContain("@brains/site-mylittlephoney");
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

  test("should ignore non-scoped-package strings", () => {
    const refs = collectOverridePackageRefs({
      site: "not-a-package",
      plugins: {
        matrix: {
          userId: "@user:server.com",
        },
      },
    });
    expect(refs).toEqual([]);
  });

  test("should handle missing plugins and site", () => {
    const refs = collectOverridePackageRefs({});
    expect(refs).toEqual([]);
  });
});
