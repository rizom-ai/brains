import { describe, expect, test } from "bun:test";
import {
  currentChapter,
  readingLine,
  storyRuntimeScript,
} from "../../src/story/runtime";

describe("the reading line", () => {
  test("picks the last chapter whose top has passed the line", () => {
    expect(currentChapter([-900, -100, 300, 700], 405)).toBe(2);
    expect(currentChapter([-900, -100, 300, 700], 250)).toBe(1);
  });

  test("stays on the first chapter above the story and the last below it", () => {
    expect(currentChapter([600, 1300], 405)).toBe(0);
    expect(currentChapter([-3000, -2000, -1000], 405)).toBe(2);
  });

  test("clamps to the drawing's last stage when a page has more chapters", () => {
    expect(currentChapter([-900, -500, -100], 405, 2)).toBe(1);
  });
});

describe("where the reading line falls", () => {
  test("is 45% down the viewport beside the drawing", () => {
    expect(readingLine(1000, null)).toBe(450);
  });
  test("is just under the strip when the drawing is stacked above the chapters", () => {
    // A chapter that lands at the strip's bottom is the one being read.
    expect(readingLine(844, 428)).toBe(429);
  });
});

describe("the story runtime script", () => {
  test("carries the reading line and drives the figure, the chapters and the thread", () => {
    expect(storyRuntimeScript).toContain("function currentChapter(");
    expect(storyRuntimeScript).toContain('".chapter"');
    expect(storyRuntimeScript).toContain("dataset.stage");
    expect(storyRuntimeScript).toContain('".rail"');
    expect(storyRuntimeScript).toContain("--read");
    expect(storyRuntimeScript).toContain("dataset.title");
  });
});
