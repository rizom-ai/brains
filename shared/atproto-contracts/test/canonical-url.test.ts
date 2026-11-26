import { describe, expect, it } from "bun:test";
import { canonicalAtprotoLexicons } from "../src";

// A record names its page, so another brain that keeps it can send a reader
// there. Every projected collection declares the address the same way.
const PROJECTED = [
  "ai.rizom.brain.post",
  "ai.rizom.brain.deck",
  "ai.rizom.brain.project",
  "ai.rizom.brain.note",
  "ai.rizom.brain.link",
  "ai.rizom.brain.series",
  "ai.rizom.brain.topic",
  "ai.rizom.brain.socialPost",
  "ai.rizom.brain.book",
  "ai.rizom.brain.doc",
  "ai.rizom.brain.guide",
  "ai.rizom.brain.newsletter",
] as const;

describe("a post's page on its author's brain", () => {
  it("ai.rizom.brain.post declares an optional pageUrl", () => {
    const main = canonicalAtprotoLexicons["ai.rizom.brain.post"].defs["main"];
    expect(main.record.properties["pageUrl"]).toMatchObject({
      type: "string",
      format: "uri",
    });
    expect(main.record.required ?? []).not.toContain("pageUrl");
  });
});

describe("a projected record's page address", () => {
  for (const id of PROJECTED) {
    it(`${id} declares an optional canonicalUrl`, () => {
      const main = canonicalAtprotoLexicons[id].defs["main"];
      expect(main.record.properties["canonicalUrl"]).toEqual({
        type: "string",
        format: "uri",
      });
      expect(main.record.required ?? []).not.toContain("canonicalUrl");
    });
  }
});
