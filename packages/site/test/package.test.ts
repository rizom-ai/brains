import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { createElement as h } from "react";
import { NavigationSlots, type SiteDefinition } from "../src";

describe("@rizom/site authoring SDK", () => {
  test("exposes canonical authoring primitives", () => {
    expect(NavigationSlots).toEqual(["primary", "secondary"]);

    const site: SiteDefinition = {
      layouts: { default: () => h("main", null) },
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
    expect(manifest.dependencies).toEqual({ zod: "^4.1.8" });
    expect(manifest.peerDependencies).toEqual({
      react: "^19.2.7",
      "react-dom": "^19.2.7",
    });
  });
});
