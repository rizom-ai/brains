import { describe, expect, it, mock } from "bun:test";
import type { EntitySearchRequest, SearchResult } from "@brains/entity-service";
import { createGuestAnswerSources } from "../src/initialization/guest-answer-sources";

function result(
  entityType: string,
  id: string,
  score: number,
  metadata: Record<string, unknown> = {},
): SearchResult {
  return {
    entity: {
      id,
      entityType,
      content: "",
      contentHash: "",
      created: "2026-01-01T00:00:00.000Z",
      updated: "2026-01-01T00:00:00.000Z",
      visibility: "public",
      metadata,
    },
    score,
    excerpt: "",
  };
}

// What the live brain returns for an answer about three essays.
const found = [
  result("post", "hiding", 0.594, {
    title: "Hiding in Plain Sight",
    slug: "hiding-in-plain-sight",
  }),
  result("note", "writing-sample", 0.589, { title: "Writing Sample" }),
  result("post", "heroics", 0.57, { title: "Heroics Are Not Infrastructure" }),
  result("social-post", "announcement", 0.565),
  result("topic", "institutional-memory", 0.564),
  result("post", "cracks", 0.538),
  result("post", "colleague", 0.535),
  result("deck", "living-archive", 0.525),
  result("post", "urging", 0.509),
];

function sources(
  results: SearchResult[] = found,
  site: { baseUrl?: string } = { baseUrl: "yeehaa.io" },
): {
  find: ReturnType<typeof createGuestAnswerSources>;
  search: ReturnType<
    typeof mock<(request: EntitySearchRequest) => Promise<SearchResult[]>>
  >;
} {
  const search = mock(async (request: EntitySearchRequest) => {
    void request;
    return results;
  });
  const routed = new Set(["post", "deck", "project", "topic", "series"]);
  return {
    search,
    find: createGuestAnswerSources({
      entityService: { search },
      hasRoute: (entityType) => routed.has(entityType),
      urlFor: (entityType, slug) => `/${entityType}s/${slug}`,
      siteBaseUrl: site.baseUrl,
    }),
  };
}

describe("a visitor's answer's sources", () => {
  it("are the public pages the site shows closest to the answer", async () => {
    const { find, search } = sources();
    const cited = await find({ answer: "Storage is not memory." });
    expect(cited.map((source) => source.id)).toEqual([
      "post:hiding",
      "post:heroics",
      "topic:institutional-memory",
      "post:cracks",
      "post:colleague",
    ]);
    expect(search).toHaveBeenCalledTimes(1);
    const request = search.mock.calls[0]?.[0];
    expect(request?.query).toBe("Storage is not memory.");
    expect(request?.options?.visibilityScope).toBe("public");
  });

  it("carry the page's title and address on the site", async () => {
    const { find } = sources();
    const [first] = await find({ answer: "Storage is not memory." });
    expect(first).toEqual({
      id: "post:hiding",
      title: "Hiding in Plain Sight",
      source: "post",
      entityType: "post",
      entityId: "hiding",
      url: "https://yeehaa.io/posts/hiding-in-plain-sight",
    });
  });

  it("reach the site over https whether its domain is written with a scheme or not", async () => {
    for (const baseUrl of [
      "yeehaa.io",
      "https://yeehaa.io/",
      "http://yeehaa.io",
    ]) {
      const { find } = sources(found, { baseUrl });
      const [first] = await find({ answer: "Storage is not memory." });
      expect(first?.url).toBe("https://yeehaa.io/posts/hiding-in-plain-sight");
    }
  });

  it("leave out an address when the site has none", async () => {
    const { find } = sources(found, {});
    const [first] = await find({ answer: "Storage is not memory." });
    expect(first).toEqual({
      id: "post:hiding",
      title: "Hiding in Plain Sight",
      source: "post",
      entityType: "post",
      entityId: "hiding",
    });
  });

  it("stay close to the closest one, so a loose match does not light up", async () => {
    const { find } = sources([
      result("post", "close", 0.8),
      result("post", "loose", 0.6),
    ]);
    const cited = await find({ answer: "Storage is not memory." });
    expect(cited.map((source) => source.id)).toEqual(["post:close"]);
  });

  it("are none when nothing the site shows is close", async () => {
    const { find } = sources([result("note", "private-ish", 0.9)]);
    expect(await find({ answer: "Storage is not memory." })).toEqual([]);
  });
});
