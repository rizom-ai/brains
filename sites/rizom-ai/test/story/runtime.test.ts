import { describe, expect, test } from "bun:test";
import {
  arrivalProgress,
  currentChapter,
  handoverProgress,
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

describe("the handover from the opening to the science", () => {
  test("follows the scroll: nothing at the top of the page, the point when the science's top reaches the reading line, open as far again beyond", () => {
    // 1000px screen, line at 450, the science's top at 1000 at rest: the
    // flip takes 550px of scroll, and a further 550px opens the pyramid.
    expect(handoverProgress(1000, 0, 1000, 450)).toBe(0);
    expect(handoverProgress(1053, 0, 1000, 450)).toBe(0);
    expect(handoverProgress(725, 275, 1000, 450)).toBe(0.5);
    expect(handoverProgress(450, 550, 1000, 450)).toBe(1);
    expect(handoverProgress(175, 825, 1000, 450)).toBe(1.5);
    expect(handoverProgress(-100, 1100, 1000, 450)).toBe(2);
    expect(handoverProgress(-5000, 6000, 1000, 450)).toBe(2);
  });
});

describe("a chapter's arrival from below", () => {
  test("is 0 while its top is below the screen, 1 at the reading line, 2 once it has come as far again", () => {
    expect(arrivalProgress(1000, 1000, 450)).toBe(0);
    expect(arrivalProgress(1200, 1000, 450)).toBe(0);
    expect(arrivalProgress(725, 1000, 450)).toBe(0.5);
    expect(arrivalProgress(450, 1000, 450)).toBe(1);
    expect(arrivalProgress(-100, 1000, 450)).toBe(2);
    expect(arrivalProgress(-5000, 1000, 450)).toBe(2);
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
