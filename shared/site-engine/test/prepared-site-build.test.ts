import { describe, expect, it } from "bun:test";
import {
  createPreparedSiteEnvelope,
  freezePreparedRoute,
  preparedRouteSchema,
  preparedSiteBuildSchema,
  preparedSiteEnvelopeSchema,
  routeSourceOf,
  type PreparedRoute,
  type PreparedSiteEnvelope,
} from "../src";

function createEnvelope(): PreparedSiteEnvelope {
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

function createRoute(): PreparedRoute {
  return {
    id: "home",
    path: "/",
    language: "en",
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
  };
}

describe("PreparedSiteEnvelope", () => {
  it("round-trips through JSON without renderer or service values", () => {
    const input = createEnvelope();
    input.site.url = undefined;
    const envelope = createPreparedSiteEnvelope(input);
    const roundTripped = preparedSiteEnvelopeSchema.parse(
      JSON.parse(JSON.stringify(envelope)),
    );

    expect(roundTripped).toEqual(envelope);
    expect(envelope.site).not.toHaveProperty("url");
  });

  it("rejects non-JSON values before schemas can coerce them", () => {
    expect(() =>
      createPreparedSiteEnvelope({
        ...createEnvelope(),
        staticAssets: { "/x.js": new Date() },
      }),
    ).toThrow("Unsupported non-JSON value at $.staticAssets./x.js: Date");
  });

  it("validates the build's fields", () => {
    expect(() =>
      createPreparedSiteEnvelope({ ...createEnvelope(), buildId: "" }),
    ).toThrow();
  });

  it("deep-freezes the envelope", () => {
    const envelope = createPreparedSiteEnvelope(createEnvelope());

    expect(Object.isFrozen(envelope)).toBe(true);
    expect(Object.isFrozen(envelope.site.navigation)).toBe(true);
    expect(Object.isFrozen(envelope.images)).toBe(true);
  });
});

describe("PreparedRoute", () => {
  it("rejects non-JSON section data", () => {
    const route = createRoute();
    const section = route.sections[0];
    if (!section) throw new Error("Expected fixture section");
    Object.assign(section.data, { renderer: () => "not serializable" });

    expect(() => preparedRouteSchema.parse(route)).toThrow();
  });

  it("rejects integers beyond the JSON-safe range", () => {
    const route = createRoute();
    const section = route.sections[0];
    if (!section) throw new Error("Expected fixture section");
    section.data["bigId"] = Number.MAX_SAFE_INTEGER + 1;

    expect(() => preparedRouteSchema.parse(route)).toThrow();
  });

  it("accepts safe integers and fractional numbers", () => {
    const route = createRoute();
    const section = route.sections[0];
    if (!section) throw new Error("Expected fixture section");
    section.data["safeId"] = Number.MAX_SAFE_INTEGER;
    section.data["ratio"] = 3.14;

    expect(() => preparedRouteSchema.parse(route)).not.toThrow();
  });
});

describe("freezePreparedRoute", () => {
  it("keeps a page's section data as it is, without copying it", () => {
    const route = createRoute();
    const frozen = freezePreparedRoute(route);

    expect(frozen.sections[0]?.data).toBe(route.sections[0]?.data);
    expect(frozen).toEqual(preparedRouteSchema.parse(createRoute()));
  });

  it("deep-freezes the page", () => {
    const frozen = freezePreparedRoute(createRoute());

    expect(Object.isFrozen(frozen)).toBe(true);
    expect(Object.isFrozen(frozen.sections[0]?.data)).toBe(true);
  });

  it("validates the page's fields", () => {
    expect(() => freezePreparedRoute({ ...createRoute(), path: 42 })).toThrow();
  });
});

describe("PreparedSiteBuild", () => {
  it("keeps of each page only its address and scripts", () => {
    const built = preparedSiteBuildSchema.parse({
      ...createEnvelope(),
      routes: [createRoute()],
    });

    expect(built.routes).toEqual([
      {
        id: "home",
        path: "/",
        headScripts: ['<script src="/hero.js"></script>'],
      },
    ]);
  });
});

describe("routeSourceOf", () => {
  it("counts and visits every page", async () => {
    const routes = [createRoute(), { ...createRoute(), id: "about" }];
    const source = routeSourceOf(routes);
    const visited: string[] = [];

    await source.each(async (route) => {
      visited.push(route.id);
    }, new AbortController().signal);

    expect(source.count).toBe(2);
    expect(visited.sort()).toEqual(["about", "home"]);
  });

  it("rejects with a visit's failure", async () => {
    const source = routeSourceOf([createRoute()]);

    expect(
      source.each(async () => {
        throw new Error("render failed");
      }, new AbortController().signal),
    ).rejects.toThrow("render failed");
  });
});
