/** @jsxImportSource preact */
import { describe, expect, test } from "bun:test";
import { defineSection, defineSite, sectionGroup, z } from "../src";

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
