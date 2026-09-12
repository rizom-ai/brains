import { describe, expect, it } from "bun:test";
import { getGuestSourceCards } from "../src/chat";

const citation = {
  id: "note:public-note",
  source: "note",
  entityType: "note",
  entityId: "public-note",
  title: "Public note",
  excerpt: "Public evidence",
  url: "https://example.org/source",
  provenance: { toolName: "system_get", privateDiagnostic: "must not escape" },
};
const card = {
  kind: "sources",
  id: "sources:tool-results",
  sources: [citation],
};

describe("guest source projection", () => {
  it("keeps bounded citations, not raw provenance or unrelated cards", () => {
    const result = getGuestSourceCards([
      { kind: "actions", id: "operator", actions: [] },
      { ...card, id: "sources:context" },
      { ...card, privateDiagnostic: "hidden" },
    ]);
    expect(result).toEqual([
      {
        kind: "sources",
        id: "sources:tool-results",
        title: "Retrieved sources",
        sources: [
          {
            id: citation.id,
            source: citation.source,
            entityType: citation.entityType,
            entityId: citation.entityId,
            title: citation.title,
            excerpt: citation.excerpt,
            url: citation.url,
          },
        ],
      },
    ]);
    expect(getGuestSourceCards(result)).toEqual(result);
  });

  it("omits unsafe and operator-relative navigation", () => {
    for (const url of [
      "/admin",
      "http://localhost:8080/admin",
      "https://user:password@example.org/source",
    ]) {
      const result = getGuestSourceCards([
        { ...card, sources: [{ ...citation, url }] },
      ]);
      expect(result[0]?.sources[0]?.url).toBeUndefined();
    }
    expect(
      getGuestSourceCards([
        { ...card, sources: [{ ...citation, url: "javascript:alert(1)" }] },
      ]),
    ).toEqual([]);
  });

  it("deduplicates and bounds presentation size", () => {
    const result = getGuestSourceCards([
      {
        ...card,
        sources: Array.from({ length: 50 }, (_, i) => ({
          ...citation,
          id: `note:n${i}`,
          entityId: `n${i}`,
          title: "t".repeat(1000),
          excerpt: "e".repeat(5000),
        })),
      },
      card,
      card,
    ]);
    expect(result[0]?.sources).toHaveLength(15);
    expect(result[0]?.sources[0]?.title).toHaveLength(160);
    expect(result[0]?.sources[0]?.excerpt).toHaveLength(280);
    expect(getGuestSourceCards([card, card])[0]?.sources).toHaveLength(1);
  });

  it("rejects malformed and unbound citations without a raw-data fallback", () => {
    for (const value of [
      null,
      {},
      [{ kind: "sources", id: "sources:tool-results" }],
      [{ ...card, sources: [{ ...citation, entityId: "other" }] }],
    ]) {
      expect(getGuestSourceCards(value)).toEqual([]);
    }
  });
});
