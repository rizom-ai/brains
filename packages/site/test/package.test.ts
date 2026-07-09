import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { NavigationSlots, type SiteDefinition } from "../src";

describe("@rizom/site authoring SDK", () => {
  test("exposes zod-free authoring primitives", () => {
    expect(NavigationSlots).toEqual(["primary", "secondary"]);

    const site: SiteDefinition = {
      layouts: { default: {} },
      routes: [{ id: "home", path: "/", sections: [] }],
      entityDisplay: {},
      themeOverride: ":root { --accent: currentColor; }",
    };

    expect(site.routes[0]?.id).toBe("home");
  });

  test("keeps runtime framework dependencies out of the public SDK manifest", () => {
    const manifest = JSON.parse(
      readFileSync(join(import.meta.dir, "../package.json"), "utf8"),
    );

    const runtimeManifest = {
      dependencies: manifest.dependencies,
      peerDependencies: manifest.peerDependencies,
      exports: manifest.exports,
    };

    expect(JSON.stringify(runtimeManifest)).not.toContain("@brains/");
    expect(manifest.peerDependencies).toEqual({ preact: "^10.27.2" });
  });
});
