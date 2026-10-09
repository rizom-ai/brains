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
  // What yeehaa.io marks citable: its essays, presentations and projects.
  const citable = new Set(["post", "deck", "project"]);
  return {
    search,
    find: createGuestAnswerSources({
      entityService: { search },
      isCitable: (entityType) => citable.has(entityType),
      urlFor: (entityType, slug) => `/${entityType}s/${slug}`,
      siteBaseUrl: site.baseUrl,
    }),
  };
}

describe("a visitor's answer's sources", () => {
  it("are the pieces of work the site cites closest to the answer", async () => {
    // The note, social post and topic are close too, but are not pieces the
    // site offers as sources.
    const { find, search } = sources();
    const cited = await find({ answer: "Storage is not memory." });
    expect(cited.map((source) => source.id)).toEqual([
      "post:hiding",
      "post:heroics",
      "post:cracks",
      "post:colleague",
    ]);
    expect(search).toHaveBeenCalledTimes(1);
    const request = search.mock.calls[0]?.[0];
    expect(request?.query).toBe("Storage is not memory.");
    expect(request?.options?.visibilityScope).toBe("public");
    // A visitor is pointed only at published work, never at a draft.
    expect(request?.options?.publishedOnly).toBe(true);
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

  it("carry the title an entry gives its page, as a book section's siglum", async () => {
    const { find } = sources([
      result("post", "aphorism", 0.6, {
        title: "57",
        pageTitle: "AC-57",
        slug: "der-antichrist/58",
      }),
    ]);
    const [first] = await find({ answer: "Mittelmässigkeit" });
    expect(first?.title).toBe("AC-57");
  });

  it("cite by type alone, whatever an entry's metadata says", async () => {
    const { find } = sources([
      result("note", "draft", 0.62, { title: "Ein Entwurf" }),
      result("post", "aphorism", 0.6, { title: "7", citable: false }),
    ]);
    const cited = await find({ answer: "Mitleid" });
    expect(cited.map((source) => source.id)).toEqual(["post:aphorism"]);
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

  it("are none when nothing the site cites is close", async () => {
    const { find } = sources([result("note", "private-ish", 0.9)]);
    expect(await find({ answer: "Storage is not memory." })).toEqual([]);
  });
});

describe("a source from another brain", () => {
  it("is cited at its origin, with the brain it came from", async () => {
    const piece = result("network-piece", "plc-peer--post--3kabc", 0.6, {
      title: "Handoffs between teams",
      origin: "https://becca.rizom.ai/essays/handoffs",
      brain: {
        did: "did:plc:peer",
        name: "Becca",
        url: "https://becca.rizom.ai",
      },
    });
    const search = mock(async (request: EntitySearchRequest) => {
      void request;
      return [piece];
    });
    const find = createGuestAnswerSources({
      entityService: { search },
      isCitable: (entityType) => entityType === "network-piece",
      urlFor: () => "/never-used",
      siteBaseUrl: "rizom.ai",
    });
    expect(await find({ answer: "…" })).toEqual([
      {
        id: "network-piece:plc-peer--post--3kabc",
        title: "Handoffs between teams",
        source: "network-piece",
        entityType: "network-piece",
        entityId: "plc-peer--post--3kabc",
        url: "https://becca.rizom.ai/essays/handoffs",
        brain: { name: "Becca", url: "https://becca.rizom.ai" },
      },
    ]);
  });
});
