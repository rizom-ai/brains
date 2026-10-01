import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { installGlobals, type RestoreGlobals } from "@brains/test-utils";
import { storyRuntimeScript } from "../../src/story/runtime";

// The shipped script runs on its own in the page, so it is tested by running
// it: any name it borrows from the module it was written in fails here.

let window: Window;
let restoreGlobals: RestoreGlobals;
let tops: number[] = [];

function page(options: {
  viewport: number;
  stages: number;
  chapters: number;
  strip?: number;
}): void {
  const figureStyle = options.strip === undefined ? "" : ' style="--strip: 1"';
  window.document.body.innerHTML = `
    <div class="story">
      <div class="chapters">
        ${Array.from(
          { length: options.chapters },
          (_, i) =>
            `<section class="chapter" id="c${i}"><p class="eyebrow">Chapter ${i}</p></section>`,
        ).join("")}
      </div>
      <figure class="figure spec" data-stage="0" data-stages="${options.stages}"${figureStyle}></figure>
    </div>`;
  Object.assign(window, { innerHeight: options.viewport });
  window.document.querySelectorAll(".chapter").forEach((chapter, i) => {
    Object.assign(chapter, {
      getBoundingClientRect: () => ({ top: tops[i] ?? 0 }),
    });
  });
  const figure = window.document.querySelector(".figure");
  Object.assign(figure ?? {}, {
    getBoundingClientRect: () => ({ top: 74, bottom: options.strip ?? 0 }),
  });
  restoreGlobals = installGlobals({
    window,
    document: window.document,
    innerHeight: options.viewport,
    scrollY: 0,
    addEventListener: window.addEventListener.bind(window),
    getComputedStyle: window.getComputedStyle.bind(window),
  });
}

function run(): void {
  // Evaluated as the page evaluates it: a script with no module around it.
  new Function(storyRuntimeScript)();
}

function scrollTo(next: number[]): void {
  tops = next;
  window.dispatchEvent(new window.Event("scroll"));
}

function reading(): {
  stage: string | null | undefined;
  current: string | undefined;
} {
  return {
    stage: window.document.querySelector(".figure")?.getAttribute("data-stage"),
    current: window.document.querySelector(".chapter.is-current")?.id,
  };
}

beforeEach(() => {
  window = new Window({ url: "https://rizom.test/brain" });
  tops = [];
});

afterEach(() => {
  restoreGlobals();
  window.close();
});

describe("the shipped story script", () => {
  test("moves the drawing's stage as the chapters pass the reading line beside it", () => {
    page({ viewport: 1000, stages: 3, chapters: 3 });
    tops = [0, 600, 1400];
    expect(run).not.toThrow();
    expect(reading()).toEqual({ stage: "0", current: "c0" });
    // Line at 45%: the second chapter's top at 440 has passed it.
    scrollTo([-700, 440, 1200]);
    expect(reading()).toEqual({ stage: "1", current: "c1" });
    scrollTo([-1800, -1000, 200]);
    expect(reading()).toEqual({ stage: "2", current: "c2" });
    // And back up.
    scrollTo([-700, 460, 1200]);
    expect(reading()).toEqual({ stage: "0", current: "c0" });
  });

  test("holds the last stage when a page has more chapters than stages", () => {
    page({ viewport: 1000, stages: 2, chapters: 4 });
    tops = [0, 800, 1600, 2400];
    run();
    scrollTo([-2400, -1600, -800, 0]);
    expect(reading()).toEqual({ stage: "1", current: "c3" });
  });

  test("reads just under the strip when the drawing is stacked above the chapters", () => {
    page({ viewport: 844, stages: 3, chapters: 3, strip: 428 });
    tops = [428, 1200, 2000];
    expect(run).not.toThrow();
    // A chapter at the strip's bottom is the one being read, though it is
    // below 45% of the viewport.
    expect(reading()).toEqual({ stage: "0", current: "c0" });
    scrollTo([-400, 428, 1300]);
    expect(reading()).toEqual({ stage: "1", current: "c1" });
  });
});
