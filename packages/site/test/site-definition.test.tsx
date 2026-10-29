/** @jsxImportSource react */
import { describe, expect, test } from "bun:test";
import {
  defineSection,
  defineSite,
  languagePath,
  sectionGroup,
  z,
} from "../src";

const hero = defineSection(
  z.object({ heading: z.string(), introduction: z.string() }),
  ({ heading, introduction }) => (
    <section>
      <h1>{heading}</h1>
      <p>{introduction}</p>
    </section>
  ),
  { title: "Hero", description: "Site introduction" },
);

function readingSite(): ReturnType<typeof defineSite> {
  return defineSite({
    layouts: {
      default: ({ title, sections }) => (
        <html>
          <head>
            <title>{title}</title>
          </head>
          <body>{sections}</body>
        </html>
      ),
    },
    routes: [
      {
        id: "home",
        path: "/",
        title: "Reading library",
        sections: [{ id: "hero", template: "library.hero" }],
      },
    ],
    sections: [sectionGroup("library", { hero })],
    content: {
      library: {
        hero: {
          heading: "Read with intention",
          introduction: "A durable collection.",
        },
      },
    },
    entityDisplay: {
      bookmark: { label: "Bookmark", pageSize: 12 },
    },
    themeOverride: ".hero { max-width: 48rem; }",
    headScripts: ["<script>globalThis.siteReady = true</script>"],
    staticAssets: { "robots.txt": "User-agent: *\nAllow: /\n" },
  });
}

describe("defineSite", () => {
  test("validates every stable field and binds initial section content", () => {
    const site = readingSite();
    const section = site.routes[0]?.sections?.[0];

    expect(section?.template).toBe("library:hero");
    expect(section?.content).toEqual({
      heading: "Read with intention",
      introduction: "A durable collection.",
    });
    expect(site.themeOverride).toContain("max-width");
    expect(site.headScripts).toHaveLength(1);
    expect(site.staticAssets?.["robots.txt"]).toContain("Allow");
  });

  test("lets a site name the entity types an answer may cite", () => {
    const site = defineSite({
      ...readingSite(),
      entityDisplay: {
        bookmark: { label: "Bookmark", citable: true },
        tag: { label: "Tag" },
        note: { label: "Note", citable: false },
      },
    });
    expect(site.entityDisplay["bookmark"]?.citable).toBe(true);
    expect(site.entityDisplay["tag"]?.citable).toBeUndefined();
    expect(site.entityDisplay["note"]?.citable).toBe(false);
  });

  test("rejects content that diverges from its section schema", () => {
    expect(() =>
      defineSite({
        ...readingSite(),
        content: {
          library: {
            hero: { heading: "Missing introduction" },
          },
        },
      }),
    ).toThrow("library.hero");
  });

  test("rejects embedded runtime plugins from the stable definition", () => {
    const legacySite = Object.assign({}, readingSite(), {
      plugin: () => ({ id: "legacy" }),
    });

    expect(() => defineSite(legacySite)).toThrow("Unrecognized key");
  });
});

describe("defineSite languages", () => {
  test("a site declares its languages once, the first one its default", () => {
    const site = defineSite({ ...readingSite(), languages: ["en", "zh-TW"] });
    expect(site.languages).toEqual(["en", "zh-TW"]);
    expect(readingSite().languages).toBeUndefined();
  });

  test("rejects a language that is not a language tag", () => {
    expect(() =>
      defineSite({
        ...readingSite(),
        languages: ["en", "traditional chinese"],
      }),
    ).toThrow("language tag");
  });

  test("rejects a language declared twice, whatever its case", () => {
    expect(() =>
      defineSite({ ...readingSite(), languages: ["en", "zh-TW", "zh-tw"] }),
    ).toThrow("declared twice");
  });

  test("rejects a route under another language's path", () => {
    expect(() =>
      defineSite({
        ...readingSite(),
        languages: ["en", "zh-TW"],
        routes: [
          ...readingSite().routes,
          { id: "about", path: "/zh-tw/about", sections: [] },
        ],
      }),
    ).toThrow("/zh-tw");
  });
});

describe("languagePath", () => {
  test("keeps the default language at the route's own path", () => {
    expect(languagePath("en", "en", "/about")).toBe("/about");
    expect(languagePath("EN", "en", "/")).toBe("/");
  });

  test("puts every other language under its lowercased tag", () => {
    expect(languagePath("zh-TW", "en", "/")).toBe("/zh-tw");
    expect(languagePath("zh-TW", "en", "/about/team")).toBe(
      "/zh-tw/about/team",
    );
  });
});

describe("route translations", () => {
  test("a route carries its title, description and navigation label in another language", () => {
    const site = defineSite({
      ...readingSite(),
      languages: ["en", "zh-TW"],
      routes: [
        {
          ...readingSite().routes[0],
          id: "home",
          path: "/",
          translations: {
            "zh-TW": {
              title: "閱讀圖書館",
              description: "一個長久的收藏",
              navigationLabel: "首頁",
            },
          },
        },
      ],
    });

    expect(site.routes[0]?.translations?.["zh-TW"]?.navigationLabel).toBe(
      "首頁",
    );
  });

  test("rejects a translation keyed by something that is not a language tag", () => {
    expect(() =>
      defineSite({
        ...readingSite(),
        routes: [
          {
            id: "home",
            path: "/",
            translations: { "traditional chinese": { title: "首頁" } },
          },
        ],
      }),
    ).toThrow("language tag");
  });
});
