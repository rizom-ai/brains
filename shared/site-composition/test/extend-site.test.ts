import { describe, expect, test } from "bun:test";
import { extendSite } from "../src/package";
import { attachSiteRuntime, siteRuntimeOf } from "../src/site-runtime";
import type { SitePackage } from "../src/package";

function makeBase(headScripts?: string[]): SitePackage {
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

describe("extendSite entityDisplay", () => {
  test("an override refines a type's display and keeps what it leaves out", () => {
    // A brain relabelling its essays must not drop the base site's other
    // settings for them, such as the essays being what an answer cites.
    const base: SitePackage = {
      ...makeBase(),
      entityDisplay: {
        post: { label: "Post", citable: true, paginate: true },
        topic: { label: "Topic" },
      },
    };
    const site = extendSite(base, {
      entityDisplay: {
        post: { label: "Essay", navigation: { priority: 10 } },
        link: { label: "Link" },
      },
    });
    expect(site.entityDisplay).toEqual({
      post: {
        label: "Essay",
        citable: true,
        paginate: true,
        navigation: { priority: 10 },
      },
      topic: { label: "Topic" },
      link: { label: "Link" },
    });
  });
});

describe("extendSite languages", () => {
  test("an override sets the site's languages", () => {
    const site = extendSite(makeBase(), { languages: ["en", "zh-TW"] });
    expect(site.languages).toEqual(["en", "zh-TW"]);
  });

  test("the base's languages survive when the override omits them", () => {
    const base: SitePackage = {
      ...makeBase(),
      languages: ["en", "zh-TW"],
    };
    const site = extendSite(base, { routes: [{ id: "home", path: "/" }] });
    expect(site.languages).toEqual(["en", "zh-TW"]);
  });
});

describe("extendSite dataSources", () => {
  const source = (
    id: string,
  ): NonNullable<SitePackage["dataSources"]>[number] => ({
    kind: "rizom-data-source",
    id,
    name: id,
    description: id,
    fetch: async (): Promise<unknown> => null,
  });

  test("an override adds its sources to the base's", () => {
    const base = { ...makeBase(), dataSources: [source("opening")] };
    const site = extendSite(base, { dataSources: [source("writing")] });
    expect(site.dataSources?.map(({ id }) => id)).toEqual([
      "opening",
      "writing",
    ]);
  });

  test("the base's sources survive when the override omits them", () => {
    const base = { ...makeBase(), dataSources: [source("opening")] };
    const site = extendSite(base, { routes: [{ id: "home", path: "/" }] });
    expect(site.dataSources?.map(({ id }) => id)).toEqual(["opening"]);
  });
});

describe("a site's attached runtime", () => {
  test("travels with the site without becoming one of its fields", () => {
    const runtime = { kind: "test-runtime" };
    const site = attachSiteRuntime(makeBase(), runtime);
    expect(siteRuntimeOf(site)).toBe(runtime);
    expect(Object.keys(site)).toEqual(Object.keys(makeBase()));
  });

  test("survives an extension that names none of its own", () => {
    const runtime = { kind: "test-runtime" };
    const site = extendSite(attachSiteRuntime(makeBase(), runtime), {
      routes: [{ id: "home", path: "/" }],
    });
    expect(siteRuntimeOf(site)).toBe(runtime);
  });

  test("is absent from a site that attached none", () => {
    expect(siteRuntimeOf(makeBase())).toBeUndefined();
  });
});
