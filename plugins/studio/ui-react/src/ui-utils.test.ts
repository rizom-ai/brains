import { expect, test } from "bun:test";
import { optionLabel, sentenceLabel } from "./ui-utils";

test("sentence labels lowercase ordinary words and keep acronyms and brands", () => {
  expect(sentenceLabel("Note")).toBe("note");
  expect(sentenceLabel("Social Post")).toBe("social post");
  expect(sentenceLabel("FAQ")).toBe("FAQ");
  expect(sentenceLabel("LinkedIn Post")).toBe("LinkedIn post");
  expect(sentenceLabel("Ask Content")).toBe("ask content");
});

test("option labels read as words while values stay as stored", () => {
  expect(optionLabel("published")).toBe("Published");
  expect(optionLabel("summary_large_image")).toBe("Summary large image");
  expect(optionLabel("in-review")).toBe("In review");
  expect(optionLabel("GET")).toBe("GET");
});
