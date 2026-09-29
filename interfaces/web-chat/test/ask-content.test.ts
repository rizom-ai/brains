import { describe, expect, test } from "bun:test";
import { publicAskContent } from "../src/ask-content";

describe("public Ask content boundary", () => {
  test("exposes only bounded public copy", () => {
    expect(
      publicAskContent({
        visibility: "public",
        content:
          "---\ntitle: Authored welcome\ntopics: [Authored topic]\n---\nAuthored introduction.",
      }),
    ).toEqual({
      title: "Authored welcome",
      topics: ["Authored topic"],
      introduction: "Authored introduction.",
    });
  });
  test("never exposes private or missing content", () => {
    expect(publicAskContent(null)).toBeUndefined();
    for (const visibility of ["private", "unlisted", "trusted", ""]) {
      expect(
        publicAskContent({ visibility, content: "SECRET" }),
      ).toBeUndefined();
    }
  });
  test("omits malformed content instead of substituting prose", () => {
    expect(
      publicAskContent({
        visibility: "public",
        content: "---\ntopics: invalid\n---",
      }),
    ).toBeUndefined();
    expect(
      publicAskContent({ visibility: "public", content: "x".repeat(4001) }),
    ).toBeUndefined();
    expect(publicAskContent({ visibility: "public", content: "" })).toEqual({});
  });
});
