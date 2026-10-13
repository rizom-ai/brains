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
] as const;

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
