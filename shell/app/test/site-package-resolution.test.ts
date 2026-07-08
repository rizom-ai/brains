import { describe, expect, test } from "bun:test";
import { defineBrain } from "../src/brain-definition";
import { resolve } from "../src/brain-resolver";
import type { SitePackage } from "../src/site-package";

const definition = defineBrain({
  name: "test",
  version: "1.0.0",
  capabilities: [],
  interfaces: [],
});

describe("site.package resolution", () => {
  test("throws when an explicitly requested site.package is not registered", () => {
    expect(() =>
      resolve(definition, {}, { site: { package: "@rizom/not-installed" } }),
    ).toThrow(/@rizom\/not-installed/);
  });

  test("resolves the definition site when no site.package override is set", () => {
    expect(() => resolve(definition, {}, {})).not.toThrow();
  });

  test("adapts declarative SDK sites without requiring a public plugin factory", () => {
    const site = {
      layouts: { default: {} },
      routes: [],
      content: { namespace: "landing-page", sections: {} },
      headScripts: ['<script src="/boot.js" defer></script>'],
      entityDisplay: {},
    } satisfies SitePackage;
    const definitionWithSite = defineBrain({
      ...definition,
      site,
    });

    const config = resolve(definitionWithSite, {}, {});

    expect((config.plugins ?? []).map((plugin) => plugin.id)).toContain(
      "site-package",
    );
  });
});
