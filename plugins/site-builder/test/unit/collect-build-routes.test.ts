import { describe, expect, it } from "bun:test";
import { RouteRegistry } from "@brains/site-engine";
import type { RouteDefinitionInput } from "@brains/site-composition";
import { createSilentLogger } from "@brains/test-utils";
import { collectBuildRoutes } from "../../src/lib/collect-build-routes";

const HOME: RouteDefinitionInput = {
  id: "home",
  path: "/",
  title: "Home",
  sections: [
    { id: "cover", template: "home:cover", content: { line: "Hello" } },
    { id: "story", template: "home:story" },
  ],
};

const ABOUT: RouteDefinitionInput = {
  id: "about",
  path: "/about/team",
  title: "Team",
  sections: [{ id: "people", template: "about:people" }],
};

function registry(routes: RouteDefinitionInput[]): RouteRegistry {
  const routeRegistry = new RouteRegistry(createSilentLogger());
  routes.forEach((route) => routeRegistry.register(route));
  return routeRegistry;
}

/** Copy saved under these site-content ids, and every id asked about. */
function savedCopy(ids: string[]): {
  hasSavedCopy: (id: string) => Promise<boolean>;
  asked: string[];
} {
  const asked: string[] = [];
  return {
    asked,
    hasSavedCopy: async (id): Promise<boolean> => {
      asked.push(id);
      return ids.includes(id);
    },
  };
}

describe("collectBuildRoutes", () => {
  it("builds a site without languages once, in English", async () => {
    const copy = savedCopy([]);
    const { routes } = await collectBuildRoutes(registry([HOME]), {
      hasSavedCopy: copy.hasSavedCopy,
    });

    expect(
      routes.map(({ id, path, language }) => [id, path, language]),
    ).toEqual([["home", "/", "en"]]);
    expect(routes[0]?.sections[0]?.content).toEqual({ line: "Hello" });
    expect(copy.asked).toEqual([]);
  });

  it("builds a translated route again under its language's path, reading its own copy", async () => {
    const copy = savedCopy([
      "zh-tw:home:cover",
      "zh-tw:home:story",
      "zh-tw:about:people",
    ]);
    const { routes } = await collectBuildRoutes(registry([HOME, ABOUT]), {
      languages: ["en", "zh-TW"],
      hasSavedCopy: copy.hasSavedCopy,
    });

    expect(
      routes.map(({ id, path, language }) => [id, path, language]),
    ).toEqual([
      ["home", "/", "en"],
      ["about", "/about/team", "en"],
      ["zh-tw:home", "/zh-tw", "zh-TW"],
      ["zh-tw:about", "/zh-tw/about/team", "zh-TW"],
    ]);
    // The default copy in the site package is English; a translation never
    // falls back to it.
    const translatedHome = routes.find(({ id }) => id === "zh-tw:home");
    expect(translatedHome?.sections.map(({ content }) => content)).toEqual([
      undefined,
      undefined,
    ]);
  });

  it("skips a route in a language until every section has copy in it", async () => {
    const copy = savedCopy(["zh-tw:home:cover", "zh-tw:about:people"]);
    const { routes } = await collectBuildRoutes(registry([HOME, ABOUT]), {
      languages: ["en", "zh-TW"],
      hasSavedCopy: copy.hasSavedCopy,
    });

    expect(routes.map(({ id }) => id)).toEqual([
      "home",
      "about",
      "zh-tw:about",
    ]);
  });

  it("builds a route fed by a datasource, or with an untemplated section, in the default language only", async () => {
    const feed: RouteDefinitionInput = {
      id: "posts",
      path: "/posts",
      sections: [
        {
          id: "list",
          template: "blog:list",
          dataQuery: { entityType: "post" },
        },
      ],
    };
    const empty: RouteDefinitionInput = { id: "blank", path: "/blank" };
    const copy = savedCopy(["zh-tw:posts:list"]);
    const { routes } = await collectBuildRoutes(registry([feed, empty]), {
      languages: ["en", "zh-TW"],
      hasSavedCopy: copy.hasSavedCopy,
    });

    expect(routes.map(({ id }) => id)).toEqual(["posts", "blank"]);
  });
});
