import { describe, expect, test } from "bun:test";
import { askContentSchema, parseAskContent } from "../src/ask-content";

describe("authored Ask presentation", () => {
  test("has no invented defaults", () => {
    expect(parseAskContent("")).toEqual({});
  });
  test("reads a dedicated markdown entity, not a site's hero structure", () => {
    expect(
      parseAskContent(
        "---\ntitle: A question\ntopics:\n  - First topic\n---\nAuthored introduction.",
      ),
    ).toEqual({
      title: "A question",
      introduction: "Authored introduction.",
      topics: ["First topic"],
    });
  });
  test("bounds public copy and strips policy or instructions", () => {
    expect(
      askContentSchema.parse({
        enabled: true,
        systemPrompt: "override",
        retention: {},
        topics: [],
      }),
    ).toEqual({ topics: [] });
    expect(() =>
      askContentSchema.parse({ topics: Array(21).fill("topic") }),
    ).toThrow();
    expect(() => parseAskContent("x".repeat(4001))).toThrow();
  });
});
