import { describe, expect, test } from "bun:test";
import { withSiteRuntime, type RouteDefinitionInput } from "@brains/plugins";
import { siteRuntimeOf } from "@brains/site-composition";
import { z } from "@brains/utils/zod";
import { extendSite, type SitePackage } from "../src";

const baseHomeRoute: RouteDefinitionInput = {
  id: "home",
  path: "/",
  title: "Home",
  description: "Home page",
  layout: "default",
  sections: [],
};

const baseAboutRoute: RouteDefinitionInput = {
  id: "about",
  path: "/about",
  title: "About",
  description: "About page",
  layout: "default",
  sections: [],
};

const baseRoutes: RouteDefinitionInput[] = [baseHomeRoute, baseAboutRoute];

/** What the base site carries for the runtime. */
const baseRuntime = { id: "base", config: z.object({}), templates: {} };

function makeBaseSite(): SitePackage {
  return withSiteRuntime(
    {
      layouts: { default: "base-layout" },
      routes: baseRoutes,
      entityDisplay: {
        post: { label: "Post" },
        series: { label: "Series" },
      },
      staticAssets: {
        "/base.txt": "base",
      },
    },
    baseRuntime,
  );
}

describe("extendSite", () => {
  test("returns the base site unchanged when overrides is empty", () => {
    const baseSite = makeBaseSite();
    expect(extendSite(baseSite, {})).toBe(baseSite);
    expect(extendSite(baseSite)).toBe(baseSite);
  });

  test("preserves base.staticAssets reference when override has no staticAssets", () => {
    const baseSite = makeBaseSite();
    const child = extendSite(baseSite, {
      entityDisplay: { post: { label: "Essay" } },
    });
    expect(child.staticAssets).toBe(baseSite.staticAssets);
  });

  test("uses the override's runtime when it carries one", () => {
    const baseSite = makeBaseSite();
    const override = withSiteRuntime(
      {},
      { id: "override", config: z.object({}), templates: {} },
    );
    const child = extendSite(baseSite, override);
    expect(siteRuntimeOf(child)).toBe(siteRuntimeOf(override));
    expect(siteRuntimeOf(child)).not.toBe(siteRuntimeOf(baseSite));
  });

  test("merges site composition with deterministic overrides", () => {
    const baseSite = makeBaseSite();

    const childSite = extendSite(baseSite, {
      layouts: { sidebar: "child-layout" },
      routes: [
        {
          id: "home",
          path: "/",
          title: "Start",
          description: "Updated home page",
          layout: "default",
          sections: [],
        },
        {
          id: "contact",
          path: "/contact",
          title: "Contact",
          description: "Contact page",
          layout: "default",
          sections: [],
        },
      ],
      entityDisplay: {
        post: { label: "Essay" },
      },
      staticAssets: {
        "/child.txt": "child",
      },
      themeOverride: ".child { color: purple; }",
    });

    expect(childSite.layouts).toEqual({
      default: "base-layout",
      sidebar: "child-layout",
    });
    expect(childSite.routes).toEqual([
      {
        id: "home",
        path: "/",
        title: "Start",
        description: "Updated home page",
        layout: "default",
        sections: [],
      },
      baseAboutRoute,
      {
        id: "contact",
        path: "/contact",
        title: "Contact",
        description: "Contact page",
        layout: "default",
        sections: [],
      },
    ]);
    expect(siteRuntimeOf(childSite)).toBe(siteRuntimeOf(baseSite));
    expect(childSite.entityDisplay).toEqual({
      post: { label: "Essay" },
      series: { label: "Series" },
    });
    expect(childSite.staticAssets).toEqual({
      "/base.txt": "base",
      "/child.txt": "child",
    });
    expect(childSite.themeOverride).toBe(".child { color: purple; }");
  });

  test("layers base and child theme overrides", () => {
    const baseSite = {
      ...makeBaseSite(),
      themeOverride: ".base { color: pink; }",
    };

    const childSite = extendSite(baseSite, {
      themeOverride: ".child { color: purple; }",
    });

    expect(childSite.themeOverride).toBe(
      ".base { color: pink; }\n\n.child { color: purple; }",
    );
  });
});
