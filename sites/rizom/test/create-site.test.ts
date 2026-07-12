import { describe, expect, test } from "bun:test";
import { h } from "preact";
import { defineSection, sectionGroup, z } from "@rizom/site-sections";
import { createRizomSite } from "../src/create-site";

const baseOptions = {
  packageName: "@rizom/site-test",
  themeProfile: "product" as const,
  layout: (): null => null,
  routes: [],
};

describe("createRizomSite", () => {
  test("forwards entityDisplay onto the composed site definition", () => {
    const site = createRizomSite({
      ...baseOptions,
      entityDisplay: {
        post: { label: "Essay", navigation: { show: false } },
        deck: { label: "Talk", navigation: { show: false } },
      },
    });

    expect(site.entityDisplay?.["post"]?.label).toBe("Essay");
    expect(site.entityDisplay?.["deck"]?.label).toBe("Talk");
    expect(site.entityDisplay?.["post"]?.navigation?.show).toBe(false);
  });

  test("leaves the base entityDisplay map intact when none is given", () => {
    const site = createRizomSite(baseOptions);
    // The base rizom site ships an empty map, never undefined.
    expect(site.entityDisplay).toEqual({});
  });

  test("forwards schema-first section groups onto the composed definition", () => {
    const hero = sectionGroup("home", {
      hero: defineSection(
        z.object({ headline: z.string() }),
        () => h("h1", null),
        { title: "Hero", description: "d" },
      ),
    });

    const site = createRizomSite({ ...baseOptions, sections: hero });
    const groups = Array.isArray(site.sections)
      ? site.sections
      : site.sections
        ? [site.sections]
        : [];

    expect(groups.map((g) => g.namespace)).toEqual(["home"]);
    expect(Object.keys(groups[0]?.sections ?? {})).toEqual(["hero"]);
  });
});
