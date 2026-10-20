import { describe, expect, it } from "bun:test";
import {
  assemblePreparedSiteBuild,
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
      represents: "anchor",
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
    const roundTripped = preparedSiteBuildSchema.parse(
      JSON.parse(JSON.stringify(prepared)),
    );

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

  it("rejects non-JSON class instances before schemas can coerce them", () => {
    const input = createPreparedBuild();
    const section = input.routes[0]?.sections[0];
    if (!section) throw new Error("Expected fixture section");
    // Object.assign injects the non-JSON value the guard must reject, without
    // asserting it into the JsonObject slot.
    Object.assign(section.data, {
      publishedAt: new Date("2026-07-22T00:00:00.000Z"),
    });

    expect(() => createPreparedSiteBuildSnapshot(input)).toThrow(
      "Unsupported non-JSON value at $.routes[0].sections[0].data.publishedAt: Date",
    );
  });

  it("rejects integers beyond the JSON-safe range", () => {
    const input = createPreparedBuild();
    const section = input.routes[0]?.sections[0];
    if (!section) throw new Error("Expected fixture section");
    section.data["bigId"] = Number.MAX_SAFE_INTEGER + 1;

    expect(() => preparedSiteBuildSchema.parse(input)).toThrow();
  });

  it("accepts safe integers and fractional numbers", () => {
    const input = createPreparedBuild();
    const section = input.routes[0]?.sections[0];
    if (!section) throw new Error("Expected fixture section");
    section.data["safeId"] = Number.MAX_SAFE_INTEGER;
    section.data["ratio"] = 3.14;

    expect(() => preparedSiteBuildSchema.parse(input)).not.toThrow();
  });

  it("deep-freezes a validated snapshot", () => {
    const prepared = freezePreparedSiteBuild(
      preparedSiteBuildSchema.parse(createPreparedBuild()),
    );

    expect(Object.isFrozen(prepared)).toBe(true);
    expect(Object.isFrozen(prepared.routes)).toBe(true);
    expect(Object.isFrozen(prepared.routes[0]?.sections[0]?.data)).toBe(true);
  });

  describe("assemblePreparedSiteBuild", () => {
    function parts(): {
      envelope: Omit<PreparedSiteBuild, "routes">;
      routes: PreparedSiteBuild["routes"];
    } {
      const { routes, ...envelope } = createPreparedBuild();
      return { envelope, routes };
    }

    it("keeps each prepared page's data as it is, without copying the build", () => {
      const { envelope, routes } = parts();
      const prepared = assemblePreparedSiteBuild(envelope, routes);

      expect(prepared.routes[0]?.sections[0]?.data).toBe(
        routes[0]?.sections[0]?.data,
      );
      expect(prepared).toEqual(
        createPreparedSiteBuildSnapshot(createPreparedBuild()),
      );
    });

    it("deep-freezes the snapshot", () => {
      const { envelope, routes } = parts();
      const prepared = assemblePreparedSiteBuild(envelope, routes);

      expect(Object.isFrozen(prepared)).toBe(true);
      expect(Object.isFrozen(prepared.routes[0])).toBe(true);
      expect(Object.isFrozen(prepared.routes[0]?.sections[0]?.data)).toBe(true);
    });

    it("validates the rest of the build", () => {
      const { envelope, routes } = parts();

      expect(() =>
        assemblePreparedSiteBuild({ ...envelope, buildId: "" }, routes),
      ).toThrow();
      expect(() =>
        assemblePreparedSiteBuild(
          { ...envelope, staticAssets: { "/x.js": new Date() } },
          routes,
        ),
      ).toThrow("Unsupported non-JSON value at $.staticAssets./x.js: Date");
    });

    it("validates each page's fields", () => {
      const { envelope, routes } = parts();
      const [route] = routes;
      if (!route) throw new Error("Expected fixture route");

      expect(() =>
        assemblePreparedSiteBuild(envelope, [{ ...route, path: 42 }]),
      ).toThrow();
    });
  });
});
