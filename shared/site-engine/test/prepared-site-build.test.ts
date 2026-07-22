import { describe, expect, it } from "bun:test";
import {
  createPreparedSiteBuildSnapshot,
  freezePreparedSiteBuild,
  preparedSiteBuildSchema,
  type PreparedSiteBuild,
} from "../src";

function createPreparedBuild(): PreparedSiteBuild {
  return {
    buildId: "build-123",
    preparedAt: "2026-07-22T00:00:00.000Z",
    environment: "preview",
    site: {
      title: "Prepared Site",
      description: "Serializable build fixture",
      copyright: "Prepared copyright",
      navigation: {
        primary: [{ label: "Home", href: "/", priority: 10 }],
        secondary: [],
      },
    },
    routes: [
      {
        id: "home",
        path: "/",
        title: "Home",
        description: "Home route",
        layout: "default",
        fullscreen: false,
        sections: [
          {
            id: "hero",
            template: "fixture:hero",
            data: {
              heading: "Hello",
              items: [1, true, null, { label: "Nested" }],
            },
          },
        ],
        headScripts: ['<script src="/hero.js"></script>'],
      },
    ],
    themeCSS: ":root { --brand: blue; }",
    images: {
      cover: {
        src: "/images/cover.webp",
        width: 1200,
        height: 630,
      },
    },
    staticAssets: { "/hero.js": "console.log('hero')" },
    publicAssets: { "favicon.bin": "AAEC" },
    globalHeadScripts: ['<script id="global"></script>'],
  };
}

describe("PreparedSiteBuild", () => {
  it("round-trips through JSON without renderer or service values", () => {
    const input = createPreparedBuild();
    input.site.url = undefined;
    const prepared = createPreparedSiteBuildSnapshot(input);
    const roundTripped = JSON.parse(
      JSON.stringify(prepared),
    ) as PreparedSiteBuild;

    expect(roundTripped).toEqual(prepared);
    expect(prepared.site).not.toHaveProperty("url");
    expect(JSON.stringify(prepared)).not.toContain("getContent");
    expect(JSON.stringify(prepared)).not.toContain("getViewTemplate");
  });

  it("rejects non-JSON section data", () => {
    const input = createPreparedBuild();
    const section = input.routes[0]?.sections[0];
    if (!section) throw new Error("Expected fixture section");
    Object.assign(section.data, { renderer: () => "not serializable" });

    expect(() => preparedSiteBuildSchema.parse(input)).toThrow();
  });

  it("deep-freezes a validated snapshot", () => {
    const prepared = freezePreparedSiteBuild(
      preparedSiteBuildSchema.parse(createPreparedBuild()),
    );

    expect(Object.isFrozen(prepared)).toBe(true);
    expect(Object.isFrozen(prepared.routes)).toBe(true);
    expect(Object.isFrozen(prepared.routes[0]?.sections[0]?.data)).toBe(true);
  });
});
