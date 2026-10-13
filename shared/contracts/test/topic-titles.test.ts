import { describe, expect, it } from "bun:test";
import {
  TOPIC_TITLES_MESSAGE,
  topicTitlesResponseSchema,
} from "../src/topic-titles";
import { guestScreeningSchema } from "../src/guest-execution";

// What a site is about, for screening a visitor's question: the brain's
// published topics and the owner's own introduction.
describe("the site's subjects for screening", () => {
  it("asks the topics plugin for its public topic titles, bounded", () => {
    expect(TOPIC_TITLES_MESSAGE).toBe("topics:public-titles");
    expect(
      topicTitlesResponseSchema.parse({ titles: ["Ecosystem Architecture"] }),
    ).toEqual({ titles: ["Ecosystem Architecture"] });
    expect(() =>
      topicTitlesResponseSchema.parse({ titles: Array(21).fill("Topic") }),
    ).toThrow();
  });

  it("screens against the topics and the owner's introduction", () => {
    expect(
      guestScreeningSchema.parse({
        topics: ["Ecosystem Architecture"],
        introduction: "I work on how institutions hold what they know.",
      }),
    ).toEqual({
      topics: ["Ecosystem Architecture"],
      introduction: "I work on how institutions hold what they know.",
    });
    expect(() =>
      guestScreeningSchema.parse({
        topics: [],
        introduction: "x".repeat(4001),
      }),
    ).toThrow();
  });
});
