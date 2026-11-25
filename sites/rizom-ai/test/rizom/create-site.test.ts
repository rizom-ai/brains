import { describe, expect, test } from "bun:test";
import { createElement as h } from "react";
import { defineSection, sectionGroup, z } from "@rizom/site";
import { createRizomSite } from "../../src/rizom/create-site";
import { organism } from "../../src/story/organism";

const baseOptions = {
  packageName: "@rizom/site-test",
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

    expect(site.entityDisplay).toMatchObject({
      post: { label: "Essay", navigation: { show: false } },
      deck: { label: "Talk", navigation: { show: false } },
    });
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

describe("the story stylesheet of a site built on the base", () => {
  const drawing = organism({
    id: "test-org",
    stages: [{ A: [300, 300, 8, 1] }],
    links: [],
    visible: [[]],
    flowing: [[]],
    labels: [[]],
  });

  test("carries the page shape and the site's own drawings", () => {
    const site = createRizomSite({ ...baseOptions, organisms: [drawing] });
    const css = site.staticAssets?.["/styles/story.css"] ?? "";
    expect(css).toContain(".chapters {");
    expect(css).toContain(drawing.css());
  });

  test("carries no drawing of another site", () => {
    const css =
      createRizomSite(baseOptions).staticAssets?.["/styles/story.css"] ?? "";
    expect(css).toContain(".chapters {");
    for (const other of ["living-org", "brain-org", "work-org"]) {
      expect(css).not.toContain(`.${other}[data-stage`);
    }
  });

  test("serves the site's own static files beside the base's", () => {
    const site = createRizomSite({
      ...baseOptions,
      staticAssets: { "/styles/reading.css": ".reading {}" },
    });
    expect(site.staticAssets?.["/styles/reading.css"]).toBe(".reading {}");
    expect(site.staticAssets?.["/boot.js"]).toBeDefined();
  });

  test("serves no ATProto lexicons: only rizom.ai is their authority", () => {
    const paths = Object.keys(createRizomSite(baseOptions).staticAssets ?? {});
    expect(paths.filter((path) => path.startsWith("/atproto/"))).toEqual([]);
  });
});
