import { describe, expect, test } from "bun:test";
import type { Plugin, RouteDefinitionInput } from "@brains/plugins";
import { extendSite, type SitePackage } from "../src";

const basePlugin: SitePackage["plugin"] = function basePlugin(): Plugin {
  return {
    id: "base",
    version: "0.0.0",
    type: "service",
    packageName: "base",
    register: async () => ({
      tools: [],
      resources: [],
    }),
  };
};

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

describe("extendSite", () => {
  test("merges site composition with deterministic overrides", () => {
    const baseSite: SitePackage = {
      layouts: { default: "base-layout" },
      routes: baseRoutes,
      plugin: basePlugin,
      entityDisplay: {
        post: { label: "Post" },
        series: { label: "Series" },
      },
      staticAssets: {
        "/base.txt": "base",
      },
    };

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
    expect(childSite.plugin).toBe(basePlugin);
    expect(childSite.entityDisplay).toEqual({
      post: { label: "Essay" },
      series: { label: "Series" },
    });
    expect(childSite.staticAssets).toEqual({
      "/base.txt": "base",
      "/child.txt": "child",
    });
  });
});
