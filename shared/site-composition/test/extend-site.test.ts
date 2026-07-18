import { describe, expect, test } from "bun:test";
import { extendSite } from "../src/package";
import type { SitePackage } from "../src/package";

function makeBase(headScripts?: string[]): SitePackage<unknown> {
  return {
    layouts: { default: () => null },
    routes: [],
    entityDisplay: {},
    ...(headScripts ? { headScripts } : {}),
  };
}

describe("extendSite headScripts", () => {
  test("override replaces the base's head scripts instead of stacking", () => {
    // Both rizomBaseSite and createRizomSite emit buildRizomHeadScript();
    // concatenation shipped /boot.js twice, double-binding #themeToggle so
    // the theme toggle became a per-click no-op (dark→light→dark).
    const base = makeBase(['<script src="/boot.js" defer></script>']);
    const site = extendSite(base, {
      headScripts: [
        '<script>profile</script><script src="/boot.js" defer></script>',
      ],
    });
    const head = site.headScripts?.join("\n") ?? "";
    expect(site.headScripts).toHaveLength(1);
    expect(head.split("/boot.js").length - 1).toBe(1);
  });

  test("base head scripts survive when the override omits them", () => {
    const base = makeBase(['<script src="/boot.js" defer></script>']);
    const site = extendSite(base, { routes: [{ id: "home", path: "/" }] });
    expect(site.headScripts).toEqual([
      '<script src="/boot.js" defer></script>',
    ]);
  });
});
