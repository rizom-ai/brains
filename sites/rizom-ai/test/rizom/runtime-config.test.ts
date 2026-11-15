import { describe, expect, test } from "bun:test";
import site from "../../src";
import { installedSite } from "../installed-site";
import { createPluginHarness, installSiteRuntime } from "@brains/plugins/test";

describe("rizom site config validation", () => {
  test("accepts a theme package name", () => {
    expect(() =>
      installSiteRuntime(createPluginHarness(), site, {
        packageName: "@rizom/site-rizom-ai",
        settings: { theme: "@brains/theme-rizom" },
      }),
    ).not.toThrow();
    expect(installedSite().getTemplates().has("rizom:opening")).toBe(true);
  });

  test("rejects a non-string theme instead of dropping it", () => {
    expect(() =>
      installSiteRuntime(createPluginHarness(), site, {
        packageName: "@rizom/site-rizom-ai",
        settings: { theme: 42 },
      }),
    ).toThrow(/theme/);
  });
});
